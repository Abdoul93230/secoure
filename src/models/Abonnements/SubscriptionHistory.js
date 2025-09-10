const mongoose = require('mongoose');

// Nouveau modèle pour l'historique des abonnements
const subscriptionHistorySchema = new mongoose.Schema({
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SellerRequest",
    required: true,
  },
  
  // Référence à l'abonnement actuel/passé
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PricingPlan",
    required: true,
  },

  // Type d'action dans l'historique
  actionType: {
    type: String,
    required: true,
    enum: [
      'created',           // Création initial
      'renewed',           // Renouvellement
      'upgraded',          // Changement vers plan supérieur
      'downgraded',        // Changement vers plan inférieur
      'suspended',         // Suspension
      'reactivated',       // Réactivation
      'expired',           // Expiration
      'cancelled',         // Annulation
      'payment_pending',   // En attente de paiement
      'payment_confirmed', // Paiement confirmé
      'payment_rejected'   // Paiement rejeté
    ]
  },

  // Détails de l'action
  actionDetails: {
    performedBy: {
      type: String,
      enum: ['admin', 'seller', 'system'],
      required: true
    },
    
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin", // Si vous avez un modèle admin
      required: false
    },
    
    reason: String, // Raison de l'action
    notes: String,  // Notes administratives
    
    // Informations sur l'ancien plan (pour les changements)
    previousPlan: {
      planType: String,
      price: {
        monthly: Number,
        annual: Number
      },
      commission: Number,
      endDate: Date
    },
    
    // Informations sur le nouveau plan
    newPlan: {
      planType: String,
      price: {
        monthly: Number,
        annual: Number
      },
      commission: Number,
      startDate: Date,
      endDate: Date
    }
  },

  // Code de réactivation (pour les renouvellements manuels)
  reactivationCode: {
    code: String,
    used: {
      type: Boolean,
      default: false
    },
    usedAt: Date,
    expiresAt: Date
  },

  // Informations de paiement
  paymentInfo: {
    method: {
      type: String,
      enum: ['mynita', 'aman', 'airtel_money', 'orange_money', 'other']
    },
    
    amount: Number,
    currency: {
      type: String,
      default: 'XOF' // Franc CFA
    },
    
    // Code de transfert soumis par le vendeur
    transferCode: String,
    
    // Reçu uploadé par le vendeur
    receiptFile: String,
    
    // Numéro de téléphone utilisé pour le paiement
    senderPhone: String,
    
    // Numéro destinataire (votre numéro d'affaires)
    recipientPhone: String,
    
    // Statut du paiement
    paymentStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    },
    
    // Vérification par l'admin
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin"
    },
    verifiedAt: Date,
    verificationNotes: String
  },

  // Timestamp
  createdAt: {
    type: Date,
    default: Date.now,
  },
  
  // Période couverte par cette action
  periodStart: Date,
  periodEnd: Date,
  
  // Facturation
  invoiceNumber: String,
  billingCycle: {
    type: String,
    // enum: ['monthly', 'annual'],
    enum: ['trial', 'paid_monthly', 'paid_annual'],
    default: 'monthly'
  }
}, {
  timestamps: true
});

// Index pour optimiser les requêtes
subscriptionHistorySchema.index({ storeId: 1, createdAt: -1 });
subscriptionHistorySchema.index({ actionType: 1, createdAt: -1 });
subscriptionHistorySchema.index({ 'paymentInfo.paymentStatus': 1 });
subscriptionHistorySchema.index({ 'reactivationCode.code': 1 });

const SubscriptionHistory = mongoose.model("SubscriptionHistory", subscriptionHistorySchema);

module.exports = SubscriptionHistory;