const mongoose = require('mongoose');

/**
 * Modèle pour gérer la file d'attente des abonnements futurs
 * Permet aux vendeurs de préparer leur prochain abonnement avant l'expiration
 */
const subscriptionQueueSchema = new mongoose.Schema({
  // Référence au vendeur
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SellerRequest",
    required: true,
  },

  // Abonnement actuellement actif
  activeSubscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PricingPlan",
    required: false,
  },

  // File d'attente des abonnements futurs (ordre chronologique)
  queuedSubscriptions: [{
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PricingPlan",
      required: true,
    },
    queuePosition: {
      type: Number,
      required: true,
    },
    estimatedStartDate: {
      type: Date,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['pending_payment', 'payment_verified', 'ready_to_activate', 'activated'],
      default: 'pending_payment'
    }
  }],

  // Métadonnées
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  
  // Période de grâce (48h après expiration avant suspension)
  gracePeriodEnd: Date,
  
  // Statut global du compte vendeur
  accountStatus: {
    type: String,
    enum: ['trial', 'active', 'grace_period', 'suspended', 'blocked'],
    default: 'trial'
  }
}, {
  timestamps: true
});

// Index pour optimiser les requêtes
subscriptionQueueSchema.index({ storeId: 1 });
subscriptionQueueSchema.index({ accountStatus: 1 });
subscriptionQueueSchema.index({ gracePeriodEnd: 1 });


const SubscriptionQueueSchema = mongoose.model("SubscriptionQueue", subscriptionQueueSchema);

module.exports = SubscriptionQueueSchema;