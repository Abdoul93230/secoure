// const { SellerRequest, PricingPlan } = require("../Models");
// const nodemailer = require('nodemailer');
// const cron = require('node-cron');

// // Configuration email (à adapter selon votre service)
// const transporter = nodemailer.createTransport({
//   service: 'gmail', // ou votre service email
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS
//   },
//   tls: {
//     rejectUnauthorized: false // This ignores certificate errors
//   }
// });

// /**
//  * Constantes des plans par défaut (à synchroniser avec votre code existant)
//  */
// const PLAN_DEFAULTS = {
//   Starter: {
//     price: { monthly: 2500, annual: 27000 },
//     commission: 6,
//     productLimit: 10,
//     freeTrialMonths: 3, // 3 mois gratuits
//     features: {
//       productManagement: {
//         maxProducts: 10,
//         maxVariants: 3,
//         maxCategories: 5,
//         catalogImport: false,
//       },
//       paymentOptions: {
//         manualPayment: true,
//         mobileMoney: true,
//         cardPayment: false,
//         customPayment: false,
//       },
//       support: {
//         responseTime: 48,
//         channels: ["email"],
//         onboarding: "standard",
//       },
//       marketing: {
//         marketplaceVisibility: "standard",
//         maxActiveCoupons: 1,
//         emailMarketing: false,
//         abandonedCartRecovery: false,
//       },
//     },
//   },
//   Pro: {
//     price: { monthly: 4500, annual: 48600 },
//     commission: 3.5,
//     productLimit: -1,
//     freeTrialMonths: 0,
//     features: {
//       productManagement: {
//         maxProducts: -1,
//         maxVariants: 10,
//         maxCategories: 20,
//         catalogImport: true,
//       },
//       paymentOptions: {
//         manualPayment: true,
//         mobileMoney: true,
//         cardPayment: true,
//         customPayment: false,
//       },
//       support: {
//         responseTime: 24,
//         channels: ["email", "chat"],
//         onboarding: "personnalisé",
//       },
//       marketing: {
//         marketplaceVisibility: "prioritaire",
//         maxActiveCoupons: 5,
//         emailMarketing: true,
//         abandonedCartRecovery: false,
//       },
//     },
//   },
//   Business: {
//     price: { monthly: 9000, annual: 97200 },
//     commission: 2.5,
//     productLimit: -1,
//     freeTrialMonths: 0,
//     features: {
//       productManagement: {
//         maxProducts: -1,
//         maxVariants: -1,
//         maxCategories: -1,
//         catalogImport: true,
//       },
//       paymentOptions: {
//         manualPayment: true,
//         mobileMoney: true,
//         cardPayment: true,
//         customPayment: true,
//       },
//       support: {
//         responseTime: 12,
//         channels: ["email", "chat", "phone", "vip"],
//         onboarding: "VIP",
//       },
//       marketing: {
//         marketplaceVisibility: "premium",
//         maxActiveCoupons: -1,
//         emailMarketing: true,
//         abandonedCartRecovery: true,
//       },
//     },
//   },
// };

// /**
//  * Créer un abonnement automatiquement lors de la création d'un vendeur
//  */
// const createSubscriptionForSeller = async (sellerId, planType = 'Starter') => {
//   try {
//     const planDefaults = PLAN_DEFAULTS[planType];
//     if (!planDefaults) {
//       throw new Error('Type de plan invalide');
//     }

//     // Calculer la date de fin
//     let endDate = new Date();
//     if (planType === 'Starter') {
//       // 3 mois gratuits pour le plan Starter
//       endDate.setMonth(endDate.getMonth() + planDefaults.freeTrialMonths);
//     } else {
//       // 1 mois pour les autres plans (ou selon votre logique)
//       endDate.setMonth(endDate.getMonth() + 1);
//     }

//     const subscription = new PricingPlan({
//       storeId: sellerId,
//       planType,
//       ...planDefaults,
//       status: 'active',
//       startDate: new Date(),
//       endDate,
//       isTrialPeriod: planType === 'Starter'
//     });

//     await subscription.save();
//     return subscription;
//   } catch (error) {
//     console.error('Erreur création abonnement:', error);
//     throw error;
//   }
// };

// /**
//  * Vérifier les abonnements expirants et envoyer des notifications
//  */
// const checkExpiringSubscriptions = async () => {
//   try {
//     const now = new Date();
//     const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
//     const in1Day = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

//     // Trouver les abonnements qui expirent dans 7 jours
//     const expiringSoon = await PricingPlan.find({
//       endDate: { $gte: now, $lte: in7Days },
//       status: 'active',
//       reminderSent7Days: { $ne: true }
//     }).populate('storeId');

//     // Trouver les abonnements qui expirent demain
//     const expiringTomorrow = await PricingPlan.find({
//       endDate: { $gte: now, $lte: in1Day },
//       status: 'active',
//       reminderSent1Day: { $ne: true }
//     }).populate('storeId');

//     // Envoyer les rappels pour 7 jours
//     for (const subscription of expiringSoon) {
//       await sendExpirationReminder(subscription, 7);
//       await PricingPlan.findByIdAndUpdate(subscription._id, { reminderSent7Days: true });
//     }

//     // Envoyer les rappels pour 1 jour
//     for (const subscription of expiringTomorrow) {
//       await sendExpirationReminder(subscription, 1);
//       await PricingPlan.findByIdAndUpdate(subscription._id, { reminderSent1Day: true });
//     }

//     console.log(`Rappels envoyés: ${expiringSoon.length} (7j) + ${expiringTomorrow.length} (1j)`);
//   } catch (error) {
//     console.error('Erreur lors de la vérification des expirations:', error);
//   }
// };

// /**
//  * Marquer les abonnements expirés comme inactifs
//  */
// const markExpiredSubscriptions = async () => {
//   try {
//     const now = new Date();

//     const expiredSubscriptions = await PricingPlan.find({
//       endDate: { $lt: now },
//       status: 'active'
//     });

//     for (const subscription of expiredSubscriptions) {
//       await PricingPlan.findByIdAndUpdate(subscription._id, { 
//         status: 'expired',
//         expiredAt: now
//       });

//       // Optionnel: Suspendre le vendeur ou limiter ses fonctionnalités
//       await SellerRequest.findByIdAndUpdate(subscription.storeId, {
//         subscriptionStatus: 'expired'
//       });
//     }

//     console.log(`${expiredSubscriptions.length} abonnements marqués comme expirés`);
//   } catch (error) {
//     console.error('Erreur lors du marquage des expirations:', error);
//   }
// };

// /**
//  * Envoyer un rappel d'expiration par email
//  */
// const sendExpirationReminder = async (subscription, daysLeft) => {
//   try {
//     const seller = subscription.storeId;

//     const mailOptions = {
//       from: process.env.EMAIL_USER,
//       to: seller.email,
//       subject: `⚠️ Votre abonnement ${subscription.planType} expire dans ${daysLeft} jour(s)`,
//       html: `
//         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//           <h2 style="color: #30A08B;">Rappel d'expiration d'abonnement</h2>

//           <p>Bonjour <strong>${seller.name}</strong>,</p>

//           <p>Votre abonnement <strong>${subscription.planType}</strong> pour la boutique 
//           <strong>${seller.storeName}</strong> expire dans <strong>${daysLeft} jour(s)</strong>.</p>

//           <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
//             <h3>Détails de votre abonnement :</h3>
//             <ul>
//               <li><strong>Plan :</strong> ${subscription.planType}</li>
//               <li><strong>Date d'expiration :</strong> ${subscription.endDate.toLocaleDateString()}</li>
//               <li><strong>Prix de renouvellement :</strong> ${subscription.price.monthly.toLocaleString()} FCFA/mois</li>
//             </ul>
//           </div>

//           <p>Pour éviter toute interruption de service, renouvelez dès maintenant :</p>

//           <div style="text-align: center; margin: 30px 0;">
//             <a href="${process.env.FRONTEND_URL}/seller/billing" 
//                style="background: #30A08B; color: white; padding: 12px 24px; 
//                       text-decoration: none; border-radius: 6px; display: inline-block;">
//               Renouveler maintenant
//             </a>
//           </div>

//           <p style="color: #666; font-size: 14px;">
//             Si vous avez des questions, contactez notre équipe support à
//             <a href="mailto:support@ihambaobab.com">support@ihambaobab.com</a>
//           </p>
//         </div>
//       `
//     };

//     await transporter.sendMail(mailOptions);
//     console.log(`Rappel envoyé à ${seller.email} pour expiration dans ${daysLeft} jour(s)`);
//   } catch (error) {
//     console.error('Erreur envoi email rappel:', error);
//   }
// };

// /**
//  * Renouveler un abonnement
//  */
// const renewSubscription = async (subscriptionId, billingCycle = 'monthly') => {
//   try {
//     const subscription = await PricingPlan.findById(subscriptionId);
//     if (!subscription) {
//       throw new Error('Abonnement non trouvé');
//     }

//     const planDefaults = PLAN_DEFAULTS[subscription.planType];
//     const months = billingCycle === 'annual' ? 12 : 1;

//     // Calculer la nouvelle date de fin
//     let newEndDate = new Date(subscription.endDate);
//     if (newEndDate < new Date()) {
//       // Si déjà expiré, partir d'aujourd'hui
//       newEndDate = new Date();
//     }
//     newEndDate.setMonth(newEndDate.getMonth() + months);

//     // Mettre à jour l'abonnement
//     const updatedSubscription = await PricingPlan.findByIdAndUpdate(
//       subscriptionId,
//       {
//         endDate: newEndDate,
//         status: 'active',
//         lastRenewalDate: new Date(),
//         billingCycle,
//         isTrialPeriod: false,
//         reminderSent7Days: false,
//         reminderSent1Day: false
//       },
//       { new: true }
//     );

//     // Réactiver le vendeur si nécessaire
//     await SellerRequest.findByIdAndUpdate(subscription.storeId, {
//       subscriptionStatus: 'active'
//     });

//     return updatedSubscription;
//   } catch (error) {
//     console.error('Erreur renouvellement:', error);
//     throw error;
//   }
// };

// /**
//  * Changer le plan d'un vendeur (upgrade/downgrade)
//  */
// const changePlan = async (sellerId, newPlanType) => {
//   try {
//     const subscription = await PricingPlan.findOne({ storeId: sellerId });
//     if (!subscription) {
//       throw new Error('Aucun abonnement trouvé pour ce vendeur');
//     }

//     const newPlanDefaults = PLAN_DEFAULTS[newPlanType];
//     if (!newPlanDefaults) {
//       throw new Error('Type de plan invalide');
//     }

//     // Calculer la différence de prix au prorata si upgrade
//     const isUpgrade = newPlanDefaults.price.monthly > subscription.price.monthly;

//     // Mettre à jour l'abonnement avec les nouvelles caractéristiques
//     const updatedSubscription = await PricingPlan.findByIdAndUpdate(
//       subscription._id,
//       {
//         planType: newPlanType,
//         ...newPlanDefaults,
//         planChangeDate: new Date(),
//         previousPlanType: subscription.planType
//       },
//       { new: true }
//     );

//     return updatedSubscription;
//   } catch (error) {
//     console.error('Erreur changement de plan:', error);
//     throw error;
//   }
// };

// /**
//  * Obtenir les statistiques des abonnements pour l'admin
//  */
// const getSubscriptionStats = async (daysFilter = 30) => {
//   try {
//     const startDate = new Date();
//     startDate.setDate(startDate.getDate() - parseInt(daysFilter));

//     const stats = await Promise.all([
//       // Total des abonnements actifs
//       PricingPlan.countDocuments({ status: 'active' }),

//       // Abonnements expirant dans 7 jours
//       PricingPlan.countDocuments({
//         status: 'active',
//         endDate: {
//           $gte: new Date(),
//           $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
//         }
//       }),

//       // Revenus mensuels estimés
//       PricingPlan.aggregate([
//         { $match: { status: 'active' } },
//         { $group: { _id: null, total: { $sum: '$price.monthly' } } }
//       ]),

//       // Distribution par plan
//       PricingPlan.aggregate([
//         { $match: { status: 'active' } },
//         { $group: { _id: '$planType', count: { $sum: 1 } } }
//       ]),

//       // Activité récente
//       PricingPlan.find({
//         createdAt: { $gte: startDate }
//       }).populate('storeId', 'storeName email').limit(10).sort({ createdAt: -1 })
//     ]);

//     return {
//       activeSubscriptions: stats[0],
//       expiringSoon: stats[1],
//       monthlyRevenue: stats[2][0]?.total || 0,
//       planDistribution: stats[3].reduce((acc, item) => {
//         acc[item._id] = item.count;
//         return acc;
//       }, {}),
//       recentActivity: stats[4].map(sub => ({
//         message: `Nouvel abonnement ${sub.planType} pour ${sub.storeId?.storeName}`,
//         timestamp: sub.createdAt.toLocaleDateString()
//       }))
//     };
//   } catch (error) {
//     console.error('Erreur calcul statistiques:', error);
//     throw error;
//   }
// };

// /**
//  * Configuration des tâches automatisées (Cron Jobs)
//  */
// const setupSubscriptionCrons = () => {
//   // Vérifier les expirations tous les jours à 9h00
//   cron.schedule('0 9 * * *', () => {
//     console.log('Vérification des abonnements expirants...');
//     checkExpiringSubscriptions();
//   });

//   // Marquer les abonnements expirés tous les jours à 00h01
//   cron.schedule('1 0 * * *', () => {
//     console.log('Marquage des abonnements expirés...');
//     markExpiredSubscriptions();
//   });

//   // Génération des rapports hebdomadaires le lundi à 10h00
//   cron.schedule('0 10 * * 1', () => {
//     console.log('Génération des rapports hebdomadaires...');
//     // Logique pour générer et envoyer les rapports
//   });

//   console.log('Tâches automatisées configurées avec succès');
// };

// module.exports = {
//   createSubscriptionForSeller,
//   checkExpiringSubscriptions,
//   markExpiredSubscriptions,
//   sendExpirationReminder,
//   renewSubscription,
//   changePlan,
//   getSubscriptionStats,
//   setupSubscriptionCrons,
//   PLAN_DEFAULTS
// };
const { SellerRequest, PricingPlan, Produit } = require('../Models');
const SubscriptionQueue = require("../models/Abonnements/SubscriptionQueue");
const SubscriptionHistory = require("../models/Abonnements/SubscriptionHistory");
const SubscriptionRequest = require("../models/Abonnements/SubscriptionRequest");
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const crypto = require('crypto');
const { restoreSellerProductsIfEligible, suspendSellerProducts } = require('../utils/sellerProductSync');

// Configuration des plans (votre configuration existante)
const PLAN_DEFAULTS = {
  Starter: {
    price: { monthly: 2500, annual: 27000 },
    commission: 6,
    productLimit: 20,
    trialMonths: 3, // 3 mois d'essai gratuit
    features: {
      productManagement: { maxProducts: 20, maxVariants: 3, maxCategories: 5, catalogImport: false },
      paymentOptions: { manualPayment: true, mobileMoney: true, cardPayment: false, customPayment: false },
      support: { responseTime: 48, channels: ["email"], onboarding: "standard" },
      marketing: { marketplaceVisibility: "standard", maxActiveCoupons: 1, emailMarketing: false, abandonedCartRecovery: false }
    }
  },
  Pro: {
    price: { monthly: 4500, annual: 48600 },
    commission: 3.5,
    productLimit: -1,
    trialMonths: 0,
    features: {
      productManagement: { maxProducts: -1, maxVariants: 10, maxCategories: 20, catalogImport: true },
      paymentOptions: { manualPayment: true, mobileMoney: true, cardPayment: true, customPayment: false },
      support: { responseTime: 24, channels: ["email", "chat"], onboarding: "personnalisé" },
      marketing: { marketplaceVisibility: "prioritaire", maxActiveCoupons: 5, emailMarketing: true, abandonedCartRecovery: false }
    }
  },
  Business: {
    price: { monthly: 9000, annual: 97200 },
    commission: 2.5,
    productLimit: -1,
    trialMonths: 0,
    features: {
      productManagement: { maxProducts: -1, maxVariants: -1, maxCategories: -1, catalogImport: true },
      paymentOptions: { manualPayment: true, mobileMoney: true, cardPayment: true, customPayment: true },
      support: { responseTime: 12, channels: ["email", "chat", "phone", "vip"], onboarding: "VIP" },
      marketing: { marketplaceVisibility: "premium", maxActiveCoupons: -1, emailMarketing: true, abandonedCartRecovery: true }
    }
  }
};

/**
 * Créer l'abonnement initial lors de l'inscription (Starter 3 mois gratuit)
 */
const createInitialSubscription = async (sellerId) => {
  try {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 3); // 3 mois d'essai

    const planConfig = PLAN_DEFAULTS.Starter;

    // Créer l'abonnement d'essai
    const subscription = new PricingPlan({
      storeId: sellerId,
      planType: 'Starter',
      ...planConfig,
      startDate,
      endDate,
      status: 'trial',
      subscriptionType: 'trial',
      isTrialPeriod: true,
      trialEndDate: endDate,
      invoiceNumber: `TRIAL-${Date.now()}-${sellerId.toString().slice(-6)}`,
      createdBy: { role: 'system' }
    });

    await subscription.save();

    // Créer la file d'attente pour ce vendeur
    const queue = new SubscriptionQueue({
      storeId: sellerId,
      activeSubscriptionId: subscription._id,
      queuedSubscriptions: [],
      accountStatus: 'trial',
      lastUpdated: new Date()
    });

    await queue.save();

    // Ajouter à l'historique
    const historyEntry = new SubscriptionHistory({
      storeId: sellerId,
      subscriptionId: subscription._id,
      actionType: 'created',
      actionDetails: {
        performedBy: 'system',
        notes: 'Abonnement d\'essai Starter créé automatiquement (3 mois gratuits)',
        newPlan: {
          planType: 'Starter',
          price: planConfig.price,
          commission: planConfig.commission,
          startDate,
          endDate
        }
      },
      periodStart: startDate,
      periodEnd: endDate,
      invoiceNumber: subscription.invoiceNumber,
      billingCycle: 'trial'
    });

    await historyEntry.save();

    // Mettre à jour le vendeur
    await SellerRequest.findByIdAndUpdate(sellerId, {
      subscriptionId: subscription._id,
      subscriptionStatus: 'trial',
      isvalid: false,
      trialEndsAt: endDate
    });

    return { subscription, queue, history: historyEntry };

  } catch (error) {
    console.error('Erreur création abonnement initial:', error);
    throw error;
  }
};

/**
 * Créer une demande d'abonnement futur (peut être fait avant expiration)
 */
// const createFutureSubscriptionRequest = async (sellerId, planType, billingCycle = 'monthly', paymentMethod) => {
//   try {
//     // Récupérer la file d'attente actuelle
//     const queue = await SubscriptionQueue.findOne({ storeId: sellerId });
//     if (!queue) {
//       throw new Error('File d\'attente non trouvée pour ce vendeur');
//     }

//     // Calculer la date de début estimée
//     let estimatedStartDate = new Date();

//     if (queue.activeSubscriptionId) {
//       const activeSubscription = await PricingPlan.findById(queue.activeSubscriptionId);
//       if (activeSubscription && activeSubscription.status !== 'expired') {
//         estimatedStartDate = new Date(activeSubscription.endDate);
//       }
//     }

//     // Si il y a des abonnements en file, prendre la fin du dernier
//     if (queue.queuedSubscriptions.length > 0) {
//       const lastQueued = await PricingPlan.findById(
//         queue.queuedSubscriptions[queue.queuedSubscriptions.length - 1].subscriptionId
//       );
//       if (lastQueued) {
//         estimatedStartDate = new Date(lastQueued.endDate);
//       }
//     }

//     const planConfig = PLAN_DEFAULTS[planType];
//     const amount = billingCycle === 'annual' ? planConfig.price.annual : planConfig.price.monthly;

//     // Calculer la date de fin
//     const endDate = new Date(estimatedStartDate);
//     const duration = billingCycle === 'annual' ? 12 : 1;
//     endDate.setMonth(endDate.getMonth() + duration);

//     // Créer l'abonnement futur (statut queued)
//     const futureSubscription = new PricingPlan({
//       storeId: sellerId,
//       planType,
//       ...planConfig,
//       startDate: estimatedStartDate,
//       endDate,
//       status: 'queued',
//       subscriptionType: billingCycle === 'annual' ? 'paid_annual' : 'paid_monthly',
//       billingCycle,
//       queuePosition: queue.queuedSubscriptions.length + 1,
//       invoiceNumber: `QUEUE-${Date.now()}-${sellerId.toString().slice(-6)}`,
//       createdBy: { role: 'seller' }
//     });

//     await futureSubscription.save();

//     // Créer la demande de paiement
//     const paymentRequest = new SubscriptionRequest({
//       storeId: sellerId,
//       requestedPlan: { planType, billingCycle },
//       paymentDetails: {
//         method: paymentMethod,
//         amount,
//         recipientPhone: getPaymentPhone(paymentMethod)
//       },
//       linkedSubscriptionId: futureSubscription._id, // Nouveau champ
//       estimatedActivationDate: estimatedStartDate
//     });

//     await paymentRequest.save();

//     // Mettre à jour la file d'attente
//     queue.queuedSubscriptions.push({
//       subscriptionId: futureSubscription._id,
//       queuePosition: queue.queuedSubscriptions.length + 1,
//       estimatedStartDate,
//       status: 'pending_payment'
//     });
//     queue.lastUpdated = new Date();
//     await queue.save();

//     return {
//       success: true,
//       data: {
//         subscriptionId: futureSubscription._id,
//         requestId: paymentRequest._id,
//         amount,
//         estimatedStartDate,
//         queuePosition: queue.queuedSubscriptions.length,
//         paymentInstructions: {
//           method: paymentMethod,
//           recipientPhone: getPaymentPhone(paymentMethod),
//           amount,
//           deadline: paymentRequest.paymentDetails.paymentDeadline
//         }
//       }
//     };

//   } catch (error) {
//     console.error('Erreur création abonnement futur:', error);
//     throw error;
//   }
// };



const createFutureSubscriptionRequest = async (sellerId, planType, billingCycle = 'monthly', paymentMethod) => {
  try {
    // Récupérer ou créer la file d'attente
    let queue = await SubscriptionQueue.findOne({ storeId: sellerId });
    
    if (!queue) {
      // Si la file n'existe pas, la créer
      console.log(`Création d'une nouvelle file d'attente pour le vendeur ${sellerId}`);
      
      // Vérifier s'il y a un abonnement actif existant
      const activeSubscription = await PricingPlan.findOne({ 
        storeId: sellerId, 
        status: { $in: ['active', 'trial'] } 
      }).sort({ createdAt: -1 });

      queue = new SubscriptionQueue({
        storeId: sellerId,
        activeSubscriptionId: activeSubscription ? activeSubscription._id : null,
        queuedSubscriptions: [],
        // accountStatus: activeSubscription ? activeSubscription.status : 'trial',
        // accountStatus: activeSubscription ? activeSubscription.status : planType,
        lastUpdated: new Date()
      });

      await queue.save();
    }

    // Calculer la date de début estimée
    let estimatedStartDate = new Date();

    if (queue.activeSubscriptionId) {
      const activeSubscription = await PricingPlan.findById(queue.activeSubscriptionId);
      if (activeSubscription && activeSubscription.status !== 'expired') {
        estimatedStartDate = new Date(activeSubscription.endDate);
      }
    }

    // Si il y a des abonnements en file, prendre la fin du dernier
    if (queue.queuedSubscriptions.length > 0) {
      const lastQueued = await PricingPlan.findById(
        queue.queuedSubscriptions[queue.queuedSubscriptions.length - 1].subscriptionId
      );
      if (lastQueued) {
        estimatedStartDate = new Date(lastQueued.endDate);
      }
    }

    const planConfig = PLAN_DEFAULTS[planType];
    const amount = billingCycle === 'annual' ? planConfig.price.annual : planConfig.price.monthly;

    // Calculer la date de fin
    const endDate = new Date(estimatedStartDate);
    const duration = billingCycle === 'annual' ? 12 : 1;
    endDate.setMonth(endDate.getMonth() + duration);

    // Créer l'abonnement futur (statut queued)
    const futureSubscription = new PricingPlan({
      storeId: sellerId,
      planType,
      ...planConfig,
      startDate: estimatedStartDate,
      endDate,
      status: 'queued',
      subscriptionType: billingCycle === 'annual' ? 'paid_annual' : 'paid_monthly',
      billingCycle,
      queuePosition: queue.queuedSubscriptions.length + 1,
      invoiceNumber: `QUEUE-${Date.now()}-${sellerId.toString().slice(-6)}`,
      createdBy: { role: 'seller' }
    });

    await futureSubscription.save();

    // Créer la demande de paiement
    const paymentRequest = new SubscriptionRequest({
      storeId: sellerId,
      requestedPlan: { planType, billingCycle },
      paymentDetails: {
        method: paymentMethod,
        amount,
        recipientPhone: getPaymentPhone(paymentMethod)
      },
      linkedSubscriptionId: futureSubscription._id,
      estimatedActivationDate: estimatedStartDate
    });

    await paymentRequest.save();

    // Mettre à jour la file d'attente
    queue.queuedSubscriptions.push({
      subscriptionId: futureSubscription._id,
      queuePosition: queue.queuedSubscriptions.length + 1,
      estimatedStartDate,
      status: 'pending_payment'
    });
    queue.lastUpdated = new Date();
    await queue.save();

    return {
      success: true,
      data: {
        subscriptionId: futureSubscription._id,
        requestId: paymentRequest._id,
        amount,
        estimatedStartDate,
        queuePosition: queue.queuedSubscriptions.length,
        paymentInstructions: {
          method: paymentMethod,
          recipientPhone: getPaymentPhone(paymentMethod),
          amount,
          deadline: paymentRequest.paymentDetails.paymentDeadline
        }
      }
    };

  } catch (error) {
    console.error('Erreur création abonnement futur:', error);
    throw error;
  }
};



/**
 * Valider le paiement et préparer l'activation
 */
const validatePaymentAndPrepareActivation = async (requestId, adminId, isApproved, notes = '') => {
  try {
    const request = await SubscriptionRequest.findById(requestId).populate('storeId');
    if (!request) {
      throw new Error('Demande non trouvée');
    }
// console.log({isApproved});

    if (isApproved) {
      // Mettre à jour l'abonnement comme prêt à être activé
      await PricingPlan.findByIdAndUpdate(request.linkedSubscriptionId, {
        status: 'pending_activation',
        paymentInfo: {
          method: request.paymentDetails.method,
          amount: request.paymentDetails.amount,
          verified: true,
          verifiedBy: adminId,
          verifiedAt: new Date()
        }
      });

      // Mettre à jour la file d'attente
      await SubscriptionQueue.findOneAndUpdate(
        {
          storeId: request.storeId._id,
          'queuedSubscriptions.subscriptionId': request.linkedSubscriptionId
        },
        {
          '$set': {
            'queuedSubscriptions.$.status': 'payment_verified',
            lastUpdated: new Date()
          }
        }
      );

      // Mettre à jour la demande
      await SubscriptionRequest.findByIdAndUpdate(requestId, {
        status: 'payment_verified',
        processedAt: new Date(),
        'adminVerification.verifiedBy': adminId,
        'adminVerification.verifiedAt': new Date(),
        'adminVerification.verificationNotes': notes
      });

      // Vérifier si cet abonnement peut être activé immédiatement
      await checkAndActivateNextSubscription(request.storeId._id);

      return {
        success: true,
        message: 'Paiement validé. L\'abonnement sera activé automatiquement.'
      };

    } else {
      // Paiement rejeté - supprimer l'abonnement en file
      await PricingPlan.findByIdAndDelete(request.linkedSubscriptionId);

      // Retirer de la file d'attente
      await SubscriptionQueue.findOneAndUpdate(
        { storeId: request.storeId._id },
        {
          $pull: { queuedSubscriptions: { subscriptionId: request.linkedSubscriptionId } },
          lastUpdated: new Date()
        }
      );

      await SubscriptionRequest.findByIdAndUpdate(requestId, {
        status: 'rejected',
        processedAt: new Date(),
        'adminVerification.verifiedBy': adminId,
        'adminVerification.verifiedAt': new Date(),
        'adminVerification.rejectionReason': notes
      });

      return {
        success: true,
        message: 'Paiement rejeté et demande annulée'
      };
    }

  } catch (error) {
    console.error('Erreur validation paiement:', error);
    throw error;
  }
};

/**
 * Vérifier et activer le prochain abonnement dans la file
 */
const checkAndActivateNextSubscription = async (sellerId) => {
  try {
    const queue = await SubscriptionQueue.findOne({ storeId: sellerId });
    if (!queue) return;

    // Récupérer l'abonnement actuel
    const currentSubscription = queue.activeSubscriptionId
      ? await PricingPlan.findById(queue.activeSubscriptionId)
      : null;

    // Vérifier si l'abonnement actuel est expiré ou va expirer
    const now = new Date();
    const shouldActivateNext = !currentSubscription ||
      currentSubscription.status === 'expired' ||
      currentSubscription.endDate <= now;

    if (shouldActivateNext) {
      // Chercher le prochain abonnement prêt à être activé
      const nextSubscriptionData = queue.queuedSubscriptions
        .filter(q => q.status === 'payment_verified')
        .sort((a, b) => a.queuePosition - b.queuePosition)[0];

      if (nextSubscriptionData) {
        const nextSubscription = await PricingPlan.findById(nextSubscriptionData.subscriptionId);

        if (nextSubscription) {
          // Désactiver l'ancien abonnement
          if (currentSubscription) {
            await PricingPlan.findByIdAndUpdate(currentSubscription._id, {
              status: 'expired',
              endedAt: now
            });
          }

          // Activer le nouveau
          nextSubscription.status = 'active';
          nextSubscription.startDate = now;
          // Recalculer la date de fin à partir de maintenant
          const newEndDate = new Date(now);
          const duration = nextSubscription.billingCycle === 'annual' ? 12 : 1;
          newEndDate.setMonth(newEndDate.getMonth() + duration);
          nextSubscription.endDate = newEndDate;

          await nextSubscription.save();

          // Mettre à jour la file d'attente
          queue.activeSubscriptionId = nextSubscription._id;
          queue.queuedSubscriptions = queue.queuedSubscriptions.filter(
            q => q.subscriptionId.toString() !== nextSubscription._id.toString()
          );
          // Réorganiser les positions dans la file
          queue.queuedSubscriptions.forEach((q, index) => {
            q.queuePosition = index + 1;
          });
          queue.accountStatus = 'active';
          queue.lastUpdated = now;
          await queue.save();

          // Mettre à jour le vendeur
          await SellerRequest.findByIdAndUpdate(sellerId, {
            subscriptionId: nextSubscription._id,
            subscriptionStatus: 'active',
            isvalid: true,
            suspensionReason: null,
            suspensionDate: null,
            reactivatedAt: now
          });

          await restoreSellerProductsIfEligible(sellerId);

          // Ajouter à l'historique
          const historyEntry = new SubscriptionHistory({
            storeId: sellerId,
            subscriptionId: nextSubscription._id,
            actionType: 'reactivated',
            actionDetails: {
              performedBy: 'system',
              notes: `Activation automatique du prochain abonnement (${nextSubscription.planType})`
            },
            periodStart: now,
            periodEnd: newEndDate
          });

          await historyEntry.save();

          console.log(`Abonnement activé automatiquement pour ${sellerId}`);
        }
      }
    }

  } catch (error) {
    console.error('Erreur activation automatique:', error);
  }
};

/**
 * Suspendre automatiquement les comptes après 48h de grâce
 */
// const suspendExpiredAccounts = async () => {
//   try {
//     const now = new Date();
//     const gracePeriodEnd = new Date(now.getTime() + (48 * 60 * 60 * 1000)); // 48h après

//     // Trouver les files d'attente où la période de grâce est terminée
//     const expiredQueues = await SubscriptionQueue.find({
//       // gracePeriodEnd: { $lt: now, $ne: null },
//       gracePeriodEnd: { $lt: gracePeriodEnd, $ne: null },
//       accountStatus: 'grace_period'
//     });
//     console.log({expiredQueues,gracePeriodEnd});
    

//     for (const queue of expiredQueues) {
//       // Vérifier s'il n'y a pas d'abonnement payé en attente
//       const hasValidPayment = queue.queuedSubscriptions.some(q => q.status === 'payment_verified');

//       if (!hasValidPayment) {
//         // Suspendre le compte
//         queue.accountStatus = 'suspended';
//         await queue.save();

//         await SellerRequest.findByIdAndUpdate(queue.storeId, {
//           subscriptionStatus: 'suspended',
//           isvalid: false,
//           suspensionReason: 'Abonnement expiré - période de grâce terminée (48h)',
//           suspensionDate: now
//         });

//         // Ajouter à l'historique
//         const historyEntry = new SubscriptionHistory({
//           storeId: queue.storeId,
//           subscriptionId: queue.activeSubscriptionId,
//           actionType: 'suspended',
//           actionDetails: {
//             performedBy: 'system',
//             reason: 'Suspension automatique après 48h de grâce',
//             notes: `Compte suspendu automatiquement le ${now.toLocaleDateString('fr-FR')}`
//           }
//         });

//         await historyEntry.save();
//       } else {
//         // Il y a un paiement validé, activer automatiquement
//         await checkAndActivateNextSubscription(queue.storeId);
//       }
//     }

//     console.log(`${expiredQueues.length} comptes traités pour suspension/activation`);

//   } catch (error) {
//     console.error('Erreur suspension automatique:', error);
//   }
// };

const suspendExpiredAccounts = async () => {
  try {
    const now = new Date();
    const gracePeriodEnd = new Date(now.getTime() + (48 * 60 * 60 * 1000)); // 48h après

    // ========================================
    // 1. TRAITER LES FILES D'ATTENTE EXPIRÉES
    // ========================================
    const expiredQueues = await SubscriptionQueue.find({
      gracePeriodEnd: { $lt: gracePeriodEnd, $ne: null },
      accountStatus: 'grace_period'
    });
    
    console.log({ expiredQueues, gracePeriodEnd });

    for (const queue of expiredQueues) {
      // Vérifier s'il n'y a pas d'abonnement payé en attente
      const hasValidPayment = queue.queuedSubscriptions.some(
        q => q.status === 'payment_verified'
      );

      if (!hasValidPayment) {
        // Suspendre le compte
        queue.accountStatus = 'suspended';
        await queue.save();

        await SellerRequest.findByIdAndUpdate(queue.storeId, {
          subscriptionStatus: 'suspended',
          isvalid: false,
          suspensionReason: 'Abonnement expiré - période de grâce terminée (48h)',
          suspensionDate: now
        });

        await suspendSellerProducts(queue.storeId, 'subscription_suspended');

        // Ajouter à l'historique
        const historyEntry = new SubscriptionHistory({
          storeId: queue.storeId,
          subscriptionId: queue.activeSubscriptionId,
          actionType: 'suspended',
          actionDetails: {
            performedBy: 'system',
            reason: 'Suspension automatique après 48h de grâce',
            notes: `Compte suspendu automatiquement le ${now.toLocaleDateString('fr-FR')}`
          }
        });

        await historyEntry.save();
        console.log(`✓ Queue expirée suspendue: ${queue.storeId}`);
      } else {
        // Il y a un paiement validé, activer automatiquement
        await checkAndActivateNextSubscription(queue.storeId);
        console.log(`✓ Queue expirée avec paiement activée: ${queue.storeId}`);
      }
    }

    console.log(`\n📦 ${expiredQueues.length} comptes avec queue expirée traités\n`);

    // ========================================
    // 2. TRAITER LES SELLERREQUEST SANS QUEUE
    // ========================================
    
    // Récupérer tous les IDs des stores qui ont une SubscriptionQueue
    const storeIdsWithQueue = await SubscriptionQueue.distinct('storeId');

    // Trouver TOUS les SellerRequest sans SubscriptionQueue
    const sellersWithoutQueue = await SellerRequest.find({
      _id: { $nin: storeIdsWithQueue }
    });

    console.log(`🔍 ${sellersWithoutQueue.length} boutiques trouvées sans SubscriptionQueue\n`);

    let suspendedCount = 0;
    let alreadySuspendedCount = 0;

    for (const seller of sellersWithoutQueue) {
      // Si le compte est déjà invalide ET déjà suspendu, on skip
      if (!seller.isvalid && seller.subscriptionStatus === 'suspended') {
        console.log(`✓ Boutique "${seller.storeName}" (${seller._id}) déjà suspendue correctement`);
        alreadySuspendedCount++;
        continue;
      }

      // SINON, on suspend TOUT ce qui n'a pas de queue
      const reason = seller.subscriptionId 
        ? 'Incohérence détectée - SubscriptionQueue manquante malgré subscriptionId'
        : 'Aucune SubscriptionQueue ni abonnement actif trouvé';

      console.warn(`⚠️  Suspension de "${seller.storeName}" (${seller._id})`);
      console.warn(`    Raison: ${reason}`);
      console.warn(`    État avant: isvalid=${seller.isvalid}, subscriptionStatus=${seller.subscriptionStatus}`);

      // Suspendre la boutique
      await SellerRequest.findByIdAndUpdate(seller._id, {
        subscriptionStatus: 'suspended',
        isvalid: false,
        suspensionReason: reason,
        suspensionDate: now
      });

      await suspendSellerProducts(seller._id, 'seller_without_queue_suspended');

      // Ajouter à l'historique SEULEMENT si subscriptionId existe
      if (seller.subscriptionId) {
        const historyEntry = new SubscriptionHistory({
          storeId: seller._id,
          subscriptionId: seller.subscriptionId,
          actionType: 'suspended',
          actionDetails: {
            performedBy: 'system',
            reason: reason,
            notes: `Boutique "${seller.storeName}" sans SubscriptionQueue suspendue automatiquement le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR')}`
          }
        });

        await historyEntry.save();
      } else {
        // Log alternatif si pas de subscriptionId
        console.log(`   ℹ️  Pas d'historique créé (aucun subscriptionId)`);
      }
      suspendedCount++;
    }

    // ========================================
    // 3. COHÉRENCE: SELLERS ACTIFS SANS ABONNEMENT VALIDE
    // ========================================
    const activeSellers = await SellerRequest.find({
      $or: [
        { isvalid: true },
        { subscriptionStatus: { $in: ['active', 'trial'] } }
      ]
    }).select('_id storeName subscriptionId isvalid subscriptionStatus');

    let inconsistentSuspendedCount = 0;

    for (const seller of activeSellers) {
      const hasValidActivePlan = await PricingPlan.exists({
        storeId: seller._id,
        status: { $in: ['active', 'trial'] },
        endDate: { $gte: now }
      });

      if (hasValidActivePlan) {
        continue;
      }

      await SellerRequest.findByIdAndUpdate(seller._id, {
        subscriptionStatus: 'suspended',
        isvalid: false,
        suspensionReason: 'Aucun abonnement actif valide détecté',
        suspensionDate: now
      });

      await SubscriptionQueue.findOneAndUpdate(
        { storeId: seller._id },
        {
          accountStatus: 'suspended',
          lastUpdated: now,
          suspendedAt: now
        }
      );

      await suspendSellerProducts(seller._id, 'no_valid_subscription_detected');
      inconsistentSuspendedCount++;
    }

    // ========================================
    // 4. RÉSUMÉ FINAL
    // ========================================
    console.log(`
╔════════════════════════════════════════════════════════════╗
║           📊 RÉSUMÉ DE L'EXÉCUTION                         ║
╠════════════════════════════════════════════════════════════╣
║ Queues expirées traitées:        ${String(expiredQueues.length).padStart(4)} comptes      ║
║ Boutiques sans queue trouvées:   ${String(sellersWithoutQueue.length).padStart(4)} comptes      ║
║   - Déjà suspendues:              ${String(alreadySuspendedCount).padStart(4)} comptes      ║
║   - Nouvellement suspendues:      ${String(suspendedCount).padStart(4)} comptes      ║
║ Incohérences actif/sans abo:      ${String(inconsistentSuspendedCount).padStart(4)} comptes      ║
║                                                            ║
║ ✅ TOTAL TRAITÉ:                  ${String(expiredQueues.length + suspendedCount + inconsistentSuspendedCount).padStart(4)} comptes      ║
╚════════════════════════════════════════════════════════════╝
    `);

    return {
      success: true,
      expiredQueues: expiredQueues.length,
      sellersWithoutQueue: sellersWithoutQueue.length,
      alreadySuspended: alreadySuspendedCount,
      newlySuspended: suspendedCount,
      inconsistentSuspended: inconsistentSuspendedCount,
      totalProcessed: expiredQueues.length + suspendedCount + inconsistentSuspendedCount
    };

  } catch (error) {
    console.error('❌ Erreur suspension automatique:', error);
    throw error;
  }
};

/**
 * Marquer les abonnements comme expirés et démarrer la période de grâce
 */
const startGracePeriod = async () => {
  try {
    const now = new Date();

    // Trouver les abonnements qui viennent d'expirer
    const expiredSubscriptions = await PricingPlan.find({
      endDate: { $lt: now },
      status: { $in: ['active', 'trial'] }
    });

    for (const subscription of expiredSubscriptions) {
      // Marquer comme expiré
      await PricingPlan.findByIdAndUpdate(subscription._id, {
        status: 'expired',
        expiredAt: now
      });

      // Démarrer la période de grâce dans la file d'attente
      const gracePeriodEnd = new Date(now.getTime() + (48 * 60 * 60 * 1000)); // +48h

      await SubscriptionQueue.findOneAndUpdate(
        { storeId: subscription.storeId },
        {
          accountStatus: 'grace_period',
          gracePeriodEnd,
          lastUpdated: now
        }
      );

      // Vérifier s'il y a un abonnement payé en attente
      await checkAndActivateNextSubscription(subscription.storeId);
    }

    console.log(`${expiredSubscriptions.length} abonnements expirés - période de grâce démarrée`);

  } catch (error) {
    console.error('Erreur démarrage période de grâce:', error);
  }
};

/**
 * Obtenir le statut complet d'un vendeur
 */
const getSellerCompleteStatus = async (sellerId) => {
  try {
    // Filet de sécurité: activer immédiatement l'abonnement suivant si déjà éligible
    // (utile quand le cron n'est pas encore passé au moment d'une connexion/action).
    await checkAndActivateNextSubscription(sellerId);

    const [seller, queue, activeSubscription, history,productCount] = await Promise.all([
      SellerRequest.findById(sellerId),
      SubscriptionQueue.findOne({ storeId: sellerId }),
      PricingPlan.findOne(
        { storeId: sellerId, status: { $in: ['active', 'trial'] } }
      ).sort({ createdAt: -1 }),
      SubscriptionHistory.find({ storeId: sellerId }).sort({ createdAt: -1 }).limit(10),
      Produit.countDocuments({
      createdBy: sellerId,
      isDeleted: false
  })
    ]);

    if (!queue) {
      return { status: 'no_subscription', message: 'Aucun abonnement trouvé' };
    }

    const now = new Date();
    let normalizedAccountStatus = queue.accountStatus;

    if (seller?.subscriptionStatus === 'suspended' || (!seller?.isvalid && seller?.suspensionReason)) {
      normalizedAccountStatus = 'suspended';
    } else if (activeSubscription?.status === 'trial') {
      normalizedAccountStatus = 'trial';
    } else if (activeSubscription?.status === 'active') {
      normalizedAccountStatus = 'active';
    } else if (['trial', 'active'].includes(queue.accountStatus) && !activeSubscription) {
      normalizedAccountStatus = queue.queuedSubscriptions?.length ? 'grace_period' : 'suspended';
    }

    if (normalizedAccountStatus !== queue.accountStatus) {
      await SubscriptionQueue.findByIdAndUpdate(queue._id, {
        accountStatus: normalizedAccountStatus,
        lastUpdated: now
      });
      queue.accountStatus = normalizedAccountStatus;
    }

    let statusInfo = {};
    
    switch (normalizedAccountStatus) {
      case 'trial':
        if (!activeSubscription) {
          statusInfo = {
            status: 'suspended',
            title: 'Compte Suspendu',
            message: 'Aucun abonnement d\'essai actif trouvé',
            color: 'red',
            canCreateRequest: true,
            actions: ['reactivate_account'],
            blocked: true
          };
          break;
        }

        const daysLeftInTrial = Math.max(
          0,
          Math.ceil((new Date(activeSubscription.endDate) - now) / (1000 * 60 * 60 * 24))
        );
        statusInfo = {
          status: 'trial',
          title: 'Période d\'Essai Active',
          message: daysLeftInTrial <= 10
            ? `${daysLeftInTrial} jours restants - Vous pouvez maintenant choisir votre abonnement`
            : `${daysLeftInTrial} jours restants dans votre essai gratuit`,
          color: daysLeftInTrial <= 10 ? 'orange' : 'blue',
          canCreateRequest: daysLeftInTrial <= 10,
          actions: daysLeftInTrial <= 10
            ? ['view_features', 'upgrade_plan', 'choose_subscription']
            : ['view_features', 'upgrade_plan']
        };
        break;

      case 'active':
        if (!activeSubscription) {
          statusInfo = {
            status: 'suspended',
            title: 'Compte Suspendu',
            message: 'Aucun abonnement actif valide trouvé',
            color: 'red',
            canCreateRequest: true,
            actions: ['reactivate_account'],
            blocked: true
          };
          break;
        }

        const daysLeftInPlan = Math.max(
          0,
          Math.ceil((new Date(activeSubscription.endDate) - now) / (1000 * 60 * 60 * 24))
        );
        statusInfo = {
          status: 'active',
          title: 'Abonnement Actif',
          message: `Plan ${activeSubscription?.planType} - ${daysLeftInPlan} jours restants`,
          color: daysLeftInPlan <= 7 ? 'orange' : 'green',
          canCreateRequest: daysLeftInPlan < 10 ? true : false,
          actions: ['renew_plan', 'upgrade_plan', 'view_usage']
        };
        break;

      case 'grace_period':
        const graceTimeLeft = Math.ceil((queue.gracePeriodEnd - now) / (1000 * 60 * 60 * 24));
        statusInfo = {
          status: 'grace_period',
          title: 'Période de Grâce',
          message: `Votre compte sera suspendu dans ${graceTimeLeft} jours`,
          color: 'red',
          canCreateRequest: true,
          actions: ['urgent_renewal'],
          urgent: true
        };
        break;

      case 'suspended':
        statusInfo = {
          status: 'suspended',
          title: 'Compte Suspendu',
          message: seller?.suspensionReason || 'Abonnement expiré - Renouvelez pour réactiver',
          color: 'red',
          canCreateRequest: true,
          actions: ['reactivate_account'],
          blocked: true
        };
        break;

      default:
        statusInfo = {
          status: 'suspended',
          title: 'Compte Suspendu',
          message: seller?.suspensionReason || 'Statut abonnement incohérent détecté',
          color: 'red',
          canCreateRequest: true,
          actions: ['reactivate_account'],
          blocked: true
        };
        break;
    }

    // Informations sur la file d'attente avec détails de paiement
    const queueInfo = {
      hasQueuedSubscriptions: queue.queuedSubscriptions.length > 0,
      nextSubscriptions: await Promise.all(
        queue.queuedSubscriptions.map(async (q) => {
          const [sub, paymentRequest] = await Promise.all([
            PricingPlan.findById(q.subscriptionId),
            SubscriptionRequest.findOne({
              storeId: sellerId,
              linkedSubscriptionId: q.subscriptionId,
              status: { $in: ['pending_payment', 'payment_submitted', 'rejected', 'payment_verified', 'cancelled'] }
            }).sort({ createdAt: -1 })
          ]);

          const result = {
            planType: sub?.planType,
            estimatedStartDate: q.estimatedStartDate,
            status: paymentRequest?.status || q.status,
            queuePosition: q.queuePosition,
            subscriptionId: q.subscriptionId,
            createdAt: paymentRequest?.createdAt,
            updatedAt: paymentRequest?.updatedAt,
            requestDate: paymentRequest?.requestDate,
            cancelledAt: paymentRequest?.cancelledAt || null,
            archivedPlan: paymentRequest?.archivedPlan || null
          };

          if (paymentRequest) {
            result.paymentRequestId = paymentRequest._id;
            result.paymentDetails = {
              method: paymentRequest.paymentDetails?.method,
              amount: paymentRequest.paymentDetails?.amount,
              recipientPhone: paymentRequest.paymentDetails?.recipientPhone,
              paymentDeadline: paymentRequest.paymentDetails?.paymentDeadline,
              transferCode: paymentRequest.paymentDetails?.transferCode,
              senderPhone: paymentRequest.paymentDetails?.senderPhone,
              receiptUrl: paymentRequest.paymentDetails?.receiptFile,
              rejectionReason: paymentRequest.adminVerification?.rejectionReason || null,
              verificationStatus: paymentRequest.status,
              verifiedAt: paymentRequest.adminVerification?.verifiedAt || null
            };
          }

          return result;
        })
      )
    };

    return {
      seller,
      statusInfo,
      activeSubscription,
      queueInfo,
      history,
      productCount,
    };

  } catch (error) {
    console.error('Erreur récupération statut vendeur:', error);
    throw error;
  }
};

/**
 * Configuration des tâches automatisées
 */
// const setupUniversalCronJobs = () => {
//   // Vérifier les expirations et démarrer les périodes de grâce - tous les jours à 00:30
//   cron.schedule('30 0 * * *', () => {
//     console.log('Démarrage des périodes de grâce...');
//     startGracePeriod();
//   });

//   // Suspendre les comptes après période de grâce - tous les jours à 01:00
//   cron.schedule('0 1 * * *', () => {
//     console.log('Suspension des comptes expirés...');
//     suspendExpiredAccounts();
//   });

//   // Vérifier les activations automatiques - toutes les heures
//   cron.schedule('0 * * * *', async () => {
//     console.log('Vérification des activations automatiques...');
//     try {
//       const activeQueues = await SubscriptionQueue.find({
//         accountStatus: { $in: ['grace_period', 'active'] }
//       });

//       for (const queue of activeQueues) {
//         await checkAndActivateNextSubscription(queue.storeId);
//       }
//     } catch (error) {
//       console.error('Erreur vérification activations:', error);
//     }
//   });

//   console.log('Système de tâches automatisées universel configuré');
// };

// Fonction helper pour obtenir le numéro de paiement

const setupUniversalCronJobs = () => {
  // Vérifier les expirations et démarrer les périodes de grâce - tous les jours à 00:30
  cron.schedule('30 0 * * *', () => {
    console.log('Démarrage des périodes de grâce...');
    startGracePeriod();
  });

  // Suspendre les comptes après période de grâce - tous les jours à 01:00
  cron.schedule('0 1 * * *', () => {
    console.log('Suspension des comptes expirés...');
    suspendExpiredAccounts();
  });

  // Vérifier les activations automatiques - toutes les heures
  cron.schedule('0 * * * *', async () => {
    console.log('Vérification des activations automatiques...');
    try {
      const activeQueues = await SubscriptionQueue.find({
        accountStatus: { $in: ['grace_period', 'active'] }
      });

      for (const queue of activeQueues) {
        await checkAndActivateNextSubscription(queue.storeId);
      }
    } catch (error) {
      console.error('Erreur vérification activations:', error);
    }
  });

  console.log('Système de tâches automatisées universel configuré');

  // ⚡ Lancer immédiatement au démarrage
  (async () => {
    console.log('Exécution immédiate au démarrage...');
    await startGracePeriod();
    await suspendExpiredAccounts();

    // Vérification activations immédiate aussi
    try {
      const activeQueues = await SubscriptionQueue.find({
        accountStatus: { $in: ['grace_period', 'active'] }
      });
      for (const queue of activeQueues) {
        await checkAndActivateNextSubscription(queue.storeId);
      }
    } catch (error) {
      console.error('Erreur vérification activations immédiates:', error);
    }
  })();
};


const getPaymentPhone = (method) => {
  const phones = {
    mynita: "+22790123456",
    aman: "+22798765432",
    airtel_money: "+22787654321",
    orange_money: "+22776543210"
  };
  return phones[method] || phones.mynita;
};

/**
 * Obtenir les statistiques avancées pour l'admin
 */
const getAdvancedSubscriptionStats = async () => {
  try {
    const [
      totalSellers,
      trialAccounts,
      activeSubscriptions,
      gracePeriodAccounts,
      suspendedAccounts,
      queuedSubscriptions,
      todayRevenue,
      monthlyRevenue
    ] = await Promise.all([
      SubscriptionQueue.countDocuments(),
      SubscriptionQueue.countDocuments({ accountStatus: 'trial' }),
      SubscriptionQueue.countDocuments({ accountStatus: 'active' }),
      SubscriptionQueue.countDocuments({ accountStatus: 'grace_period' }),
      SubscriptionQueue.countDocuments({ accountStatus: 'suspended' }),
      SubscriptionQueue.aggregate([
        { $unwind: '$queuedSubscriptions' },
        { $match: { 'queuedSubscriptions.status': 'payment_verified' } },
        { $count: 'total' }
      ]),
      // Revenus du jour
      SubscriptionHistory.aggregate([
        {
          $match: {
            actionType: 'payment_confirmed',
            createdAt: {
              $gte: new Date(new Date().setHours(0, 0, 0, 0))
            }
          }
        },
        { $group: { _id: null, total: { $sum: '$paymentInfo.amount' } } }
      ]),
      // Revenus du mois
      SubscriptionHistory.aggregate([
        {
          $match: {
            actionType: 'payment_confirmed',
            createdAt: {
              $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            }
          }
        },
        { $group: { _id: null, total: { $sum: '$paymentInfo.amount' } } }
      ])
    ]);

    return {
      overview: {
        totalSellers,
        trialAccounts,
        activeSubscriptions,
        gracePeriodAccounts,
        suspendedAccounts,
        queuedSubscriptions: queuedSubscriptions[0]?.total || 0,
        todayRevenue: todayRevenue[0]?.total || 0,
        monthlyRevenue: monthlyRevenue[0]?.total || 0
      }
    };

  } catch (error) {
    console.error('Erreur calcul statistiques avancées:', error);
    throw error;
  }
};

module.exports = {
  createInitialSubscription,
  createFutureSubscriptionRequest,
  validatePaymentAndPrepareActivation,
  checkAndActivateNextSubscription,
  suspendExpiredAccounts,
  startGracePeriod,
  getSellerCompleteStatus,
  getAdvancedSubscriptionStats,
  setupUniversalCronJobs,
  PLAN_DEFAULTS
};