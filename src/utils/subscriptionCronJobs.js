const cron = require('node-cron');
const { SellerRequest, PricingPlan } = require('../Models');
const SubscriptionQueue = require('../models/Abonnements/SubscriptionQueue');
const SubscriptionHistory = require('../models/Abonnements/SubscriptionHistory');
const SubscriptionRequest = require('../models/Abonnements/SubscriptionRequest');
const nodemailer = require('nodemailer');

// Configuration du transporteur email
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS // Correction: utiliser EMAIL_PASS
  }
});

class SubscriptionCronJobs {
  /**
   * Vérifier et traiter les abonnements expirants et expirés
   */
  static async processExpiringSubscriptions() {
    try {
      console.log('🔍 Vérification des abonnements expirants...');
      
      const now = new Date();
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const in1Day = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
      const gracePeriodEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 jours de grâce

      // 1. Envoyer rappels d'expiration dans 7 jours
      const expiringSoon = await PricingPlan.find({
        status: 'active',
        endDate: { $gte: now, $lte: in7Days },
        'notifications.expiry7Days.sent': { $ne: true }
      }).populate('storeId', 'name email storeName');

      for (const subscription of expiringSoon) {
        await this.sendExpirationReminder(subscription, 7);
        await PricingPlan.findByIdAndUpdate(subscription._id, {
          'notifications.expiry7Days.sent': true,
          'notifications.expiry7Days.sentAt': now
        });
      }

      // 2. Envoyer rappels d'expiration dans 1 jour
      const expiringTomorrow = await PricingPlan.find({
        status: 'active',
        endDate: { $gte: now, $lte: in1Day },
        'notifications.expiry1Day.sent': { $ne: true }
      }).populate('storeId', 'name email storeName');

      for (const subscription of expiringTomorrow) {
        await this.sendExpirationReminder(subscription, 1);
        await PricingPlan.findByIdAndUpdate(subscription._id, {
          'notifications.expiry1Day.sent': true,
          'notifications.expiry1Day.sentAt': now
        });
      }

      // 3. Traiter les abonnements expirés (mettre en période de grâce)
      const expiredSubscriptions = await PricingPlan.find({
        status: 'active',
        endDate: { $lt: now }
      }).populate('storeId', 'name email storeName');

      for (const subscription of expiredSubscriptions) {
        await this.moveToGracePeriod(subscription);
      }

      // 4. Suspendre les comptes après la période de grâce
      const gracePeriodExpired = await SubscriptionQueue.find({
        accountStatus: 'grace_period',
        gracePeriodEnd: { $lt: now }
      }).populate('storeId', 'name email storeName');

      for (const queue of gracePeriodExpired) {
        await this.suspendAccount(queue);
      }

      console.log(`✅ Traitement terminé: 
        - ${expiringSoon.length} rappels 7 jours envoyés
        - ${expiringTomorrow.length} rappels 1 jour envoyés  
        - ${expiredSubscriptions.length} abonnements mis en période de grâce
        - ${gracePeriodExpired.length} comptes suspendus`);

    } catch (error) {
      console.error('❌ Erreur lors du traitement des expirations:', error);
    }
  }

  /**
   * Mettre un abonnement en période de grâce
   */
  static async moveToGracePeriod(subscription) {
    try {
      const gracePeriodEnd = new Date();
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7); // 7 jours de grâce

      // Mettre à jour l'abonnement
      await PricingPlan.findByIdAndUpdate(subscription._id, {
        status: 'expired'
      });

      // Mettre à jour ou créer la queue
      let queue = await SubscriptionQueue.findOne({ storeId: subscription.storeId });
      
      if (queue) {
        queue.accountStatus = 'grace_period';
        queue.gracePeriodEnd = gracePeriodEnd;
        queue.lastStatusChange = new Date();
        await queue.save();
      } else {
        queue = new SubscriptionQueue({
          storeId: subscription.storeId,
          accountStatus: 'grace_period',
          gracePeriodEnd,
          queuedSubscriptions: []
        });
        await queue.save();
      }

      // Envoyer notification d'expiration
      await this.sendExpirationNotification(subscription);

      // Ajouter à l'historique
      await SubscriptionHistory.create({
        storeId: subscription.storeId,
        actionType: 'expired',
        actionDetails: {
          previousPlan: {
            planType: subscription.planType,
            billingCycle: subscription.billingCycle
          },
          gracePeriodEnd,
          notes: 'Abonnement expiré - période de grâce de 7 jours accordée'
        },
        periodStart: subscription.startDate,
        periodEnd: subscription.endDate
      });

      console.log(`📅 Abonnement ${subscription.planType} de ${subscription.storeId.storeName} mis en période de grâce`);

    } catch (error) {
      console.error('❌ Erreur mise en période de grâce:', error);
    }
  }

  /**
   * Suspendre un compte après la période de grâce
   */
  static async suspendAccount(queue) {
    try {
      // Mettre à jour le statut du vendeur
      await SellerRequest.findByIdAndUpdate(queue.storeId, {
        subscriptionStatus: 'suspended',
        suspendedAt: new Date(),
        suspensionReason: 'Abonnement expiré'
      });

      // Mettre à jour la queue
      queue.accountStatus = 'suspended';
      queue.suspendedAt = new Date();
      queue.lastStatusChange = new Date();
      await queue.save();

      // Envoyer notification de suspension
      const seller = await SellerRequest.findById(queue.storeId);
      await this.sendSuspensionNotification(seller);

      // Ajouter à l'historique
      await SubscriptionHistory.create({
        storeId: queue.storeId,
        actionType: 'suspended',
        actionDetails: {
          reason: 'Période de grâce expirée',
          suspendedAt: new Date(),
          notes: 'Compte suspendu automatiquement après expiration de la période de grâce'
        }
      });

      console.log(`🚫 Compte ${seller.storeName} suspendu après expiration de la période de grâce`);

    } catch (error) {
      console.error('❌ Erreur suspension compte:', error);
    }
  }

  /**
   * Activer automatiquement les abonnements payés et vérifiés
   */
  static async activateVerifiedSubscriptions() {
    try {
      console.log('🔄 Activation des abonnements vérifiés...');

      const verifiedRequests = await SubscriptionRequest.find({
        status: 'payment_verified'
      }).populate('storeId', 'name email storeName');

      let activatedCount = 0;

      for (const request of verifiedRequests) {
        try {
          await this.activateSubscription(request);
          activatedCount++;
        } catch (error) {
          console.error(`❌ Erreur activation ${request._id}:`, error);
        }
      }

      console.log(`✅ ${activatedCount} abonnements activés automatiquement`);

    } catch (error) {
      console.error('❌ Erreur activation automatique:', error);
    }
  }

  /**
   * Activer un abonnement spécifique
   */
  static async activateSubscription(request) {
    const { createFutureSubscriptionRequest } = require('../controllers/subscriptionController');
    
    // Utiliser la fonction existante
    await createFutureSubscriptionRequest(
      request.storeId._id,
      request.requestedPlan.planType,
      request.requestedPlan.billingCycle || 'monthly'
    );

    // Marquer la demande comme activée
    await SubscriptionRequest.findByIdAndUpdate(request._id, {
      status: 'activated',
      processedAt: new Date()
    });

    console.log(`✅ Abonnement ${request.requestedPlan.planType} activé pour ${request.storeId.storeName}`);
  }

  /**
   * Envoyer un rappel d'expiration
   */
  static async sendExpirationReminder(subscription, daysLeft) {
    try {
      const seller = subscription.storeId;
      
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: seller.email,
        subject: `⚠️ Votre abonnement ${subscription.planType} expire dans ${daysLeft} jour(s)`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
            <div style="background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h2 style="color: #30A08B; text-align: center; margin-bottom: 30px;">
                ⚠️ Rappel d'expiration d'abonnement
              </h2>
              
              <p style="font-size: 16px;">Bonjour <strong>${seller.name}</strong>,</p>
              
              <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="margin: 0; font-size: 16px; color: #856404;">
                  <strong>⏰ Votre abonnement <span style="color: #30A08B;">${subscription.planType}</span> 
                  pour la boutique <span style="color: #30A08B;">"${seller.storeName}"</span> 
                  expire dans <span style="color: #e17055; font-size: 18px;">${daysLeft} jour(s)</span> !</strong>
                </p>
              </div>
              
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #2d3436; margin-top: 0;">📋 Détails de votre abonnement :</h3>
                <ul style="color: #636e72; line-height: 1.8;">
                  <li><strong>Plan :</strong> ${subscription.planType}</li>
                  <li><strong>Date d'expiration :</strong> ${subscription.endDate.toLocaleDateString('fr-FR')}</li>
                  <li><strong>Commission actuelle :</strong> ${subscription.commission}%</li>
                </ul>
              </div>
              
              <div style="background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="color: #0c5460; margin-top: 0;">🚨 Que se passe-t-il si vous ne renouvelez pas ?</h3>
                <ul style="color: #0c5460; line-height: 1.8;">
                  <li>Votre boutique sera suspendue temporairement</li>
                  <li>Vos clients ne pourront plus passer de commandes</li>
                  <li>Vous perdrez l'accès aux fonctionnalités premium</li>
                  <li>Période de grâce de 7 jours pour récupérer vos données</li>
                </ul>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'https://ihambaobab.com'}/seller/subscription" 
                   style="background: linear-gradient(135deg, #30A08B, #27AE60); color: white; padding: 15px 30px; 
                          text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; 
                          font-size: 16px; box-shadow: 0 4px 15px rgba(48, 160, 139, 0.3);">
                  🔄 Renouveler maintenant
                </a>
              </div>
              
              <div style="border-top: 1px solid #dee2e6; padding-top: 20px; margin-top: 30px;">
                <p style="color: #6c757d; font-size: 14px; text-align: center;">
                  💬 Besoin d'aide ? Contactez notre équipe support :<br>
                  📧 <a href="mailto:support@ihambaobab.com" style="color: #30A08B;">support@ihambaobab.com</a><br>
                  📱 WhatsApp : +227 XX XX XX XX
                </p>
              </div>
            </div>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`📧 Rappel d'expiration envoyé à ${seller.email} (${daysLeft} jour(s))`);

    } catch (error) {
      console.error('❌ Erreur envoi rappel:', error);
    }
  }

  /**
   * Envoyer notification d'expiration
   */
  static async sendExpirationNotification(subscription) {
    try {
      const seller = subscription.storeId;
      
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: seller.email,
        subject: `🚨 Votre abonnement ${subscription.planType} a expiré - Période de grâce accordée`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
            <div style="background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h2 style="color: #e74c3c; text-align: center; margin-bottom: 30px;">
                🚨 Abonnement expiré
              </h2>
              
              <p style="font-size: 16px;">Bonjour <strong>${seller.name}</strong>,</p>
              
              <div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="margin: 0; font-size: 16px; color: #721c24;">
                  <strong>Votre abonnement <span style="color: #e74c3c;">${subscription.planType}</span> 
                  pour "${seller.storeName}" a expiré le ${subscription.endDate.toLocaleDateString('fr-FR')}.</strong>
                </p>
              </div>
              
              <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="color: #155724; margin-top: 0;">✅ Période de grâce accordée</h3>
                <p style="color: #155724; margin: 0;">
                  Nous vous accordons <strong>7 jours supplémentaires</strong> pour renouveler votre abonnement 
                  sans perdre vos données. Votre boutique reste temporairement accessible.
                </p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'https://ihambaobab.com'}/seller/subscription" 
                   style="background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; padding: 15px 30px; 
                          text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; 
                          font-size: 16px; box-shadow: 0 4px 15px rgba(231, 76, 60, 0.3);">
                  🔄 Renouveler immédiatement
                </a>
              </div>
            </div>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`📧 Notification d'expiration envoyée à ${seller.email}`);

    } catch (error) {
      console.error('❌ Erreur envoi notification expiration:', error);
    }
  }

  /**
   * Envoyer notification de suspension
   */
  static async sendSuspensionNotification(seller) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: seller.email,
        subject: `🚫 Compte suspendu - ${seller.storeName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
            <div style="background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h2 style="color: #e74c3c; text-align: center; margin-bottom: 30px;">
                🚫 Compte suspendu
              </h2>
              
              <p style="font-size: 16px;">Bonjour <strong>${seller.name}</strong>,</p>
              
              <div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="margin: 0; font-size: 16px; color: #721c24;">
                  <strong>Votre compte "${seller.storeName}" a été suspendu car votre abonnement a expiré 
                  et la période de grâce est terminée.</strong>
                </p>
              </div>
              
              <div style="background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="color: #0c5460; margin-top: 0;">🔄 Comment réactiver votre compte ?</h3>
                <ol style="color: #0c5460; line-height: 1.8;">
                  <li>Connectez-vous à votre tableau de bord</li>
                  <li>Choisissez un nouveau plan d'abonnement</li>
                  <li>Effectuez le paiement</li>
                  <li>Votre compte sera réactivé immédiatement</li>
                </ol>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'https://ihambaobab.com'}/seller/login" 
                   style="background: linear-gradient(135deg, #30A08B, #27AE60); color: white; padding: 15px 30px; 
                          text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; 
                          font-size: 16px;">
                  🔓 Réactiver mon compte
                </a>
              </div>
            </div>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`📧 Notification de suspension envoyée à ${seller.email}`);

    } catch (error) {
      console.error('❌ Erreur envoi notification suspension:', error);
    }
  }

  /**
   * Nettoyage des données anciennes
   */
  static async cleanupOldData() {
    try {
      console.log('🧹 Nettoyage des données anciennes...');

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      // Nettoyer les anciennes demandes d'abonnement annulées
      const cleanedRequests = await SubscriptionRequest.deleteMany({
        status: 'cancelled',
        createdAt: { $lt: sixMonthsAgo }
      });

      // Nettoyer les anciens logs d'historique (garder 1 an)
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const cleanedHistory = await SubscriptionHistory.deleteMany({
        createdAt: { $lt: oneYearAgo },
        actionType: { $in: ['expired', 'suspended'] }
      });

      console.log(`✅ Nettoyage terminé: ${cleanedRequests.deletedCount} demandes et ${cleanedHistory.deletedCount} historiques supprimés`);

    } catch (error) {
      console.error('❌ Erreur nettoyage:', error);
    }
  }

  /**
   * Initialiser tous les cron jobs d'abonnement
   */
  static init() {
    console.log('🕐 Initialisation des cron jobs d\'abonnement...');

    // Vérification des expirations toutes les 6 heures
    cron.schedule('0 */6 * * *', async () => {
      console.log('🔍 Vérification programmée des abonnements...');
      await this.processExpiringSubscriptions();
    });

    // Activation automatique des abonnements vérifiés toutes les heures
    cron.schedule('0 * * * *', async () => {
      console.log('🔄 Activation automatique des abonnements...');
      await this.activateVerifiedSubscriptions();
    });

    // Nettoyage hebdomadaire le dimanche à 3h du matin
    cron.schedule('0 3 * * 0', async () => {
      console.log('🧹 Nettoyage hebdomadaire...');
      await this.cleanupOldData();
    });

    // Vérification d'urgence quotidienne à minuit
    cron.schedule('0 0 * * *', async () => {
      console.log('🚨 Vérification quotidienne d\'urgence...');
      await this.processExpiringSubscriptions();
    });

    console.log('✅ Cron jobs d\'abonnement initialisés avec succès');
  }

  static stop() {
    cron.destroy();
    console.log('🛑 Cron jobs d\'abonnement arrêtés');
  }
}

module.exports = SubscriptionCronJobs;
