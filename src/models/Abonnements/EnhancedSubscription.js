/**
 * Modèle amélioré pour les abonnements avec tracking complet
 * Remplace/complète le modèle PricingPlan existant
 */

const mongoose = require('mongoose');

const enhancedSubscriptionSchema = new mongoose.Schema({
  // Référence au vendeur
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SellerRequest",
    required: true,
    index: true
  },

  // Configuration du plan
  planType: {
    type: String,
    required: true,
    enum: ["Starter", "Pro", "Business"],
    index: true
  },

  billingCycle: {
    type: String,
    enum: ['monthly', 'annual'],
    default: 'monthly'
  },

  // Prix et commission
  pricing: {
    monthly: { type: Number, required: true },
    annual: { type: Number, required: true },
    effectivePrice: { type: Number, required: true }, // Prix réellement payé
  },

  commission: { 
    type: Number, 
    required: true,
    min: 0,
    max: 100
  },

  // Limites et fonctionnalités
  features: {
    productLimit: { type: Number, default: 10 }, // -1 = illimité
    maxVariants: { type: Number, default: 3 },
    maxCategories: { type: Number, default: 5 },
    
    paymentOptions: {
      manualPayment: { type: Boolean, default: true },
      mobileMoney: { type: Boolean, default: true },
      cardPayment: { type: Boolean, default: false },
      customPayment: { type: Boolean, default: false }
    },
    
    marketing: {
      marketplaceVisibility: { 
        type: String, 
        enum: ['standard', 'prioritaire', 'premium'],
        default: 'standard'
      },
      maxActiveCoupons: { type: Number, default: 1 },
      emailMarketing: { type: Boolean, default: false },
      abandonedCartRecovery: { type: Boolean, default: false }
    },
    
    support: {
      responseTime: { type: Number, default: 48 }, // heures
      channels: [{ type: String, enum: ['email', 'chat', 'phone'] }],
      onboarding: { 
        type: String, 
        enum: ['standard', 'personnalisé', 'dédié'],
        default: 'standard'
      }
    }
  },

  // Statut et dates
  status: {
    type: String,
    enum: ['active', 'expired', 'suspended', 'cancelled', 'pending', 'trial'],
    default: 'pending',
    index: true
  },

  dates: {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    trialEndDate: Date, // Pour les périodes d'essai
    suspendedAt: Date,
    cancelledAt: Date,
    lastRenewal: Date,
    nextBilling: Date
  },

  // Période d'essai
  trial: {
    isTrialPeriod: { type: Boolean, default: false },
    trialDuration: { type: Number, default: 0 }, // En mois
    originalPlan: String // Plan après la période d'essai
  },

  // Informations de paiement
  paymentInfo: {
    lastPaymentDate: Date,
    lastPaymentAmount: Number,
    lastPaymentMethod: String,
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending'
    },
    transactionId: String,
    invoiceNumber: String,
    receipt: String // URL du reçu
  },

  // Renouvellement automatique
  autoRenewal: {
    enabled: { type: Boolean, default: false },
    paymentMethod: String,
    failedAttempts: { type: Number, default: 0 },
    lastAttempt: Date,
    nextAttempt: Date
  },

  // Upgrades et downgrades
  planHistory: [{
    previousPlan: String,
    newPlan: String,
    changeDate: Date,
    reason: String,
    proratedAmount: Number,
    effectiveDate: Date
  }],

  // Suspension et grace period
  suspension: {
    reason: String,
    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin"
    },
    suspendedAt: Date,
    gracePeriodEnd: Date,
    autoSuspend: { type: Boolean, default: false }
  },

  // Usage et métriques
  usage: {
    currentProducts: { type: Number, default: 0 },
    currentVariants: { type: Number, default: 0 },
    currentCategories: { type: Number, default: 0 },
    monthlyOrders: { type: Number, default: 0 },
    monthlyRevenue: { type: Number, default: 0 }
  },

  // Notifications et rappels
  notifications: {
    remindersSent: [{
      type: { 
        type: String, 
        enum: ['expiration', 'payment_due', 'trial_ending', 'suspension_warning']
      },
      sentAt: Date,
      daysBeforeExpiry: Number
    }],
    lastReminderSent: Date,
    emailNotifications: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: false }
  },

  // Métadonnées
  metadata: {
    createdBy: {
      userId: mongoose.Schema.Types.ObjectId,
      role: { type: String, enum: ['system', 'admin', 'seller'] },
      name: String
    },
    lastModifiedBy: {
      userId: mongoose.Schema.Types.ObjectId,
      role: { type: String, enum: ['system', 'admin', 'seller'] },
      name: String
    },
    migrationData: {
      migratedFrom: String,
      migrationDate: Date,
      originalId: String
    }
  },

  // Données de conformité
  compliance: {
    termsAccepted: { type: Boolean, default: false },
    termsAcceptedDate: Date,
    dataProcessingConsent: { type: Boolean, default: false },
    lastComplianceCheck: Date
  }

}, {
  timestamps: true,
  collection: 'enhanced_subscriptions'
});

// ================ INDICES ================
enhancedSubscriptionSchema.index({ storeId: 1, status: 1 });
enhancedSubscriptionSchema.index({ planType: 1, status: 1 });
enhancedSubscriptionSchema.index({ 'dates.endDate': 1, status: 1 });
enhancedSubscriptionSchema.index({ 'dates.nextBilling': 1 });
enhancedSubscriptionSchema.index({ 'autoRenewal.enabled': 1, 'autoRenewal.nextAttempt': 1 });

// ================ MÉTHODES D'INSTANCE ================

// Vérifier si l'abonnement est actif
enhancedSubscriptionSchema.methods.isActive = function() {
  return this.status === 'active' && new Date() < this.dates.endDate;
};

// Vérifier si l'abonnement est en période d'essai
enhancedSubscriptionSchema.methods.isInTrial = function() {
  return this.trial.isTrialPeriod && this.status === 'trial' && 
         (!this.dates.trialEndDate || new Date() < this.dates.trialEndDate);
};

// Calculer les jours restants
enhancedSubscriptionSchema.methods.getDaysRemaining = function() {
  const today = new Date();
  const endDate = new Date(this.dates.endDate);
  const diffTime = endDate - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Vérifier si l'abonnement a besoin d'un rappel
enhancedSubscriptionSchema.methods.needsReminderNotification = function(daysBefore = 7) {
  const daysRemaining = this.getDaysRemaining();
  const lastReminder = this.notifications.lastReminderSent;
  
  if (daysRemaining <= daysBefore && daysRemaining > 0) {
    if (!lastReminder) return true;
    
    // Envoyer un rappel maximum une fois par jour
    const daysSinceLastReminder = Math.floor((new Date() - lastReminder) / (1000 * 60 * 60 * 24));
    return daysSinceLastReminder >= 1;
  }
  
  return false;
};

// Mettre à jour l'usage
enhancedSubscriptionSchema.methods.updateUsage = async function(usageData) {
  this.usage = { ...this.usage, ...usageData };
  this.metadata.lastModifiedBy = {
    userId: null,
    role: 'system',
    name: 'Usage Update System'
  };
  return this.save();
};

// ================ MÉTHODES STATIQUES ================

// Trouver les abonnements expirant bientôt
enhancedSubscriptionSchema.statics.findExpiringSubscriptions = function(days = 7) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  
  return this.find({
    status: { $in: ['active', 'trial'] },
    'dates.endDate': { $lte: futureDate, $gte: new Date() }
  }).populate('storeId', 'storeName email nomDuGerant');
};

// Trouver les abonnements à renouveler automatiquement
enhancedSubscriptionSchema.statics.findAutoRenewalDue = function() {
  return this.find({
    'autoRenewal.enabled': true,
    'autoRenewal.nextAttempt': { $lte: new Date() },
    status: { $in: ['active', 'trial'] }
  }).populate('storeId', 'storeName email');
};

// Statistiques par période
enhancedSubscriptionSchema.statics.getStatsByPeriod = async function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$planType',
        count: { $sum: 1 },
        totalRevenue: { $sum: '$pricing.effectivePrice' },
        avgCommission: { $avg: '$commission' }
      }
    }
  ]);
};

// ================ MIDDLEWARE ================

// Middleware pre-save pour validation et calculs automatiques
enhancedSubscriptionSchema.pre('save', function(next) {
  // Calculer automatiquement nextBilling si autoRenewal activé
  if (this.autoRenewal.enabled && !this.autoRenewal.nextAttempt) {
    const nextBilling = new Date(this.dates.endDate);
    nextBilling.setDate(nextBilling.getDate() - 3); // 3 jours avant expiration
    this.autoRenewal.nextAttempt = nextBilling;
  }
  
  // Générer un numéro de facture si pas présent
  if (!this.paymentInfo.invoiceNumber && this.status === 'active') {
    this.paymentInfo.invoiceNumber = `INV-${Date.now()}-${this.storeId}`;
  }
  
  // Mettre à jour dates.nextBilling
  if (this.billingCycle === 'monthly') {
    const nextBilling = new Date(this.dates.endDate);
    nextBilling.setMonth(nextBilling.getMonth() + 1);
    this.dates.nextBilling = nextBilling;
  } else if (this.billingCycle === 'annual') {
    const nextBilling = new Date(this.dates.endDate);
    nextBilling.setFullYear(nextBilling.getFullYear() + 1);
    this.dates.nextBilling = nextBilling;
  }
  
  next();
});

// Middleware post-save pour actions supplémentaires
enhancedSubscriptionSchema.post('save', function(doc) {
  // Log des changements critiques
  if (this.isModified('status')) {
    console.log(`Subscription ${doc._id} status changed to: ${doc.status}`);
  }
});

const EnhancedSubscription = mongoose.model('EnhancedSubscription', enhancedSubscriptionSchema);

module.exports = EnhancedSubscription;
