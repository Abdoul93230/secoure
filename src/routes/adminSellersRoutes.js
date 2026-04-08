const express = require('express');
const router = express.Router();
const { 
  getSubscriptionStats,
  renewSubscription,
  changePlan,
  sendExpirationReminder,
  PLAN_DEFAULTS
} = require('../controllers/subscriptionController');
const { PricingPlan, SellerRequest } = require('../Models');
const { suspendSellerProducts, restoreSellerProductsIfEligible } = require('../utils/sellerProductSync');
const { features } = require('process');

const findValidActivePlan = async (sellerId) => {
  return PricingPlan.findOne({
    storeId: sellerId,
    status: { $in: ['active', 'trial'] },
    endDate: { $gte: new Date() }
  }).sort({ createdAt: -1 });
};

// Middleware d'authentification admin (à adapter selon votre système)
const requireAdmin = (req, res, next) => {
  // Vérifier si l'utilisateur est admin
  // Cette logique dépend de votre système d'authentification
  const userRole = req.user?.role; // ou selon votre implémentation
  
  if (userRole !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Accès non autorisé'
    });
  }
  
  next();
};

/**
 * 🆕 GESTION DE LA VALIDATION DES COMPTES VENDEURS
 */

/**
 * Lister les vendeurs en attente de validation
 */
router.get('/pending-validation', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    
    let query = { isvalid: false };
    
    // Recherche par nom/email/boutique
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { storeName: new RegExp(search, 'i') },
        { phone: new RegExp(search, 'i') }
      ];
    }

    const pendingSellers = await SellerRequest.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('name email storeName phone businessPhone ownerIdentity logo storeDescription category region city createdAt suspensionReason accountCreatedAt');

    const total = await SellerRequest.countDocuments(query);

    const sellersWithInfo = pendingSellers.map(seller => ({
      ...seller.toObject(),
      waitingDays: Math.floor((new Date() - new Date(seller.createdAt)) / (1000 * 60 * 60 * 24)),
      hasDocuments: !!(seller.ownerIdentity),
      hasLogo: !!(seller.logo),
      status: seller.suspensionReason ? 'suspended' : 'pending'
    }));

    res.json({
      status: 'success',
      data: {
        sellers: sellersWithInfo,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          count: pendingSellers.length,
          totalPending: total
        }
      }
    });

  } catch (error) {
    console.error('Erreur récupération vendeurs en attente:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération des vendeurs',
      error: error.message
    });
  }
});

/**
 * Valider un compte vendeur
 */
router.post('/validate-seller/:sellerId', requireAdmin, async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { validationNotes, sendNotification = true } = req.body;

    const seller = await SellerRequest.findById(sellerId);
    if (!seller) {
      return res.status(404).json({
        status: 'error',
        message: 'Vendeur non trouvé'
      });
    }

    if (seller.isvalid) {
      return res.status(400).json({
        status: 'error',
        message: 'Ce vendeur est déjà validé'
      });
    }

    const activePlan = await findValidActivePlan(sellerId);
    if (!activePlan) {
      return res.status(403).json({
        status: 'error',
        message: 'Activation impossible: aucun abonnement actif valide pour ce vendeur'
      });
    }

    // Valider le compte
    await SellerRequest.findByIdAndUpdate(sellerId, {
      isvalid: true,
      subscriptionStatus: activePlan.status,
      validatedAt: new Date(),
      validatedBy: req.user?.id, // ID de l'admin qui valide
      validationNotes,
      suspensionReason: null // Supprimer toute suspension
    });

    // Envoyer notification si demandé
    if (sendNotification) {
      // TODO: Implémenter l'envoi d'email de validation
      console.log(`📧 Email de validation à envoyer à ${seller.email}`);
    }

    res.json({
      status: 'success',
      message: `Compte de ${seller.storeName} validé avec succès`,
      data: {
        sellerId,
        validatedAt: new Date(),
        storeName: seller.storeName
      }
    });

  } catch (error) {
    console.error('Erreur validation vendeur:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la validation',
      error: error.message
    });
  }
});

/**
 * Suspendre un compte vendeur
 */
router.post('/suspend-seller/:sellerId', requireAdmin, async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { reason, sendNotification = true } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'La raison de la suspension est obligatoire'
      });
    }

    const seller = await SellerRequest.findById(sellerId);
    if (!seller) {
      return res.status(404).json({
        status: 'error',
        message: 'Vendeur non trouvé'
      });
    }

    // Suspendre le compte
    await SellerRequest.findByIdAndUpdate(sellerId, {
      isvalid: false,
      subscriptionStatus: 'suspended',
      suspensionReason: reason,
      suspensionDate: new Date(),
      suspendedBy: req.user?.id
    });

    await suspendSellerProducts(sellerId, 'admin_suspension');

    // Envoyer notification si demandé
    if (sendNotification) {
      console.log(`📧 Email de suspension à envoyer à ${seller.email}: ${reason}`);
    }

    res.json({
      status: 'success',
      message: `Compte de ${seller.storeName} suspendu`,
      data: {
        sellerId,
        reason,
        suspendedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Erreur suspension vendeur:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la suspension',
      error: error.message
    });
  }
});

/**
 * Réactiver un compte suspendu
 */
router.post('/reactivate-seller/:sellerId', requireAdmin, async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { reactivationNotes } = req.body;

    const seller = await SellerRequest.findById(sellerId);
    if (!seller) {
      return res.status(404).json({
        status: 'error',
        message: 'Vendeur non trouvé'
      });
    }

    if (seller.isvalid && !seller.suspensionReason) {
      return res.status(400).json({
        status: 'error',
        message: 'Ce compte est déjà actif'
      });
    }

    const activePlan = await PricingPlan.findOne({
      storeId: sellerId,
      status: { $in: ['active', 'trial'] },
      endDate: { $gte: new Date() }
    }).sort({ createdAt: -1 });

    if (!activePlan) {
      return res.status(403).json({
        status: 'error',
        message: 'Réactivation impossible: aucun abonnement actif valide pour ce vendeur'
      });
    }

    // Réactiver le compte
    await SellerRequest.findByIdAndUpdate(sellerId, {
      isvalid: true,
      subscriptionStatus: activePlan.status,
      suspensionReason: null,
      suspensionDate: null,
      reactivatedAt: new Date(),
      reactivatedBy: req.user?.id,
      reactivationNotes
    });

    await restoreSellerProductsIfEligible(sellerId);

    res.json({
      status: 'success',
      message: `Compte de ${seller.storeName} réactivé avec succès`,
      data: {
        sellerId,
        reactivatedAt: new Date(),
        storeName: seller.storeName
      }
    });

  } catch (error) {
    console.error('Erreur réactivation vendeur:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la réactivation',
      error: error.message
    });
  }
});

/**
 * Dashboard - Statistiques générales
 */
router.get('/dashboard-stats', requireAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const stats = await getSubscriptionStats(days);
    
    res.json({
      status: 'success',
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors du calcul des statistiques',
      error: error.message
    });
  }
});

/**
 * Gestion des abonnements - Liste avec filtres
 */
router.get('/subscriptions', requireAdmin, async (req, res) => {
  try {
    const { status, plan, search, expiring } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Construction de la requête de filtrage
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (plan && plan !== 'all') {
      query.planType = plan;
    }
    
    if (expiring === 'true') {
      const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      query.endDate = { $gte: new Date(), $lte: in7Days };
      query.status = 'active';
    }

    // Pipeline d'agrégation pour joindre les données du vendeur
    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: 'sellerrequests',
          localField: 'storeId',
          foreignField: '_id',
          as: 'seller'
        }
      },
      { $unwind: '$seller' },
      {
        $match: search ? {
          $or: [
            { 'seller.storeName': { $regex: search, $options: 'i' } },
            { 'seller.email': { $regex: search, $options: 'i' } },
            { 'seller.name': { $regex: search, $options: 'i' } }
          ]
        } : {}
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          planType: 1,
          status: 1,
          startDate: 1,
          endDate: 1,
          price: 1,
          commission: 1,
          storeName: '$seller.storeName',
          ownerName: '$seller.name',
          ownerEmail: '$seller.email',
          features: 1,
          createdAt: 1
        }
      }
    ];

    const subscriptions = await PricingPlan.aggregate(pipeline);
    const total = await PricingPlan.countDocuments(query);

    res.json({
      status: 'success',
      data: {
        subscriptions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération des abonnements',
      error: error.message
    });
  }
});

/**
 * Modifier le statut d'un abonnement
 */
router.put('/subscriptions/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['active', 'suspended', 'expired'].includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Statut invalide'
      });
    }

    const subscription = await PricingPlan.findByIdAndUpdate(
      id,
      { status, statusChangedAt: new Date() },
      { new: true }
    );

    if (!subscription) {
      return res.status(404).json({
        status: 'error',
        message: 'Abonnement non trouvé'
      });
    }

    if (status === 'active' && new Date(subscription.endDate) < new Date()) {
      return res.status(400).json({
        status: 'error',
        message: 'Impossible d\'activer un abonnement expiré'
      });
    }

    // Mettre à jour le statut du vendeur correspondant
    await SellerRequest.findByIdAndUpdate(subscription.storeId, {
      subscriptionStatus: status,
      isvalid: status === 'active',
      suspensionReason: status === 'active' ? null : 'Suspension definie par administration',
      suspensionDate: status === 'active' ? null : new Date()
    });

    if (status === 'active') {
      await restoreSellerProductsIfEligible(subscription.storeId);
    } else {
      await suspendSellerProducts(subscription.storeId, `admin_subscription_${status}`);
    }

    res.json({
      status: 'success',
      message: 'Statut mis à jour avec succès',
      data: subscription
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la modification du statut',
      error: error.message
    });
  }
});

/**
 * Envoyer un rappel manuel de renouvellement
 */
router.post('/subscriptions/:id/remind', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const subscription = await PricingPlan.findById(id).populate('storeId');
    if (!subscription) {
      return res.status(404).json({
        status: 'error',
        message: 'Abonnement non trouvé'
      });
    }

    const daysUntilExpiry = Math.ceil((new Date(subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24));
    await sendExpirationReminder(subscription, Math.max(daysUntilExpiry, 1));

    res.json({
      status: 'success',
      message: 'Rappel envoyé avec succès'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de l\'envoi du rappel',
      error: error.message
    });
  }
});

/**
 * Configuration des plans - Lire les templates
 */
router.get('/plan-templates', requireAdmin, async (req, res) => {
  try {
    // Retourner les plans par défaut avec les statistiques d'utilisation
    const plansWithStats = await Promise.all(
      Object.entries(PLAN_DEFAULTS).map(async ([name, config]) => {
        const subscriberCount = await PricingPlan.countDocuments({ 
          planType: name, 
          status: 'active' 
        });
        
        return {
          id: name.toLowerCase(),
          name,
          ...config,
          subscriberCount
        };
      })
    );

    res.json({
      status: 'success',
      data: { plans: plansWithStats }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération des plans',
      error: error.message
    });
  }
});

/**
 * Configuration des plans - Créer un nouveau plan template
 */
router.post('/plan-templates', requireAdmin, async (req, res) => {
  try {
    const planData = req.body;
    
    // Validation basique
    if (!planData.name || !planData.price || !planData.commission) {
      return res.status(400).json({
        status: 'error',
        message: 'Données de plan incomplètes'
      });
    }

    // Dans un vrai système, vous stockeriez ceci dans une base de données
    // Pour l'instant, on simule une sauvegarde réussie
    console.log('Nouveau plan créé:', planData);

    res.json({
      status: 'success',
      message: 'Plan créé avec succès',
      data: { id: Date.now().toString(), ...planData }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la création du plan',
      error: error.message
    });
  }
});

/**
 * Configuration des plans - Modifier un plan template
 */
router.put('/plan-templates/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const planData = req.body;
    
    // Dans un vrai système, vous modifieriez le plan dans la base de données
    console.log('Plan modifié:', id, planData);

    res.json({
      status: 'success',
      message: 'Plan mis à jour avec succès',
      data: { id, ...planData }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la modification du plan',
      error: error.message
    });
  }
});

/**
 * Configuration des plans - Supprimer un plan template
 */
router.delete('/plan-templates/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Vérifier s'il y a des abonnements actifs avec ce plan
    const activeSubscriptions = await PricingPlan.countDocuments({
      planType: id,
      status: 'active'
    });

    if (activeSubscriptions > 0) {
      return res.status(400).json({
        status: 'error',
        message: `Impossible de supprimer: ${activeSubscriptions} abonnements actifs utilisent ce plan`
      });
    }

    // Dans un vrai système, vous supprimeriez le plan de la base de données
    console.log('Plan supprimé:', id);

    res.json({
      status: 'success',
      message: 'Plan supprimé avec succès'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la suppression du plan',
      error: error.message
    });
  }
});

/**
 * Renouveler manuellement un abonnement (pour le support)
 */
router.post('/subscriptions/:id/renew', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { billingCycle = 'monthly' } = req.body;
    
    const renewedSubscription = await renewSubscription(id, billingCycle);
    
    res.json({
      status: 'success',
      message: 'Abonnement renouvelé avec succès',
      data: renewedSubscription
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors du renouvellement',
      error: error.message
    });
  }
});

/**
 * Changer le plan d'un vendeur
 */
router.put('/subscriptions/:id/plan', requireAdmin, async (req, res) => {
  try {
    const subscription = await PricingPlan.findById(req.params.id);
    if (!subscription) {
      return res.status(404).json({
        status: 'error',
        message: 'Abonnement non trouvé'
      });
    }

    const { newPlanType } = req.body;
    const updatedSubscription = await changePlan(subscription.storeId, newPlanType);
    
    res.json({
      status: 'success',
      message: 'Plan modifié avec succès',
      data: updatedSubscription
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors du changement de plan',
      error: error.message
    });
  }
});

/**
 * Export des données d'abonnement
 */
router.get('/subscriptions/export', requireAdmin, async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    
    const subscriptions = await PricingPlan.aggregate([
      {
        $lookup: {
          from: 'sellerrequests',
          localField: 'storeId',
          foreignField: '_id',
          as: 'seller'
        }
      },
      { $unwind: '$seller' },
      {
        $project: {
          planType: 1,
          status: 1,
          startDate: 1,
          endDate: 1,
          'price.monthly': 1,
          commission: 1,
          storeName: '$seller.storeName',
          ownerEmail: '$seller.email',
          createdAt: 1
        }
      }
    ]);

    if (format === 'csv') {
      // Conversion en CSV (vous pourriez utiliser une bibliothèque comme csv-writer)
      const csv = subscriptions.map(sub => 
        Object.values(sub).join(',')
      ).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=subscriptions.csv');
      res.send(csv);
    } else {
      res.json({
        status: 'success',
        data: subscriptions
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de l\'export',
      error: error.message
    });
  }
});

module.exports = router;