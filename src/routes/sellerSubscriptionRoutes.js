const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const SELLER_PRIVATE_KEY = require("../auth/clefSeller");
const multer = require('multer');
const {
  createFutureSubscriptionRequest,
  validatePaymentAndPrepareActivation,
  checkAndActivateNextSubscription,
  getSellerCompleteStatus,
  getAdvancedSubscriptionStats,
  PLAN_DEFAULTS
} = require('../controllers/subscriptionController');
const { SellerRequest,PricingPlan } = require('../Models');
const { activateWithCode, submitPaymentProof, cancelSubscriptionRequest, cleanupLinkedQueuedSubscription } = require('../controllers/enhancedSubscriptionController');
const SubscriptionRequest = require('../models/Abonnements/SubscriptionRequest');

const cloudinary = require('../cloudinary');

// Configuration upload pour les reçus
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Seuls les images et PDF sont acceptés'), false);
    }
  }
});

// Fonction helper pour uploader vers Cloudinary depuis la mémoire
const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'payment-receipts',
        resource_type: 'auto'
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    uploadStream.end(fileBuffer);
  });
};

// Configuration des méthodes de paiement
const PAYMENT_CONFIG = {
  mynita: { phone: "+22790123456", name: "iHambaObab Mynita" },
  aman: { phone: "+22798765432", name: "iHambaObab Aman" },
  airtel_money: { phone: "+22787654321", name: "iHambaObab Airtel Money" },
  orange_money: { phone: "+22776543210", name: "iHambaObab Orange Money" }
};

// Middleware d'authentification vendeur
const requireSeller = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Token manquant' });
    }

    const decoded = jwt.verify(token, SELLER_PRIVATE_KEY);
    const seller = await SellerRequest.findById(decoded.userId);

    if (!seller) {
      return res.status(401).json({ message: 'Vendeur non trouvé' });
    }

    // Bloquer seulement les suspensions administratives sur les routes abonnement.
    // Les suspensions liées à l'abonnement doivent pouvoir accéder à cette page pour se réactiver.
    const suspensionReason = seller.suspensionReason || '';
    const isSubscriptionSuspension = /(abonnement|subscription|grace|expire|expiration|paiement|reactivation)/i.test(suspensionReason);
    if (!seller.isvalid && seller.subscriptionStatus === 'suspended' && !isSubscriptionSuspension) {
      return res.status(403).json({
        message: seller.suspensionReason
          ? `Compte suspendu: ${seller.suspensionReason}`
          : 'Votre compte a été suspendu. Contactez le support.',
        code: 'ACCOUNT_SUSPENDED',
        accountStatus: 'suspended',
        suspensionReason: seller.suspensionReason || null
      });
    }

    req.seller = seller;

    // Filet de sécurité: activer le prochain abonnement éligible sans attendre le cron.
    await checkAndActivateNextSubscription(seller._id);

    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide' });
  }
};

/**
 * Obtenir le statut complet du vendeur (abonnement + file d'attente)
 */
router.get('/complete-status', requireSeller, async (req, res) => {
  try {
    const sellerId = req.seller._id;
    const completeStatus = await getSellerCompleteStatus(sellerId);

    res.json({
      status: 'success',
      data: completeStatus
    });

  } catch (error) {
    console.error('Erreur récupération statut complet:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors du chargement des informations',
      error: error.message
    });
  }
});

/**
 * Obtenir les plans disponibles
 */
router.get('/available-plans', async (req, res) => {
  try {
    const plans = Object.entries(PLAN_DEFAULTS).map(([name, config]) => ({
      name,
      displayName: name,
      ...config,
      description: getPlanDescription(name),
      bestFor: getPlanBestFor(name),
      popular: name === 'Pro'
    }));

    res.json({
      status: 'success',
      data: {
        plans,
        paymentMethods: PAYMENT_CONFIG
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors du chargement des plans',
      error: error.message
    });
  }
});

/**
 * Créer une demande d'abonnement futur
 */
router.post('/create-future-request', requireSeller, async (req, res) => {
  try {
    const { planType, billingCycle, paymentMethod } = req.body;
    const sellerId = req.seller._id;
    console.log({planType, billingCycle, paymentMethod, sellerId});
    
    // Validations
    if (!['Starter', 'Pro', 'Business'].includes(planType)) {
      return res.status(400).json({
        status: 'error',
        message: 'Type de plan invalide'
      });
    }

    if (!Object.keys(PAYMENT_CONFIG).includes(paymentMethod)) {
      return res.status(400).json({
        status: 'error',
        message: 'Méthode de paiement non supportée'
      });
    }

    const result = await createFutureSubscriptionRequest(sellerId, planType, billingCycle, paymentMethod);

    res.json({
      status: 'success',
      message: 'Demande d\'abonnement futur créée avec succès',
      data: result.data
    });

  } catch (error) {
    console.error('Erreur création demande future:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la création de la demande',
      error: error.message
    });
  }
});

/**
 * Annuler une demande d'abonnement
 */
router.delete('/cancel-request/:requestId', requireSeller, async (req, res) => {
  try {
    const { requestId } = req.params;
    const sellerId = req.seller._id;

    const result = await cancelSubscriptionRequest(requestId, sellerId);

    res.json({
      status: 'success',
      message: result.message
    });

  } catch (error) {
    console.error('Erreur annulation demande:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de l\'annulation de la demande',
      error: error.message
    });
  }
});

/**
 * 🆕 Nouvelle route - Historique des paiements du seller
 */
router.get('/payment-history', requireSeller, async (req, res) => {
  try {
    const sellerId = req.seller._id;
    const { page = 1, limit = 10 } = req.query;

    const payments = await SubscriptionRequest.find({
      storeId: sellerId,
      status: { $in: ['payment_verified', 'activated', 'rejected'] }
    })
    .sort({ requestDate: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .populate('adminVerification.verifiedBy', 'name')
    .select('requestedPlan paymentDetails status requestDate adminVerification processedAt');

    const total = await SubscriptionRequest.countDocuments({
      storeId: sellerId,
      status: { $in: ['payment_verified', 'activated', 'rejected'] }
    });

    res.json({
      status: 'success',
      data: {
        payments: payments.map(payment => ({
          id: payment._id,
          planType: payment.requestedPlan.planType,
          billingCycle: payment.requestedPlan.billingCycle,
          amount: payment.paymentDetails.amount,
          method: payment.paymentDetails.method,
          status: payment.status,
          date: payment.requestDate,
          processedDate: payment.processedAt,
          verifiedBy: payment.adminVerification?.verifiedBy?.name
        })),
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          count: payments.length,
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Erreur historique paiements:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération de l\'historique',
      error: error.message
    });
  }
});

/**
 * 🆕 Nouvelle route - Renouvellement automatique
 */
router.post('/auto-renew', requireSeller, async (req, res) => {
  try {
    const sellerId = req.seller._id;
    const { enabled, paymentMethod } = req.body;

    const currentPlan = await PricingPlan.findOne({
      storeId: sellerId,
      status: 'active'
    });

    if (!currentPlan) {
      return res.status(404).json({
        status: 'error',
        message: 'Aucun abonnement actif trouvé'
      });
    }

    // Mettre à jour les paramètres de renouvellement automatique
    await PricingPlan.findByIdAndUpdate(currentPlan._id, {
      'autoRenewal.enabled': enabled,
      'autoRenewal.paymentMethod': paymentMethod,
      'autoRenewal.updatedAt': new Date()
    });

    res.json({
      status: 'success',
      message: enabled ? 
        'Renouvellement automatique activé' : 
        'Renouvellement automatique désactivé',
      data: {
        autoRenewal: {
          enabled,
          paymentMethod: enabled ? paymentMethod : null
        }
      }
    });

  } catch (error) {
    console.error('Erreur configuration auto-renouvellement:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la configuration',
      error: error.message
    });
  }
});

/**
 * 🆕 Nouvelle route - Générer facture
 */
router.get('/invoice/:subscriptionId', requireSeller, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const sellerId = req.seller._id;

    const subscription = await PricingPlan.findOne({
      _id: subscriptionId,
      storeId: sellerId
    }).populate('storeId', 'storeName email nomDuGerant');

    if (!subscription) {
      return res.status(404).json({
        status: 'error',
        message: 'Abonnement non trouvé'
      });
    }

    // Générer la facture (simplifié ici)
    const invoice = {
      invoiceNumber: subscription.invoiceNumber || `INV-${Date.now()}`,
      subscriptionId: subscription._id,
      seller: {
        name: subscription.storeId.nomDuGerant,
        storeName: subscription.storeId.storeName,
        email: subscription.storeId.email
      },
      plan: {
        type: subscription.planType,
        period: `${subscription.startDate} - ${subscription.endDate}`,
        amount: subscription.price.monthly,
        commission: subscription.commission
      },
      dates: {
        issued: subscription.startDate,
        due: subscription.endDate,
        paid: subscription.paymentInfo?.paidAt
      },
      status: subscription.status
    };

    res.json({
      status: 'success',
      data: { invoice }
    });

  } catch (error) {
    console.error('Erreur génération facture:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la génération de la facture',
      error: error.message
    });
  }
});

/**
 * Soumettre la preuve de paiement
 */
// router.put('/submit-payment/:requestId', requireSeller, upload.single('receipt'), async (req, res) => {
//   try {
//     const { requestId } = req.params;
//     const { transferCode, senderPhone } = req.body;
//     let receiptUrl = null;

//     // Validation des paramètres
//     if (!transferCode || transferCode.trim().length === 0) {
//       return res.status(400).json({
//         status: 'error',
//         message: 'Le code de transfert est obligatoire'
//       });
//     }

//     // Vérifier que la demande appartient au vendeur
//     const request = await SubscriptionRequest.findOne({
//       _id: requestId,
//       storeId: req.seller._id
//     });

//     if (!request) {
//       return res.status(404).json({
//         status: 'error',
//         message: 'Demande non trouvée ou non autorisée'
//       });
//     }

//     // Vérifier que la demande peut être mise à jour
//     const allowedStatuses = ['pending_payment', 'payment_submitted', 'rejected'];
//     if (!allowedStatuses.includes(request.status)) {
//       return res.status(400).json({
//         status: 'error',
//         message: `Impossible de soumettre une preuve pour une demande au statut: ${request.status}`
//       });
//     }

//     // Upload du reçu si fourni
//     if (req.file) {
//       try {
//         // Validation du fichier
//         const maxSize = 5 * 1024 * 1024; // 5MB
//         if (req.file.size > maxSize) {
//           return res.status(400).json({
//             status: 'error',
//             message: 'Le fichier ne doit pas dépasser 5MB'
//           });
//         }

//         // Utiliser la fonction helper pour uploader depuis la mémoire
//         const uploadResult = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
//         receiptUrl = uploadResult.secure_url;
//       } catch (uploadError) {
//         console.error('Erreur upload reçu:', uploadError);
//         return res.status(500).json({
//           status: 'error',
//           message: 'Erreur lors de l\'upload du fichier',
//           details: uploadError.message
//         });
//       }
//     }

//     // Appeler la fonction du contrôleur
//     try {
//       await submitPaymentProof(requestId, transferCode, receiptUrl, senderPhone);

//       res.json({
//         status: 'success',
//         message: 'Preuve de paiement soumise avec succès',
//         data: {
//           submittedAt: new Date().toISOString(),
//           nextSteps: [
//             'Votre paiement est en cours de vérification',
//             'Vous recevrez une notification par email',
//             'Délai de vérification: 24-48 heures ouvrées',
//             'Vous pouvez modifier votre preuve si nécessaire'
//           ]
//         }
//       });
//     } catch (controllerError) {
//       console.error('Erreur contrôleur submitPaymentProof:', controllerError);
//       return res.status(500).json({
//         status: 'error',
//         message: 'Erreur lors de la soumission de la preuve',
//         details: controllerError.message
//       });
//     }

//   } catch (error) {
//     console.error('Erreur générale submit-payment:', error);
//     res.status(500).json({
//       status: 'error',
//       message: 'Erreur interne du serveur',
//       details: process.env.NODE_ENV === 'development' ? error.message : 'Contactez le support technique'
//     });
//   }
// });

/**
 * Activer le compte avec code de réactivation
 */
router.post('/activate-with-code', requireSeller, async (req, res) => {
  try {
    const { reactivationCode } = req.body;
    const sellerId = req.seller._id;

    if (!reactivationCode || reactivationCode.length !== 8) {
      return res.status(400).json({
        status: 'error',
        message: 'Code de réactivation invalide'
      });
    }

    const result = await activateWithCode(sellerId, reactivationCode.toUpperCase());

    res.json({
      status: result.success ? 'success' : 'error',
      message: result.message,
      data: result.subscription ? {
        subscription: result.subscription,
        welcomeMessage: 'Bienvenue ! Votre compte est maintenant actif.',
        nextSteps: [
          'Explorez les nouvelles fonctionnalités de votre plan',
          'Mettez à jour votre profil de boutique',
          'Ajoutez vos produits'
        ]
      } : null
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de l\'activation',
      error: error.message
    });
  }
});

/**
 * Soumettre/Mettre à jour la preuve de paiement
 */
router.put('/submit-payment/:requestId', requireSeller, upload.single('receipt'), async (req, res) => {
  try {
    const { requestId } = req.params;
    const { transferCode, senderPhone } = req.body;
    let receiptUrl = null;

    // Validation des paramètres
    if (!transferCode || transferCode.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Le code de transfert est obligatoire'
      });
    }

    // Vérifier que la demande appartient au vendeur
    const request = await SubscriptionRequest.findOne({
      _id: requestId,
      storeId: req.seller._id
    });

    if (!request) {
      return res.status(404).json({
        status: 'error',
        message: 'Demande non trouvée ou non autorisée'
      });
    }

    // Vérifier que la demande peut être mise à jour
    const allowedStatuses = ['pending_payment', 'payment_submitted', 'rejected'];
    if (!allowedStatuses.includes(request.status)) {
      return res.status(400).json({
        status: 'error',
        message: `Impossible de soumettre une preuve pour une demande au statut: ${request.status}`
      });
    }

    // Refuser et annuler immédiatement les demandes expirées
    const now = new Date();
    if (request?.paymentDetails?.paymentDeadline && now > new Date(request.paymentDetails.paymentDeadline)) {
      await cleanupLinkedQueuedSubscription(request);

      await SubscriptionRequest.findByIdAndUpdate(requestId, {
        status: 'cancelled',
        cancelledAt: now,
        updatedAt: now
      });

      return res.status(400).json({
        status: 'error',
        code: 'REQUEST_EXPIRED_CANCELLED',
        message: 'La date limite de paiement est dépassée. Cette demande a été annulée.',
        data: {
          requestId,
          requestStatus: 'cancelled'
        }
      });
    }

    // Si c'est une mise à jour et qu'il y a un ancien reçu, le supprimer de Cloudinary
    const isUpdate = request.paymentDetails && request.paymentDetails.receiptFile;
    let oldReceiptUrl = null;
    
    if (isUpdate) {
      oldReceiptUrl = request.paymentDetails.receiptFile;
    }

    // Upload du nouveau reçu si fourni
    if (req.file) {
      try {
        // Validation du fichier
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (req.file.size > maxSize) {
          return res.status(400).json({
            status: 'error',
            message: 'Le fichier ne doit pas dépasser 5MB'
          });
        }

        // Upload du nouveau fichier
        const uploadResult = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
        receiptUrl = uploadResult.secure_url;

        // Supprimer l'ancien fichier de Cloudinary si c'est une mise à jour
        if (oldReceiptUrl) {
          try {
            // Extraire le public_id de l'ancienne URL Cloudinary
            const matches = oldReceiptUrl.match(/\/payment-receipts\/([^\.]+)/);
            if (matches && matches[1]) {
              const publicId = `payment-receipts/${matches[1]}`;
              console.log('🗑️ DEBUG - Suppression ancien fichier Cloudinary:', publicId);
              await cloudinary.uploader.destroy(publicId);
              console.log('✅ DEBUG - Ancien fichier supprimé de Cloudinary');
            }
          } catch (deleteError) {
            console.warn('⚠️ Erreur suppression ancien reçu:', deleteError.message);
            // Continue quand même, ne pas bloquer pour ça
          }
        }
      } catch (uploadError) {
        console.error('Erreur upload reçu:', uploadError);
        return res.status(500).json({
          status: 'error',
          message: 'Erreur lors de l\'upload du fichier',
          details: uploadError.message
        });
      }
    } else if (!isUpdate) {
      // Si pas de fichier et que c'est une première soumission, c'est OK
      // Si pas de fichier et que c'est une mise à jour, garder l'ancien
      receiptUrl = oldReceiptUrl;
    } else {
      // Garder l'ancien reçu s'il existe
      receiptUrl = oldReceiptUrl;
    }

    // Mettre à jour la demande avec la nouvelle preuve
    const updateData = {
      status: 'payment_submitted',
      submittedProof: {
        transferCode: transferCode.trim(),
        senderPhone: senderPhone || '',
        receiptUrl: receiptUrl,
        submittedAt: new Date(),
        isUpdate: isUpdate
      },
      updatedAt: new Date()
    };

    // Si c'était rejeté, nettoyer les infos de rejet
    if (request.status === 'rejected') {
      updateData.$unset = {
        'adminVerification.rejectionReason': 1
      };
      updateData['adminVerification.status'] = 'payment_submitted';
    }

    await SubscriptionRequest.findByIdAndUpdate(requestId, updateData);

    res.json({
      status: 'success',
      message: isUpdate 
        ? 'Preuve de paiement mise à jour avec succès' 
        : 'Preuve de paiement soumise avec succès',
      data: {
        submittedAt: new Date().toISOString(),
        isUpdate: isUpdate,
        hasReceipt: !!receiptUrl,
        nextSteps: [
          'Votre paiement est en cours de vérification',
          'Vous recevrez une notification par email',
          'Délai de vérification: 24-48 heures ouvrées',
          isUpdate ? 'Votre preuve a été mise à jour' : 'Vous pouvez modifier votre preuve si nécessaire'
        ]
      }
    });

  } catch (error) {
    console.error('Erreur générale submit-payment:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur interne du serveur',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Contactez le support technique'
    });
  }
});

/**
 * Route pour tester l'approbation/rejet d'une demande (temporaire pour test)
 */
router.put('/test-admin/verify-payment/:requestId', requireSeller, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action, rejectionReason } = req.body; // action: 'approve' ou 'reject'

    // Validation
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        status: 'error',
        message: 'Action invalide. Utilisez "approve" ou "reject"'
      });
    }

    if (action === 'reject' && !rejectionReason?.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Le motif de rejet est obligatoire'
      });
    }

    const request = await SubscriptionRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        status: 'error',
        message: 'Demande non trouvée'
      });
    }

    if (request.status !== 'payment_submitted') {
      return res.status(400).json({
        status: 'error',
        message: `Impossible de vérifier une demande au statut: ${request.status}`
      });
    }

    // Mettre à jour le statut
    const newStatus = action === 'approve' ? 'payment_verified' : 'rejected';
    
    const updateData = {
      status: newStatus,
      'adminVerification.status': newStatus,
      'adminVerification.verifiedAt': new Date(),
      'adminVerification.verifiedBy': req.seller._id, // Dans un vrai système, ce serait un admin
    };

    if (action === 'reject') {
      updateData['adminVerification.rejectionReason'] = rejectionReason.trim();
      updateData['paymentDetails.rejectionReason'] = rejectionReason.trim();
    }

    await SubscriptionRequest.findByIdAndUpdate(requestId, updateData);

    res.json({
      status: 'success',
      message: action === 'approve' ? 'Paiement approuvé avec succès' : 'Paiement rejeté',
      data: {
        newStatus,
        action,
        rejectionReason: action === 'reject' ? rejectionReason.trim() : null,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Erreur vérification paiement:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la vérification',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Erreur interne'
    });
  }
});

// Fonction helper
const getPlanDescription = (planName) => {
  const descriptions = {
    Starter: "Parfait pour commencer. Idéal pour les nouvelles boutiques!",
    Pro: "Croissance accélérée. Fonctionnalités avancées pour développer votre business.",
    Business: "Solution complète. Tout ce dont vous avez besoin pour réussir."
  };
  return descriptions[planName] || '';
};

const getPlanBestFor = (planName) => {
  const bestFor = {
    Starter: [
      "Nouvelles boutiques",
      "Jusqu'à 20 produits",
      "Commissions réduites"
    ],
    Pro: [
      "Boutiques en croissance",
      "Produits illimités", 
      "Marketing avancé",
      "Support prioritaire"
    ],
    Business: [
      "Grandes entreprises",
      "Équipe commerciale",
      "Analytics complètes",
      "Support dédié"
    ]
  };
  return bestFor[planName] || [];
};

module.exports = router;