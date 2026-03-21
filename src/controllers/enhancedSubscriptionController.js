const { SellerRequest, PricingPlan } = require("../Models");
const SubscriptionHistory = require("../models/Abonnements/SubscriptionHistory");
const SubscriptionRequest = require("../models/Abonnements/SubscriptionRequest");
const SubscriptionQueue = require("../models/Abonnements/SubscriptionQueue");
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const crypto = require('crypto');
const { suspendSellerProducts, restoreSellerProductsIfEligible } = require('../utils/sellerProductSync');

// Configuration des numéros de paiement pour le Niger
const PAYMENT_CONFIG = {
  mynita: {
    phone: "+22790123456", // Remplacez par votre vrai numéro
    name: "iHambaObab Mynita"
  },
  aman: {
    phone: "+22798765432", // Remplacez par votre vrai numéro  
    name: "iHambaObab Aman"
  },
  airtel_money: {
    phone: "+22787654321", // Remplacez par votre vrai numéro
    name: "iHambaObab Airtel Money"
  },
  orange_money: {
    phone: "+22776543210", // Remplacez par votre vrai numéro
    name: "iHambaObab Orange Money"
  }
};

const PLAN_DEFAULTS = {
  Starter: {
    price: { monthly: 2500, annual: 27000 },
    commission: 6,
    productLimit: 10,
    features: {
      productManagement: {
        maxProducts: 10,
        maxVariants: 3,
        maxCategories: 5,
        catalogImport: false,
      },
      paymentOptions: {
        manualPayment: true,
        mobileMoney: true,
        cardPayment: false,
        customPayment: false,
      },
      support: {
        responseTime: 48,
        channels: ["email"],
        onboarding: "standard",
      },
      marketing: {
        marketplaceVisibility: "standard",
        maxActiveCoupons: 1,
        emailMarketing: false,
        abandonedCartRecovery: false,
      },
    },
  },
  Pro: {
    price: { monthly: 4500, annual: 48600 },
    commission: 3.5,
    productLimit: -1,
    features: {
      productManagement: {
        maxProducts: -1,
        maxVariants: 10,
        maxCategories: 20,
        catalogImport: true,
      },
      paymentOptions: {
        manualPayment: true,
        mobileMoney: true,
        cardPayment: true,
        customPayment: false,
      },
      support: {
        responseTime: 24,
        channels: ["email", "chat"],
        onboarding: "personnalisé",
      },
      marketing: {
        marketplaceVisibility: "prioritaire",
        maxActiveCoupons: 5,
        emailMarketing: true,
        abandonedCartRecovery: false,
      },
    },
  },
  Business: {
    price: { monthly: 9000, annual: 97200 },
    commission: 2.5,
    productLimit: -1,
    features: {
      productManagement: {
        maxProducts: -1,
        maxVariants: -1,
        maxCategories: -1,
        catalogImport: true,
      },
      paymentOptions: {
        manualPayment: true,
        mobileMoney: true,
        cardPayment: true,
        customPayment: true,
      },
      support: {
        responseTime: 12,
        channels: ["email", "chat", "phone", "vip"],
        onboarding: "VIP",
      },
      marketing: {
        marketplaceVisibility: "premium",
        maxActiveCoupons: -1,
        emailMarketing: true,
        abandonedCartRecovery: true,
      },
    },
  },
};

/**
 * Générer un code de réactivation unique
 */
const generateReactivationCode = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

/**
 * Nettoyer le PricingPlan lié à une demande non finalisée
 */
const cleanupLinkedQueuedSubscription = async (request) => {
  try {
    if (!request?.linkedSubscriptionId) return;

    const linkedPlan = await PricingPlan.findById(request.linkedSubscriptionId).lean();
    if (linkedPlan && ['queued', 'pending_activation'].includes(linkedPlan.status)) {
      await SubscriptionRequest.findByIdAndUpdate(request._id, {
        archivedPlan: {
          planId: linkedPlan._id,
          planType: linkedPlan.planType,
          status: linkedPlan.status,
          startDate: linkedPlan.startDate,
          endDate: linkedPlan.endDate,
          billingCycle: linkedPlan.billingCycle,
          subscriptionType: linkedPlan.subscriptionType,
          queuePosition: linkedPlan.queuePosition,
          invoiceNumber: linkedPlan.invoiceNumber,
          price: linkedPlan.price,
          commission: linkedPlan.commission,
          archivedAt: new Date(),
          archivedReason: 'linked_pricing_plan_cleanup'
        }
      });

      await PricingPlan.findByIdAndDelete(request.linkedSubscriptionId);
    }

    await SubscriptionQueue.findOneAndUpdate(
      { storeId: request.storeId },
      {
        $pull: { queuedSubscriptions: { subscriptionId: request.linkedSubscriptionId } },
        lastUpdated: new Date()
      }
    );
  } catch (error) {
    console.error('Erreur nettoyage abonnement lié:', error);
  }
};

/**
 * Créer un abonnement avec historique complet
 */
const createSubscriptionWithHistory = async (sellerId, planType = 'Starter', performedBy = 'system', adminId = null, notes = '') => {
  try {
    const planDefaults = PLAN_DEFAULTS[planType];
    if (!planDefaults) {
      throw new Error('Type de plan invalide');
    }

    // Calculer les dates
    let startDate = new Date();
    let endDate = new Date();
    
    if (planType === 'Starter') {
      // 3 mois gratuits pour le plan Starter
      endDate.setMonth(endDate.getMonth() + 3);
    } else {
      // 1 mois pour les autres plans
      endDate.setMonth(endDate.getMonth() + 1);
    }

    // Créer l'abonnement
    const subscription = new PricingPlan({
      storeId: sellerId,
      planType,
      ...planDefaults,
      status: 'active',
      startDate,
      endDate,
      isTrialPeriod: planType === 'Starter',
      invoiceNumber: `INV-${Date.now()}-${sellerId.toString().slice(-6)}`
    });

    await subscription.save();

    // Créer l'entrée dans l'historique
    const historyEntry = new SubscriptionHistory({
      storeId: sellerId,
      subscriptionId: subscription._id,
      actionType: 'created',
      actionDetails: {
        performedBy,
        adminId,
        notes,
        newPlan: {
          planType,
          price: planDefaults.price,
          commission: planDefaults.commission,
          startDate,
          endDate
        }
      },
      periodStart: startDate,
      periodEnd: endDate,
      invoiceNumber: subscription.invoiceNumber,
      billingCycle: 'monthly'
    });

    await historyEntry.save();

    // Mettre à jour le vendeur
    await SellerRequest.findByIdAndUpdate(sellerId, {
      subscriptionId: subscription._id,
      subscriptionStatus: 'active',
      isvalid: true,
      suspensionReason: null,
      suspensionDate: null
    });

    await restoreSellerProductsIfEligible(sellerId);

    return { subscription, history: historyEntry };

  } catch (error) {
    console.error('Erreur création abonnement avec historique:', error);
    throw error;
  }
};

/**
 * Créer un renouvellement manuel avec code de réactivation
 */
const createManualRenewal = async (storeId, planType, billingCycle = 'monthly', adminId, notes = '') => {
  try {
    const seller = await SellerRequest.findById(storeId);
    if (!seller) {
      throw new Error('Vendeur non trouvé');
    }

    const planDefaults = PLAN_DEFAULTS[planType];
    const amount = billingCycle === 'annual' ? planDefaults.price.annual : planDefaults.price.monthly;
    
    // Générer le code de réactivation
    const reactivationCode = generateReactivationCode();
    
    // Calculer la date d'expiration du code (7 jours)
    const codeExpiresAt = new Date();
    codeExpiresAt.setDate(codeExpiresAt.getDate() + 7);

    // Créer le nouvel abonnement (inactif jusqu'à l'activation du code)
    const newEndDate = new Date();
    const months = billingCycle === 'annual' ? 12 : 1;
    newEndDate.setMonth(newEndDate.getMonth() + months);

    const newSubscription = new PricingPlan({
      storeId,
      planType,
      ...planDefaults,
      status: 'active',
      startDate: new Date(),
      endDate: newEndDate,
      billingCycle,
      subscriptionType: billingCycle === "monthly" ? "paid_monthly" : "paid_annual",
      invoiceNumber: `INV-${Date.now()}-${storeId.toString().slice(-6)}`,
      reactivationCode: {
        code: reactivationCode,
        expiresAt: codeExpiresAt
      }
    });

    await newSubscription.save();

    // Créer l'historique
    const historyEntry = new SubscriptionHistory({
      storeId,
      subscriptionId: newSubscription._id,
      actionType: 'renewed',
      actionDetails: {
        performedBy: 'admin',
        adminId,
        notes: `Renouvellement manuel créé. ${notes}`,
        newPlan: {
          planType,
          price: planDefaults.price,
          commission: planDefaults.commission,
          startDate: new Date(),
          endDate: newEndDate
        }
      },
      reactivationCode: {
        code: reactivationCode,
        used: false,
        expiresAt: codeExpiresAt
      },
      periodStart: new Date(),
      periodEnd: newEndDate,
      invoiceNumber: newSubscription.invoiceNumber,
      billingCycle:billingCycle==="monthly"?"paid_monthly":"paid_annual"
    });

    await historyEntry.save();

    return {
      subscription: newSubscription,
      reactivationCode,
      history: historyEntry,
      expiresAt: codeExpiresAt
    };

  } catch (error) {
    console.error('Erreur création renouvellement manuel:', error);
    throw error;
  }
};

/**
 * Activer un abonnement avec le code de réactivation
 */
const activateWithCode = async (storeId, reactivationCode) => {
  try {
    // Trouver l'historique avec ce code
    const historyEntry = await SubscriptionHistory.findOne({
      storeId,
      'reactivationCode.code': reactivationCode,
      'reactivationCode.used': false,
      'reactivationCode.expiresAt': { $gt: new Date() }
    });

    if (!historyEntry) {
      return {
        success: false,
        message: 'Code invalide ou expiré'
      };
    }

    // Activer l'abonnement
    const subscription = await PricingPlan.findByIdAndUpdate(
      historyEntry.subscriptionId,
      { 
        status: 'active',
        activatedAt: new Date()
      },
      { new: true }
    );

    // Marquer le code comme utilisé
    historyEntry.reactivationCode.used = true;
    historyEntry.reactivationCode.usedAt = new Date();
    await historyEntry.save();

    // Réactiver le vendeur
    await SellerRequest.findByIdAndUpdate(storeId, {
      subscriptionId: subscription._id,
      subscriptionStatus: 'active',
      isvalid: true,
      suspensionReason: null,
      suspensionDate: null,
      reactivatedAt: new Date()
    });

    await restoreSellerProductsIfEligible(storeId);

    // 5. Mettre à jour SubscriptionQueue
    await SubscriptionQueue.findOneAndUpdate(
      { storeId },
      {
        activeSubscriptionId: subscription._id,
        accountStatus: 'active',
        lastUpdated: new Date()
      },
      { new: true, upsert: true } // si pas trouvé, on crée
    );

    // Ajouter une nouvelle entrée d'historique
    const reactivationHistory = new SubscriptionHistory({
      storeId,
      subscriptionId: subscription._id,
      actionType: 'reactivated',
      actionDetails: {
        performedBy: 'seller',
        notes: `Compte réactivé avec le code: ${reactivationCode}`
      },
      periodStart: subscription.startDate,
      periodEnd: subscription.endDate
    });

    await reactivationHistory.save();

    



    return {
      success: true,
      message: 'Compte réactivé avec succès',
      subscription
    };

  } catch (error) {
    console.error('Erreur activation avec code:', error);
    return {
      success: false,
      message: 'Erreur lors de l\'activation'
    };
  }
};

/**
 * Créer une demande d'abonnement par le vendeur
 */
const createSubscriptionRequest = async (storeId, planType, billingCycle = 'monthly', paymentMethod) => {
  try {
    const seller = await SellerRequest.findById(storeId);
    if (!seller) {
      throw new Error('Vendeur non trouvé');
    }

    // Vérifier si une demande est déjà en cours (y compris rejetée)
    const existingRequest = await SubscriptionRequest.findOne({
      storeId,
      status: { $in: ['pending_payment', 'payment_submitted', 'payment_verified', 'rejected', 'cancelled'] }
    });

    if (existingRequest) {
      const statusMessages = {
        'pending_payment': 'Une demande est en attente de paiement',
        'payment_submitted': 'Une demande est en cours de vérification',
        'payment_verified': 'Une demande est en cours d\'activation',
        'rejected': 'Une demande rejetée doit être corrigée ou annulée avant d\'en créer une nouvelle'
      };
      
      return {
        success: false,
        message: statusMessages[existingRequest.status] || 'Une demande d\'abonnement est déjà en cours',
        existingRequestId: existingRequest._id,
        existingStatus: existingRequest.status
      };
    }

    const planDefaults = PLAN_DEFAULTS[planType];
    const amount = billingCycle === 'annual' ? planDefaults.price.annual : planDefaults.price.monthly;
    
    const paymentConfig = PAYMENT_CONFIG[paymentMethod];
    if (!paymentConfig) {
      throw new Error('Méthode de paiement non supportée');
    }

    // Créer la demande
    const request = new SubscriptionRequest({
      storeId,
      requestedPlan: {
        planType,
        billingCycle
      },
      paymentDetails: {
        method: paymentMethod,
        amount,
        recipientPhone: paymentConfig.phone
      }
    });

    await request.save();

    return {
      success: true,
      message: 'Demande d\'abonnement créée',
      data: {
        requestId: request._id,
        amount,
        recipientPhone: paymentConfig.phone,
        recipientName: paymentConfig.name,
        paymentDeadline: request.paymentDetails.paymentDeadline,
        instructions: `Envoyez ${amount} FCFA au ${paymentConfig.phone} (${paymentConfig.name}) et soumettez le code de confirmation.`
      }
    };

  } catch (error) {
    console.error('Erreur création demande abonnement:', error);
    throw error;
  }
};

/**
 * Annuler une demande d'abonnement (pour les demandes rejetées ou en attente)
 */
const cancelSubscriptionRequest = async (requestId, storeId) => {
  try {
    const request = await SubscriptionRequest.findOne({
      _id: requestId,
      storeId: storeId
    });

    if (!request) {
      throw new Error('Demande non trouvée');
    }

    // Seules les demandes rejetées ou en attente peuvent être annulées
    if (!['rejected', 'pending_payment'].includes(request.status)) {
      throw new Error('Cette demande ne peut pas être annulée');
    }

    await cleanupLinkedQueuedSubscription(request);

    // Si il y a un fichier reçu, le supprimer de Cloudinary
    if (request.paymentDetails?.receiptFile) {
      try {
        const cloudinary = require('cloudinary').v2;
        const matches = request.paymentDetails.receiptFile.match(/\/payment-receipts\/([^\.]+)/);
        if (matches && matches[1]) {
          const publicId = `payment-receipts/${matches[1]}`;
          await cloudinary.uploader.destroy(publicId);
          console.log('✅ DEBUG - Fichier supprimé lors de l\'annulation:', publicId);
        }
      } catch (error) {
        console.error('⚠️ Erreur suppression fichier lors annulation:', error.message);
      }
    }

    // Marquer comme annulée
    await SubscriptionRequest.findByIdAndUpdate(requestId, {
      status: 'cancelled',
      cancelledAt: new Date()
    });

    return {
      success: true,
      message: 'Demande annulée avec succès'
    };

  } catch (error) {
    console.error('Erreur annulation demande:', error);
    throw error;
  }
};

/**
 * Soumettre la preuve de paiement
 */
const submitPaymentProof = async (requestId, transferCode, receiptFile = null, senderPhone) => {
  try {
    const request = await SubscriptionRequest.findById(requestId);
    if (!request) {
      throw new Error('Demande non trouvée');
    }

    // Permettre la modification pour les demandes en attente de paiement ou rejetées
    if (!['pending_payment', 'rejected','payment_submitted'].includes(request.status)) {
      throw new Error('Cette demande ne peut plus être modifiée');
    }

    // Vérifier la date limite
    if (new Date() > request.paymentDetails.paymentDeadline) {
      await cleanupLinkedQueuedSubscription(request);
      await SubscriptionRequest.findByIdAndUpdate(requestId, { status: 'cancelled' });
      throw new Error('La date limite de paiement est dépassée');
    }

    // Si un nouveau fichier est fourni et qu'il y a un ancien fichier, supprimer l'ancien de Cloudinary
    if (receiptFile && request.paymentDetails.receiptFile) {
      try {
        // Extraire le public_id de l'ancienne URL Cloudinary
        const oldUrl = request.paymentDetails.receiptFile;
        const matches = oldUrl.match(/\/payment-receipts\/([^\.]+)/);
        if (matches && matches[1]) {
          const publicId = `payment-receipts/${matches[1]}`;
          console.log('🗑️ DEBUG - Suppression ancien fichier Cloudinary:', publicId);
          
          // Supprimer de Cloudinary
          const cloudinary = require('cloudinary').v2;
          await cloudinary.uploader.destroy(publicId);
          console.log('✅ DEBUG - Ancien fichier supprimé de Cloudinary');
        }
      } catch (error) {
        console.error('⚠️ Erreur suppression ancien fichier Cloudinary:', error.message);
        // Ne pas bloquer l'opération si la suppression échoue
      }
    }

    // Mettre à jour la demande
    await SubscriptionRequest.findByIdAndUpdate(requestId, {
      status: 'payment_submitted',
      'paymentDetails.transferCode': transferCode,
      'paymentDetails.receiptFile': receiptFile,
      'paymentDetails.senderPhone': senderPhone,
      'paymentDetails.submittedAt': new Date()
    });

    return {
      success: true,
      message: 'Preuve de paiement soumise. En attente de vérification administrative.'
    };

  } catch (error) {
    console.error('Erreur soumission preuve paiement:', error);
    throw error;
  }
};

/**
 * Vérifier un paiement (Admin)
 */
const verifyPayment = async (requestId, adminId, isApproved, verificationNotes = '') => {
  try {
    const request = await SubscriptionRequest.findById(requestId).populate('storeId');
    if (!request) {
      throw new Error('Demande non trouvée');
    }

    // Sécurité métier: ne jamais valider/rejeter une demande après sa date limite
    const now = new Date();
    if (request?.paymentDetails?.paymentDeadline && now > new Date(request.paymentDetails.paymentDeadline)) {
      await cleanupLinkedQueuedSubscription(request);
      await SubscriptionRequest.findByIdAndUpdate(requestId, {
        status: 'cancelled',
        cancelledAt: now,
        processedAt: now,
        'adminVerification.verificationNotes':
          verificationNotes || 'Demande expirée automatiquement avant traitement admin'
      });
      throw new Error('Demande expirée: validation impossible');
    }

    if (request.status !== 'payment_submitted') {
      throw new Error('Cette demande n\'est pas en attente de vérification');
    }

    if (isApproved) {
      // Paiement approuvé - créer l'abonnement
      const result = await createSubscriptionWithHistory(
        request.storeId._id,
        request.requestedPlan.planType,
        'admin',
        adminId,
        `Abonnement créé suite à la demande ${requestId}`
      );

      // Mettre à jour la demande
      await SubscriptionRequest.findByIdAndUpdate(requestId, {
        status: 'activated',
        processedAt: new Date(),
        'adminVerification.verifiedBy': adminId,
        'adminVerification.verifiedAt': new Date(),
        'adminVerification.verificationNotes': verificationNotes
      });

      // Ajouter dans l'historique de l'abonnement
      await SubscriptionHistory.findByIdAndUpdate(result.history._id, {
        'paymentInfo.paymentStatus': 'verified',
        'paymentInfo.verifiedBy': adminId,
        'paymentInfo.verifiedAt': new Date(),
        'paymentInfo.transferCode': request.paymentDetails.transferCode,
        'paymentInfo.method': request.paymentDetails.method,
        'paymentInfo.amount': request.paymentDetails.amount
      });

      return {
        success: true,
        message: 'Paiement vérifié et abonnement activé',
        subscription: result.subscription
      };

    } else {
      // Paiement rejeté
      await cleanupLinkedQueuedSubscription(request);
      await SubscriptionRequest.findByIdAndUpdate(requestId, {
        status: 'rejected',
        processedAt: new Date(),
        'adminVerification.verifiedBy': adminId,
        'adminVerification.verifiedAt': new Date(),
        'adminVerification.rejectionReason': verificationNotes
      });

      return {
        success: true,
        message: 'Paiement rejeté',
        rejected: true
      };
    }

  } catch (error) {
    console.error('Erreur vérification paiement:', error);
    throw error;
  }
};

/**
 * Bloquer automatiquement les comptes expirés après 48h
 */
const blockExpiredAccounts = async () => {
  try {
    const now = new Date();
    const blockDate = new Date(now.getTime() - (48 * 60 * 60 * 1000)); // 48h avant

    // Trouver les abonnements expirés depuis plus de 48h
    const expiredSubscriptions = await PricingPlan.find({
      endDate: { $lt: blockDate },
      status: 'active'
    });

    for (const subscription of expiredSubscriptions) {
      // Bloquer l'abonnement
      await PricingPlan.findByIdAndUpdate(subscription._id, {
        status: 'expired',
        expiredAt: now
      });

      // Bloquer le vendeur
      await SellerRequest.findByIdAndUpdate(subscription.storeId, {
        subscriptionStatus: 'expired',
        isvalid: false,
        suspensionReason: 'Abonnement expiré depuis plus de 48 heures',
        suspensionDate: now
      });

      await suspendSellerProducts(subscription.storeId, 'subscription_expired');

      // Ajouter à l'historique
      const historyEntry = new SubscriptionHistory({
        storeId: subscription.storeId,
        subscriptionId: subscription._id,
        actionType: 'expired',
        actionDetails: {
          performedBy: 'system',
          reason: 'Expiration automatique après 48h de grâce',
          notes: `Compte bloqué automatiquement le ${now.toLocaleDateString('fr-FR')}`
        },
        periodStart: subscription.startDate,
        periodEnd: subscription.endDate
      });

      await historyEntry.save();
    }

    console.log(`${expiredSubscriptions.length} comptes bloqués pour expiration`);
    return expiredSubscriptions.length;

  } catch (error) {
    console.error('Erreur blocage comptes expirés:', error);
    throw error;
  }
};

/**
 * Obtenir l'historique complet d'un vendeur
 */
const getSellerSubscriptionHistory = async (storeId) => {
  try {
    const history = await SubscriptionHistory.find({ storeId })
      .populate('subscriptionId')
      .populate('actionDetails.adminId', 'name email')
      .sort({ createdAt: -1 });

    // Calculer les totaux
    const totalPaid = history
      .filter(h => h.actionType === 'payment_confirmed')
      .reduce((sum, h) => sum + (h.paymentInfo?.amount || 0), 0);

    const totalMonths = history
      .filter(h => ['created', 'renewed'].includes(h.actionType))
      .reduce((sum, h) => {
        const start = new Date(h.periodStart);
        const end = new Date(h.periodEnd);
        return sum + ((end - start) / (1000 * 60 * 60 * 24 * 30));
      }, 0);

    return {
      history,
      summary: {
        totalPaid,
        totalMonths: Math.round(totalMonths),
        subscriptionsCount: history.filter(h => ['created', 'renewed'].includes(h.actionType)).length,
        currentStatus: history[0]?.actionType || 'unknown'
      }
    };

  } catch (error) {
    console.error('Erreur récupération historique:', error);
    throw error;
  }
};

/**
 * Obtenir les demandes en attente de vérification
 */
const getPendingRequests = async () => {
  try {
    const requests = await SubscriptionRequest.find({
      status: 'payment_submitted'
    })
    .populate('storeId', 'storeName name email phone')
    .sort({ createdAt: -1 });

    return requests;
  } catch (error) {
    console.error('Erreur récupération demandes en attente:', error);
    throw error;
  }
};

/**
 * Configuration des tâches automatisées
 */
const setupEnhancedCronJobs = () => {
  const timezone = 'Africa/Niamey';

  // Bloquer les comptes expirés toutes les heures
  cron.schedule('0 * * * *', () => {
    console.log('Blocage automatique des comptes expirés...');
    blockExpiredAccounts();
  }, { timezone });

  // Nettoyer les codes de réactivation expirés tous les jours à 03:00
  cron.schedule('0 3 * * *', async () => {
    console.log('Nettoyage des codes de réactivation expirés...');
    try {
      const now = new Date();
      await SubscriptionHistory.updateMany(
        { 'reactivationCode.expiresAt': { $lt: now }, 'reactivationCode.used': false },
        { $unset: { 'reactivationCode': 1 } }
      );
    } catch (error) {
      console.error('Erreur nettoyage codes:', error);
    }
  }, { timezone });

  // Nettoyer les demandes expirées toutes les 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log('Nettoyage des demandes expirées...');
    try {
      const now = new Date();

      const expiredRequests = await SubscriptionRequest.find({
        'paymentDetails.paymentDeadline': { $lt: now },
        status: 'pending_payment'
      });

      for (const request of expiredRequests) {
        await cleanupLinkedQueuedSubscription(request);
      }

      await SubscriptionRequest.updateMany(
        {
          _id: { $in: expiredRequests.map((req) => req._id) }
        },
        {
          status: 'cancelled',
          cancelledAt: now,
          processedAt: now
        }
      );
    } catch (error) {
      console.error('Erreur nettoyage demandes:', error);
    }
  }, { timezone });

  console.log('Tâches automatisées améliorées configurées');
};

module.exports = {
  createSubscriptionWithHistory,
  createManualRenewal,
  activateWithCode,
  createSubscriptionRequest,
  cancelSubscriptionRequest,
  submitPaymentProof,
  verifyPayment,
  blockExpiredAccounts,
  getSellerSubscriptionHistory,
  getPendingRequests,
  setupEnhancedCronJobs,
  cleanupLinkedQueuedSubscription,
  generateReactivationCode,
  PLAN_DEFAULTS,
  PAYMENT_CONFIG
};