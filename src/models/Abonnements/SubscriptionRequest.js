const mongoose = require('mongoose');

// Modèle pour les demandes d'abonnement des vendeurs
const subscriptionRequestSchema = new mongoose.Schema({
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SellerRequest",
    required: true,
  },

  // Plan demandé
  requestedPlan: {
    planType: {
      type: String,
      required: true,
      enum: ["Starter", "Pro", "Business"]
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'annual'],
      default: 'monthly'
    }
  },

  // Statut de la demande
  status: {
    type: String,
    enum: [
      'pending_payment',     // En attente de paiement
      'payment_submitted',   // Paiement soumis, en attente de vérification
      'payment_verified',    // Paiement vérifié, en attente d'activation
      'activated',           // Abonnement activé
      'rejected',            // Demande rejetée
      'cancelled'            // Demande annulée
    ],
    default: 'pending_payment'
  },

  // Informations de paiement
  paymentDetails: {
    method: {
      type: String,
      enum: ['mynita', 'aman', 'airtel_money', 'orange_money', 'other'],
      required: true
    },
    
    amount: {
      type: Number,
      required: true
    },
    
    // Numéros de téléphone pour le paiement
    recipientPhone: {
      type: String,
      required: true  // Votre numéro d'affaires
    },
    
    senderPhone: String, // Numéro du vendeur
    
    // Code de transfert soumis
    transferCode: String,
    
    // Reçu uploadé
    receiptFile: String,
    
    // Date limite pour soumettre le paiement
    paymentDeadline: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
    }
  },

  // Vérification administrative
  adminVerification: {
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin"
    },
    verifiedAt: Date,
    verificationNotes: String,
    rejectionReason: String
  },

  // Métadonnées
  requestDate: {
    type: Date,
    default: Date.now
  },
  
  processedAt: Date,
  
  // Notifications
  notificationsSent: [{
    type: {
      type: String,
      enum: ['reminder_payment', 'payment_confirmed', 'activation_ready', 'request_approved', 'request_rejected']
    },
    sentAt: Date,
    method: String // email, sms, etc.
  }]

}, {
  timestamps: true
});

subscriptionRequestSchema.index({ storeId: 1, status: 1 });
subscriptionRequestSchema.index({ status: 1, createdAt: -1 });
subscriptionRequestSchema.index({ 'paymentDetails.transferCode': 1 });

const SubscriptionRequest = mongoose.model("SubscriptionRequest", subscriptionRequestSchema);

module.exports = SubscriptionRequest;