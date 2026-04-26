/**
 * Configuration centralisée des abonnements
 * ⚠️ FICHIER CRITIQUE - Synchronise backend et frontend
 */

const SUBSCRIPTION_CONFIG = {
  PLANS: {
    Starter: {
      name: "Starter",
      description: "Inclut 2 mois gratuits pour toute nouvelle création de compte. Idéal pour les entrepreneurs débutants, petits artisans et testeurs de marché.",
      pricing: {
        monthly: 1000,
        annual: 10800,  // 1000 * 12 - 10% discount
        trialPeriod: 2  // mois gratuits
      },
      commission: 3.0,
      productLimit: 20,
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
      description: "Pour les vendeurs réguliers souhaitant un meilleur taux de commission.",
      pricing: {
        monthly: 2500,
        annual: 27000,  // 2500 * 12 - 10% discount
        trialPeriod: 0
      },
      commission: 2.5,
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
      description: "Pour les vendeurs établis avec un volume de vente élevé.",
      pricing: {
        monthly: 5000,
        annual: 54000,  // 5000 * 12 - 10% discount
        trialPeriod: 0
      },
      commission: 2.0,
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
  },

  DEFAULT_COMMISSION: 3.0  // Plan Starter par défaut
};

module.exports = SUBSCRIPTION_CONFIG;
