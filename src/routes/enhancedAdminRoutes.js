// const express = require('express');
// const router = express.Router();
// const {
//   createManualRenewal,
//   verifyPayment,
//   getPendingRequests,
//   getSellerSubscriptionHistory,
//   PAYMENT_CONFIG
// } = require('../controllers/enhancedSubscriptionController');
// const { PricingPlan, SellerRequest } = require('../Models');
// const SubscriptionHistory = require('../models/Abonnements/SubscriptionHistory');
// const SubscriptionRequest = require('../models/Abonnements/SubscriptionRequest');

// // Middleware d'authentification admin
// const requireAdmin = (req, res, next) => {
//   const userRole = req.user?.role;
//   if (userRole !== 'admin') {
//     return res.status(403).json({
//       status: 'error',
//       message: 'Accès non autorisé'
//     });
//   }
//   next();
// };

// /**
//  * Dashboard avec statistiques avancées
//  */
// router.get('/dashboard-enhanced', requireAdmin, async (req, res) => {
//   try {
//     const { days = 30 } = req.query;
//     const startDate = new Date();
//     startDate.setDate(startDate.getDate() - parseInt(days));

//     const [
//       totalSubscriptions,
//       activeSubscriptions,
//       pendingRequests,
//       totalRevenue,
//       planDistribution,
//       recentHistory,
//       expiringSubscriptions
//     ] = await Promise.all([
//       PricingPlan.countDocuments(),
//       PricingPlan.countDocuments({ status: 'active' }),
//       SubscriptionRequest.countDocuments({ status: 'payment_submitted' }),
//       SubscriptionHistory.aggregate([
//         { 
//           $match: { 
//             actionType: { $in: ['created', 'renewed'] },
//             'paymentInfo.paymentStatus': 'verified'
//           } 
//         },
//         { $group: { _id: null, total: { $sum: '$paymentInfo.amount' } } }
//       ]),
//       PricingPlan.aggregate([
//         { $match: { status: 'active' } },
//         { $group: { _id: '$planType', count: { $sum: 1 } } }
//       ]),
//       SubscriptionHistory.find({ createdAt: { $gte: startDate } })
//         .populate('storeId', 'storeName name')
//         .sort({ createdAt: -1 })
//         .limit(10),
//       PricingPlan.countDocuments({
//         status: 'active',
//         endDate: {
//           $gte: new Date(),
//           $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
//         }
//       })
//     ]);

//     res.json({
//       status: 'success',
//       data: {
//         overview: {
//           totalSubscriptions,
//           activeSubscriptions,
//           pendingRequests,
//           expiringSubscriptions,
//           totalRevenue: totalRevenue[0]?.total || 0
//         },
//         planDistribution: planDistribution.reduce((acc, item) => {
//           acc[item._id] = item.count;
//           return acc;
//         }, {}),
//         recentActivity: recentHistory.map(h => ({
//           message: `${h.actionType} - ${h.storeId?.storeName || 'N/A'}`,
//           timestamp: h.createdAt,
//           type: h.actionType
//         }))
//       }
//     });

//   } catch (error) {
//     res.status(500).json({
//       status: 'error',
//       message: 'Erreur lors du chargement des statistiques',
//       error: error.message
//     });
//   }
// });

// /**
//  * Créer un renouvellement manuel avec code
//  */
// router.post('/create-manual-renewal', requireAdmin, async (req, res) => {
//   try {
//     const { storeId, planType, billingCycle, notes } = req.body;
//     const adminId = req.user.id; // À adapter selon votre système d'auth

//     const result = await createManualRenewal(storeId, planType, billingCycle, adminId, notes);

//     res.json({
//       status: 'success',
//       message: 'Renouvellement créé avec succès',
//       data: {
//         subscriptionId: result.subscription._id,
//         reactivationCode: result.reactivationCode,
//         expiresAt: result.expiresAt,
//         instructions: `Donnez ce code au vendeur: ${result.reactivationCode}. Le code expire le ${result.expiresAt.toLocaleDateString('fr-FR')}.`
//       }
//     });

//   } catch (error) {
//     res.status(500).json({
//       status: 'error',
//       message: 'Erreur lors de la création du renouvellement',
//       error: error.message
//     });
//   }
// });

// /**
//  * Obtenir les demandes en attente de vérification
//  */
// router.get('/pending-requests', requireAdmin, async (req, res) => {
//   try {
//     const requests = await getPendingRequests();

//     res.json({
//       status: 'success',
//       data: { requests }
//     });

//   } catch (error) {
//     res.status(500).json({
//       status: 'error',
//       message: 'Erreur lors du chargement des demandes',
//       error: error.message
//     });
//   }
// });

// /**
//  * Vérifier/rejeter un paiement
//  */
// router.put('/verify-payment/:requestId', requireAdmin, async (req, res) => {
//   try {
//     const { requestId } = req.params;
//     const { isApproved, verificationNotes } = req.body;
//     const adminId = req.user.id;

//     const result = await verifyPayment(requestId, adminId, isApproved, verificationNotes);

//     res.json({
//       status: 'success',
//       message: result.message,
//       data: result
//     });

//   } catch (error) {
//     res.status(500).json({
//       status: 'error',
//       message: 'Erreur lors de la vérification',
//       error: error.message
//     });
//   }
// });

// /**
//  * Historique complet d'un vendeur
//  */
// router.get('/seller-history/:storeId', requireAdmin, async (req, res) => {
//   try {
//     const { storeId } = req.params;
//     const result = await getSellerSubscriptionHistory(storeId);

//     res.json({
//       status: 'success',
//       data: result
//     });

//   } catch (error) {
//     res.status(500).json({
//       status: 'error',
//       message: 'Erreur lors du chargement de l\'historique',
//       error: error.message
//     });
//   }
// });

// /**
//  * Statistiques détaillées pour un vendeur
//  */
// router.get('/seller-stats/:storeId', requireAdmin, async (req, res) => {
//   try {
//     const { storeId } = req.params;
    
//     const [seller, currentSubscription, history, requests] = await Promise.all([
//       SellerRequest.findById(storeId),
//       PricingPlan.findOne({ storeId, status: 'active' }),
//       SubscriptionHistory.find({ storeId }).sort({ createdAt: -1 }),
//       SubscriptionRequest.find({ storeId }).sort({ createdAt: -1 })
//     ]);

//     if (!seller) {
//       return res.status(404).json({
//         status: 'error',
//         message: 'Vendeur non trouvé'
//       });
//     }

//     // Calculer les métriques
//     const totalPaid = history
//       .filter(h => h.paymentInfo?.paymentStatus === 'verified')
//       .reduce((sum, h) => sum + (h.paymentInfo?.amount || 0), 0);

//     const subscriptionCount = history.filter(h => 
//       ['created', 'renewed'].includes(h.actionType)
//     ).length;

//     const avgSubscriptionDuration = history
//       .filter(h => h.periodStart && h.periodEnd)
//       .reduce((sum, h) => {
//         const days = (new Date(h.periodEnd) - new Date(h.periodStart)) / (1000 * 60 * 60 * 24);
//         return sum + days;
//       }, 0) / subscriptionCount || 0;

//     res.json({
//       status: 'success',
//       data: {
//         seller: {
//           id: seller._id,
//           storeName: seller.storeName,
//           ownerName: seller.name,
//           email: seller.email,
//           phone: seller.phone,
//           createdAt: seller.createdAt,
//           isValid: seller.isvalid,
//           subscriptionStatus: seller.subscriptionStatus
//         },
//         currentSubscription,
//         metrics: {
//           totalPaid,
//           subscriptionCount,
//           avgSubscriptionDuration: Math.round(avgSubscriptionDuration),
//           customerSince: seller.createdAt,
//           lastPayment: history.find(h => h.paymentInfo?.paymentStatus === 'verified')?.createdAt
//         },
//         history,
//         pendingRequests: requests.filter(r => 
//           ['pending_payment', 'payment_submitted'].includes(r.status)
//         )
//       }
//     });

//   } catch (error) {
//     res.status(500).json({
//       status: 'error',
//       message: 'Erreur lors du chargement des statistiques vendeur',
//       error: error.message
//     });
//   }
// });

// /**
//  * Configuration des paiements (numéros, etc.)
//  */
// router.get('/payment-config', requireAdmin, async (req, res) => {
//   try {
//     res.json({
//       status: 'success',
//       data: {
//         paymentMethods: PAYMENT_CONFIG,
//         supportedMethods: Object.keys(PAYMENT_CONFIG)
//       }
//     });
//   } catch (error) {
//     res.status(500).json({
//       status: 'error',
//       message: 'Erreur lors du chargement de la configuration',
//       error: error.message
//     });
//   }
// });

// /**
//  * Rapport d'activité pour une période
//  */
// router.get('/activity-report', requireAdmin, async (req, res) => {
//   try {
//     const { startDate, endDate, format = 'json' } = req.query;
    
//     const query = {};
//     if (startDate && endDate) {
//       query.createdAt = {
//         $gte: new Date(startDate),
//         $lte: new Date(endDate)
//       };
//     }

//     const activities = await SubscriptionHistory.find(query)
//       .populate('storeId', 'storeName name email')
//       .populate('actionDetails.adminId', 'name email')
//       .sort({ createdAt: -1 });

//     if (format === 'csv') {
//       const csvData = activities.map(activity => ({
//         Date: activity.createdAt.toLocaleDateString('fr-FR'),
//         Boutique: activity.storeId?.storeName || 'N/A',
//         Propriétaire: activity.storeId?.name || 'N/A',
//         Action: activity.actionType,
//         Plan: activity.actionDetails?.newPlan?.planType || activity.actionDetails?.previousPlan?.planType || 'N/A',
//         Montant: activity.paymentInfo?.amount || 0,
//         'Effectué par': activity.actionDetails?.performedBy || 'N/A',
//         Notes: activity.actionDetails?.notes || ''
//       }));

//       res.setHeader('Content-Type', 'text/csv');
//       res.setHeader('Content-Disposition', 'attachment; filename=activite-abonnements.csv');
      
//       const csv = [
//         Object.keys(csvData[0] || {}).join(','),
//         ...csvData.map(row => Object.values(row).join(','))
//       ].join('\n');
      
//       res.send(csv);
//     } else {
//       res.json({
//         status: 'success',
//         data: { activities }
//       });
//     }

//   } catch (error) {
//     res.status(500).json({
//       status: 'error',
//       message: 'Erreur lors de la génération du rapport',
//       error: error.message
//     });
//   }
// });

// module.exports = router;

const express = require('express');
const router = express.Router();
const {
  validatePaymentAndPrepareActivation,
  getAdvancedSubscriptionStats,
  getSellerCompleteStatus
} = require('../controllers/subscriptionController');
const { SellerRequest,PricingPlan } = require('../Models');
const SubscriptionQueue = require('../models/Abonnements/SubscriptionQueue');
const SubscriptionRequest = require('../models/Abonnements/SubscriptionRequest');
const { getPendingRequests, createManualRenewal } = require('../controllers/enhancedSubscriptionController');

// Middleware admin
const requireAdmin = (req, res, next) => {
  const userRole = req.user?.role;
  if (userRole !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Accès non autorisé'
    });
  }
  next();
};

/**
 * Dashboard universel avec statistiques complètes
 */
router.get('/universal-dashboard', requireAdmin, async (req, res) => {
  try {
    const stats = await getAdvancedSubscriptionStats();

    // Statistiques de performance
    const performanceData = await Promise.all([
      // Taux de conversion trial -> payant
      SubscriptionQueue.aggregate([
        {
          $lookup: {
            from: 'PricingPlans',
            localField: 'activeSubscriptionId',
            foreignField: '_id',
            as: 'activeSub'
          }
        },
        { $unwind: '$activeSub' },
        {
          $group: {
            _id: '$activeSub.subscriptionType',
            count: { $sum: 1 }
          }
        }
      ]),

      // Revenus par plan
      PricingPlan.aggregate([
        { $match: { status: 'active', subscriptionType: { $ne: 'trial' } } },
        {
          $group: {
            _id: '$planType',
            monthlyRevenue: { $sum: '$price.monthly' },
            count: { $sum: 1 }
          }
        }
      ]),

      // Demandes en attente par urgence
      SubscriptionRequest.aggregate([
        { $match: { status: 'payment_submitted' } },
        {
          $lookup: {
            from: 'subscriptionqueues',
            localField: 'storeId',
            foreignField: 'storeId',
            as: 'queue'
          }
        },
        { $unwind: '$queue' },
        {
          $group: {
            _id: '$queue.accountStatus',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    res.json({
      status: 'success',
      data: {
        overview: stats.overview,
        performance: {
          conversionRates: performanceData[0],
          revenueByPlan: performanceData[1],
          urgentRequests: performanceData[2].find(r => r._id === 'grace_period')?.count || 0
        },
        alerts: {
          criticalActions: stats.overview.gracePeriodAccounts + stats.overview.suspendedAccounts,
          pendingVerifications: stats.overview.queuedSubscriptions
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors du chargement du dashboard',
      error: error.message
    });
  }
});

/**
 * Liste des vendeurs avec statut complet
 */
router.get('/sellers-with-status', requireAdmin, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    // Construction de la requête
    let matchQuery = {};
    if (status && status !== 'all') {
      matchQuery.accountStatus = status;
    }

    const pipeline = [
      { $match: matchQuery },
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
        $lookup: {
          from: 'PricingPlans',
          localField: 'activeSubscriptionId',
          foreignField: '_id',
          as: 'activeSub'
        }
      },
      {
        $addFields: {
          activeSubscription: { $arrayElemAt: ['$activeSub', 0] }
        }
      }
    ];

    // Filtrage par recherche
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { 'seller.storeName': { $regex: search, $options: 'i' } },
            { 'seller.name': { $regex: search, $options: 'i' } },
            { 'seller.email': { $regex: search, $options: 'i' } }
          ]
        }
      });
    }

    pipeline.push(
      { $sort: { lastUpdated: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) }
    );

    const [sellers, totalCount] = await Promise.all([
      SubscriptionQueue.aggregate(pipeline),
      SubscriptionQueue.countDocuments(matchQuery)
    ]);

    res.json({
      status: 'success',
      data: {
        sellers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / limit)
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors du chargement des vendeurs',
      error: error.message
    });
  }
});

/**
 * Vérifier un paiement et activer automatiquement si applicable
 */
router.put('/verify-payment/:requestId', requireAdmin, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { isApproved, verificationNotes } = req.body;
    const adminId = req.user.id;

    console.log({requestId, adminId, isApproved, verificationNotes});
    

    const result = await validatePaymentAndPrepareActivation(requestId, adminId, isApproved, verificationNotes);

    res.json({
      status: 'success',
      message: result.message,
      data: {
        approved: isApproved,
        autoActivated: result.autoActivated || false,
        queuePosition: result.queuePosition || null
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la vérification',
      error: error.message
    });
  }
});

/**
 * Créer un code de réactivation manuelle pour un vendeur suspendu
 */
router.post('/create-reactivation-code/:sellerId', requireAdmin, async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { planType = 'Starter', notes = '' } = req.body;
    const adminId = req.user.id;

    // Vérifier que le vendeur est bien suspendu
    const queue = await SubscriptionQueue.findOne({ storeId: sellerId });
    if (!queue || queue.accountStatus !== 'suspended') {
      return res.status(400).json({
        status: 'error',
        message: 'Ce vendeur n\'est pas suspendu'
      });
    }

    // Générer un code unique
    const reactivationCode = require('crypto').randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

    // Créer l'abonnement en attente d'activation
    const planConfig = PLAN_DEFAULTS[planType];
    const newSubscription = new PricingPlan({
      storeId: sellerId,
      planType,
      ...planConfig,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 1 mois
      status: 'pending_activation',
      subscriptionType: 'paid_monthly',
      reactivationCode: {
        code: reactivationCode,
        createdBy: adminId,
        expiresAt,
        used: false
      },
      createdBy: { userId: adminId, role: 'admin' }
    });

    await newSubscription.save();

    res.json({
      status: 'success',
      message: 'Code de réactivation créé avec succès',
      data: {
        reactivationCode,
        expiresAt,
        subscriptionId: newSubscription._id,
        instructions: `Code valable jusqu'au ${expiresAt.toLocaleDateString('fr-FR')}`
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error', 
      message: 'Erreur lors de la création du code',
      error: error.message
    });
  }
});

/**
 * Obtenir la file d'attente d'un vendeur spécifique
 */
router.get('/seller-queue/:sellerId', requireAdmin, async (req, res) => {
  try {
    const { sellerId } = req.params;
    
    const queue = await SubscriptionQueue.findOne({ storeId: sellerId })
      .populate('activeSubscriptionId')
      .populate('queuedSubscriptions.subscriptionId');

    if (!queue) {
      return res.status(404).json({
        status: 'error',
        message: 'File d\'attente non trouvée'
      });
    }

    // Enrichir avec les détails des demandes
    const enrichedQueue = {
      ...queue.toObject(),
      queuedSubscriptions: await Promise.all(
        queue.queuedSubscriptions.map(async (q) => {
          const request = await SubscriptionRequest.findOne({
            linkedSubscriptionId: q.subscriptionId
          });
          
          return {
            ...q.toObject(),
            paymentRequest: request,
            subscription: q.subscriptionId
          };
        })
      )
    };

    res.json({
      status: 'success',
      data: enrichedQueue
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors du chargement de la file',
      error: error.message
    });
  }
});

/**
 * Forcer l'activation du prochain abonnement dans la file
 */
router.post('/force-activate/:sellerId', requireAdmin, async (req, res) => {
  try {
    const { sellerId } = req.params;
    const adminId = req.user.id;

    const { checkAndActivateNextSubscription } = require('../controllers/UniversalSubscriptionController');
    await checkAndActivateNextSubscription(sellerId);

    // Ajouter une trace d'activation forcée
    const historyEntry = new (require('../models/Abonnements/SubscriptionHistory'))({
      storeId: sellerId,
      actionType: 'reactivated',
      actionDetails: {
        performedBy: 'admin',
        adminId,
        notes: 'Activation forcée par l\'administration'
      }
    });

    await historyEntry.save();

    res.json({
      status: 'success',
      message: 'Activation forcée avec succès'
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de l\'activation forcée',
      error: error.message
    });
  }
});

/**
 * Statistiques de performance du système
 */
router.get('/system-performance', requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      automationStats,
      conversionFunnel,
      revenueTrends
    ] = await Promise.all([
      // Efficacité de l'automatisation
      SubscriptionQueue.aggregate([
        {
          $group: {
            _id: '$accountStatus',
            count: { $sum: 1 },
            avgQueueLength: { $avg: { $size: '$queuedSubscriptions' } }
          }
        }
      ]),

      // Entonnoir de conversion
      Promise.all([
        SubscriptionQueue.countDocuments({ accountStatus: 'trial' }),
        SubscriptionQueue.countDocuments({ accountStatus: 'active' }),
        SubscriptionRequest.countDocuments({ status: 'payment_submitted' }),
        SubscriptionRequest.countDocuments({ status: 'activated' })
      ]),

      // Tendances de revenus (derniers 6 mois)
      PricingPlan.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 6, 1) },
            subscriptionType: { $ne: 'trial' }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              plan: '$planType'
            },
            revenue: { $sum: '$price.monthly' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ])
    ]);

    res.json({
      status: 'success',
      data: {
        automation: automationStats,
        conversion: {
          trialUsers: conversionFunnel[0],
          activeUsers: conversionFunnel[1],
          pendingPayments: conversionFunnel[2],
          completedActivations: conversionFunnel[3],
          trialToActiveRate: conversionFunnel[0] > 0 ? ((conversionFunnel[1] / conversionFunnel[0]) * 100).toFixed(1) : 0
        },
        revenue: revenueeTrends
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors du chargement des performances',
      error: error.message
    });
  }
});

router.get('/pending-requests', requireAdmin, async (req, res) => {
  try {
    const requests = await getPendingRequests();

    res.json({
      status: 'success',
      data: { requests }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors du chargement des demandes',
      error: error.message
    });
  }
});


/**
 * Créer un renouvellement manuel avec code
 */
router.post('/create-manual-renewal', requireAdmin, async (req, res) => {
  try {
    const { storeId, planType, billingCycle, notes } = req.body;
    const adminId = req.user.id; // À adapter selon votre système d'auth

    const result = await createManualRenewal(storeId, planType, billingCycle, adminId, notes);

    res.json({
      status: 'success',
      message: 'Renouvellement créé avec succès',
      data: {
        subscriptionId: result.subscription._id,
        reactivationCode: result.reactivationCode,
        expiresAt: result.expiresAt,
        instructions: `Donnez ce code au vendeur: ${result.reactivationCode}. Le code expire le ${result.expiresAt.toLocaleDateString('fr-FR')}.`
      }
    });

  } catch (error) {
    console.log({error});
    
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la création du renouvellement',
      error: error.message
    });
  }
});


module.exports = router;