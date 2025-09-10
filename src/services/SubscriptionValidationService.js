/**
 * Service de validation automatique des abonnements
 * Intègre les API de paiement pour validation auto
 */

const EnhancedSubscription = require('../models/Abonnements/EnhancedSubscription');
const SubscriptionRequest = require('../models/Abonnements/SubscriptionRequest');
const { SellerRequest } = require('../Models');
const nodemailer = require('nodemailer');
const SUBSCRIPTION_CONFIG = require('../config/subscriptionConfig');

class SubscriptionValidationService {
  constructor() {
    this.emailTransporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  /**
   * 🔍 Valider automatiquement les paiements Mobile Money
   */
  async validateMobileMoneyPayment(subscriptionRequestId) {
    try {
      const request = await SubscriptionRequest.findById(subscriptionRequestId)
        .populate('storeId', 'storeName email nomDuGerant');

      if (!request) {
        throw new Error('Demande d\'abonnement introuvable');
      }

      const { transferCode, method, amount, recipientPhone } = request.paymentDetails;

      // Simulation d'API de vérification (à remplacer par vraie API)
      const paymentValidation = await this.callPaymentAPI(method, transferCode, amount, recipientPhone);

      if (paymentValidation.success) {
        // ✅ Paiement validé automatiquement
        await this.processValidatedPayment(request, paymentValidation);
        return {
          success: true,
          message: 'Paiement validé automatiquement',
          validationData: paymentValidation
        };
      } else {
        // ❌ Paiement non trouvé ou invalide
        await this.markPaymentAsFailed(request, paymentValidation.error);
        return {
          success: false,
          message: 'Paiement non validé',
          error: paymentValidation.error
        };
      }

    } catch (error) {
      console.error('Erreur validation automatique:', error);
      throw error;
    }
  }

  /**
   * 🔗 Appeler l'API de validation du paiement
   */
  async callPaymentAPI(method, transferCode, amount, recipientPhone) {
    try {
      // 🚨 SIMULATION - À remplacer par vraies API
      switch (method) {
        case 'mynita':
          return await this.validateMynitaPayment(transferCode, amount, recipientPhone);
        case 'aman':
          return await this.validateAmanPayment(transferCode, amount, recipientPhone);
        case 'airtel_money':
          return await this.validateAirtelPayment(transferCode, amount, recipientPhone);
        case 'orange_money':
          return await this.validateOrangePayment(transferCode, amount, recipientPhone);
        default:
          return { success: false, error: 'Méthode de paiement non supportée' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 💳 Valider paiement Mynita (simulation)
   */
  async validateMynitaPayment(transferCode, amount, recipientPhone) {
    // Simulation d'appel API Mynita
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Validation simple du format de code
    if (transferCode.length >= 8 && transferCode.length <= 12) {
      return {
        success: true,
        transactionId: `MYNITA_${transferCode}`,
        validatedAmount: amount,
        validationTime: new Date(),
        fee: amount * 0.01 // Frais 1%
      };
    }

    return {
      success: false,
      error: 'Code de transfert Mynita invalide'
    };
  }

  /**
   * 💳 Valider paiement Aman (simulation)
   */
  async validateAmanPayment(transferCode, amount, recipientPhone) {
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (transferCode.startsWith('AM') && transferCode.length === 10) {
      return {
        success: true,
        transactionId: `AMAN_${transferCode}`,
        validatedAmount: amount,
        validationTime: new Date(),
        fee: amount * 0.015 // Frais 1.5%
      };
    }

    return {
      success: false,
      error: 'Code de transfert Aman invalide'
    };
  }

  /**
   * 💳 Valider paiement Airtel Money (simulation)
   */
  async validateAirtelPayment(transferCode, amount, recipientPhone) {
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (transferCode.length === 10 && /^\d+$/.test(transferCode)) {
      return {
        success: true,
        transactionId: `AIRTEL_${transferCode}`,
        validatedAmount: amount,
        validationTime: new Date(),
        fee: amount * 0.02 // Frais 2%
      };
    }

    return {
      success: false,
      error: 'Code de transfert Airtel Money invalide'
    };
  }

  /**
   * 💳 Valider paiement Orange Money (simulation)
   */
  async validateOrangePayment(transferCode, amount, recipientPhone) {
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (transferCode.startsWith('OR') && transferCode.length >= 8) {
      return {
        success: true,
        transactionId: `ORANGE_${transferCode}`,
        validatedAmount: amount,
        validationTime: new Date(),
        fee: amount * 0.025 // Frais 2.5%
      };
    }

    return {
      success: false,
      error: 'Code de transfert Orange Money invalide'
    };
  }

  /**
   * ✅ Traiter un paiement validé
   */
  async processValidatedPayment(request, validationData) {
    try {
      // 1. Mettre à jour la demande d'abonnement
      await SubscriptionRequest.findByIdAndUpdate(request._id, {
        status: 'payment_verified',
        'adminVerification.verifiedAt': new Date(),
        'adminVerification.verificationNotes': 'Validation automatique réussie',
        'adminVerification.verifiedBy': null, // Validation auto
        processedAt: new Date(),
        'paymentDetails.transactionId': validationData.transactionId,
        $push: {
          notificationsSent: {
            type: 'payment_confirmed',
            sentAt: new Date(),
            method: 'email'
          }
        }
      });

      // 2. Activer automatiquement l'abonnement
      await this.activateSubscription(request, validationData);

      // 3. Envoyer email de confirmation
      await this.sendPaymentConfirmationEmail(request, validationData);

      console.log(`✅ Paiement validé automatiquement pour ${request.storeId}`);

    } catch (error) {
      console.error('Erreur traitement paiement validé:', error);
      throw error;
    }
  }

  /**
   * ❌ Marquer un paiement comme échoué
   */
  async markPaymentAsFailed(request, errorMessage) {
    await SubscriptionRequest.findByIdAndUpdate(request._id, {
      status: 'rejected',
      'adminVerification.rejectionReason': `Validation automatique échouée: ${errorMessage}`,
      'adminVerification.verifiedAt': new Date(),
      processedAt: new Date(),
      $push: {
        notificationsSent: {
          type: 'request_rejected',
          sentAt: new Date(),
          method: 'email'
        }
      }
    });

    await this.sendPaymentRejectionEmail(request, errorMessage);
  }

  /**
   * 🚀 Activer automatiquement l'abonnement
   */
  async activateSubscription(request, validationData) {
    try {
      const planConfig = SUBSCRIPTION_CONFIG.PLANS[request.requestedPlan.planType];
      
      if (!planConfig) {
        throw new Error(`Configuration du plan ${request.requestedPlan.planType} introuvable`);
      }

      // Calculer les dates
      const startDate = new Date();
      const endDate = new Date();
      
      if (request.requestedPlan.billingCycle === 'annual') {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
      }

      // Créer le nouvel abonnement
      const newSubscription = new EnhancedSubscription({
        storeId: request.storeId,
        planType: request.requestedPlan.planType,
        billingCycle: request.requestedPlan.billingCycle,
        pricing: {
          monthly: planConfig.pricing.monthly,
          annual: planConfig.pricing.annual,
          effectivePrice: request.paymentDetails.amount
        },
        commission: planConfig.commission,
        features: planConfig.features,
        status: 'active',
        dates: {
          startDate,
          endDate,
          nextBilling: endDate
        },
        paymentInfo: {
          lastPaymentDate: new Date(),
          lastPaymentAmount: request.paymentDetails.amount,
          lastPaymentMethod: request.paymentDetails.method,
          paymentStatus: 'paid',
          transactionId: validationData.transactionId,
          invoiceNumber: `INV-${Date.now()}-${request.storeId}`
        },
        metadata: {
          createdBy: {
            userId: null,
            role: 'system',
            name: 'Auto Validation System'
          }
        }
      });

      await newSubscription.save();

      // Mettre à jour le vendeur
      await SellerRequest.findByIdAndUpdate(request.storeId, {
        subscriptionStatus: 'active',
        currentPlan: request.requestedPlan.planType,
        subscriptionEndDate: endDate
      });

      console.log(`🚀 Abonnement activé automatiquement: ${newSubscription._id}`);
      return newSubscription;

    } catch (error) {
      console.error('Erreur activation automatique:', error);
      throw error;
    }
  }

  /**
   * 📧 Envoyer email de confirmation de paiement
   */
  async sendPaymentConfirmationEmail(request, validationData) {
    try {
      const seller = request.storeId;
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: seller.email,
        subject: '✅ Paiement confirmé - Votre abonnement est activé',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #30A08B, #B2905F); color: white; padding: 20px; text-align: center;">
              <h1>🎉 Paiement Confirmé!</h1>
            </div>
            
            <div style="padding: 20px; background: #f9f9f9;">
              <h2>Bonjour ${seller.nomDuGerant},</h2>
              
              <p>Excellente nouvelle! Votre paiement a été validé automatiquement et votre abonnement <strong>${request.requestedPlan.planType}</strong> est maintenant actif.</p>
              
              <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3>Détails de votre abonnement:</h3>
                <ul style="list-style: none; padding: 0;">
                  <li>📦 <strong>Plan:</strong> ${request.requestedPlan.planType}</li>
                  <li>💰 <strong>Montant:</strong> ${request.paymentDetails.amount.toLocaleString()} FCFA</li>
                  <li>🔄 <strong>Cycle:</strong> ${request.requestedPlan.billingCycle === 'annual' ? 'Annuel' : 'Mensuel'}</li>
                  <li>🆔 <strong>Transaction:</strong> ${validationData.transactionId}</li>
                </ul>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.SELLER_DASHBOARD_URL}" 
                   style="background: #30A08B; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
                   Accéder à mon tableau de bord
                </a>
              </div>
              
              <p>Vous pouvez maintenant profiter de toutes les fonctionnalités de votre plan!</p>
              
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
              <p style="font-size: 12px; color: #666;">
                Cette validation a été effectuée automatiquement par notre système sécurisé.
              </p>
            </div>
          </div>
        `
      };

      await this.emailTransporter.sendMail(mailOptions);
      console.log(`📧 Email de confirmation envoyé à ${seller.email}`);

    } catch (error) {
      console.error('Erreur envoi email confirmation:', error);
      // Ne pas faire échouer le processus principal pour un email
    }
  }

  /**
   * 📧 Envoyer email de rejet de paiement
   */
  async sendPaymentRejectionEmail(request, errorMessage) {
    try {
      const seller = request.storeId;
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: seller.email,
        subject: '❌ Problème avec votre paiement d\'abonnement',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #e74c3c; color: white; padding: 20px; text-align: center;">
              <h1>⚠️ Problème de Paiement</h1>
            </div>
            
            <div style="padding: 20px; background: #f9f9f9;">
              <h2>Bonjour ${seller.nomDuGerant},</h2>
              
              <p>Nous n'avons pas pu valider votre paiement pour l'abonnement <strong>${request.requestedPlan.planType}</strong>.</p>
              
              <div style="background: #fff3cd; color: #856404; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
                <strong>Raison:</strong> ${errorMessage}
              </div>
              
              <p>Que faire maintenant?</p>
              <ol>
                <li>Vérifiez que le code de transfert est correct</li>
                <li>Assurez-vous que le montant correspond exactement</li>
                <li>Contactez votre opérateur pour confirmation</li>
                <li>Soumettez une nouvelle demande si nécessaire</li>
              </ol>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.SELLER_SUBSCRIPTION_URL}" 
                   style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
                   Réessayer mon paiement
                </a>
              </div>
              
              <p>Notre équipe support reste à votre disposition pour vous aider.</p>
            </div>
          </div>
        `
      };

      await this.emailTransporter.sendMail(mailOptions);
      console.log(`📧 Email de rejet envoyé à ${seller.email}`);

    } catch (error) {
      console.error('Erreur envoi email rejet:', error);
    }
  }

  /**
   * 🔄 Traitement en lot des validations automatiques
   */
  async processPendingValidations() {
    try {
      const pendingRequests = await SubscriptionRequest.find({
        status: 'payment_submitted',
        'paymentDetails.transferCode': { $exists: true, $ne: '' }
      }).populate('storeId', 'storeName email nomDuGerant');

      console.log(`🔍 ${pendingRequests.length} demandes en attente de validation automatique`);

      const results = {
        validated: 0,
        failed: 0,
        errors: []
      };

      for (const request of pendingRequests) {
        try {
          const result = await this.validateMobileMoneyPayment(request._id);
          if (result.success) {
            results.validated++;
          } else {
            results.failed++;
          }
        } catch (error) {
          results.errors.push({
            requestId: request._id,
            error: error.message
          });
          results.failed++;
        }
      }

      console.log(`✅ Validation automatique terminée: ${results.validated} validés, ${results.failed} échoués`);
      return results;

    } catch (error) {
      console.error('Erreur traitement lot validations:', error);
      throw error;
    }
  }
}

module.exports = new SubscriptionValidationService();
