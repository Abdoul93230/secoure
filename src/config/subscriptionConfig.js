/**
 * Configuration centralisée des abonnements
 * ⚠️ FICHIER CRITIQUE - Synchronise backend et frontend
 */

const SUBSCRIPTION_CONFIG = {
  PLANS: {
    Starter: {
      name: "Starter",
      description: "Parfait pour débuter votre activité en ligne",
      pricing: {
        monthly: 2500,
        annual: 27000,  // 2500 * 12 - 10% discount
        trialPeriod: 3  // mois gratuits
      },
      commission: 6.0,
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
      }
    },
    Pro: {
      name: "Pro",
      description: "La solution idéale pour les boutiques en croissance",
      pricing: {
        monthly: 4500,
        annual: 48600,  // 4500 * 12 - 10% discount
        trialPeriod: 0
      },
      commission: 3.5,
      productLimit: -1, // illimité
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
      }
    },
    Business: {
      name: "Business",
      description: "Pour les entreprises qui veulent se démarquer",
      pricing: {
        monthly: 9000,
        annual: 97200,  // 9000 * 12 - 10% discount
        trialPeriod: 0
      },
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
          responseTime: 4,
          channels: ["email", "chat", "phone"],
          onboarding: "dédié",
        },
        marketing: {
          marketplaceVisibility: "premium",
          maxActiveCoupons: -1,
          emailMarketing: true,
          abandonedCartRecovery: true,
          customMarketing: true,
        },
      }
    }
  },
  
  PAYMENT_METHODS: {
    mynita: { 
      phone: "+22790123456", 
      name: "iHambaObab Mynita",
      active: true
    },
    aman: { 
      phone: "+22798765432", 
      name: "iHambaObab Aman",
      active: true
    },
    airtel_money: { 
      phone: "+22787654321", 
      name: "iHambaObab Airtel Money",
      active: true
    },
    orange_money: { 
      phone: "+22776543210", 
      name: "iHambaObab Orange Money",
      active: true
    }
  },

  SUBSCRIPTION_STATUSES: {
    ACTIVE: 'active',
    EXPIRED: 'expired',
    SUSPENDED: 'suspended',
    CANCELLED: 'cancelled',
    PENDING: 'pending',
    TRIAL: 'trial'
  },

  REQUEST_STATUSES: {
    PENDING_PAYMENT: 'pending_payment',
    PAYMENT_SUBMITTED: 'payment_submitted',
    PAYMENT_VERIFIED: 'payment_verified',
    ACTIVATED: 'activated',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled'
  },

  GRACE_PERIOD_DAYS: 7,
  PAYMENT_DEADLINE_HOURS: 24,
  RENEWAL_REMINDER_DAYS: [7, 3, 1], // Jours avant expiration pour rappels

  // Méthodes utilitaires
  getPlanPrice: (planName, billingCycle = 'monthly') => {
    const plan = SUBSCRIPTION_CONFIG.PLANS[planName];
    return plan ? plan.pricing[billingCycle] : null;
  },

  calculateAnnualSavings: (planName) => {
    const plan = SUBSCRIPTION_CONFIG.PLANS[planName];
    if (!plan) return 0;
    return (plan.pricing.monthly * 12) - plan.pricing.annual;
  },

  getPlanFeatures: (planName) => {
    const plan = SUBSCRIPTION_CONFIG.PLANS[planName];
    return plan ? plan.features : null;
  }
};

module.exports = SUBSCRIPTION_CONFIG;
