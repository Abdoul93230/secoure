/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║        SOURCE UNIQUE DE VÉRITÉ — PLANS ABONNEMENTS          ║
 * ║  Modifier ICI uniquement. Tout le backend et le frontend     ║
 * ║  lisent ces valeurs. Ne pas dupliquer dans d'autres fichiers.║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const SUBSCRIPTION_CONFIG = {

  PLANS: {
    Starter: {
      name: "Starter",
      description: "Idéal pour débuter. 2 mois d'essai gratuit.",
      pricing: {
        monthly: 1000,
        annual: 10800,   // 1000 * 12 - 10%
        trialMonths: 2,
        annualDiscount: 0.10,
      },
      commission: 3.0,   // % prélevé sur chaque vente marketplace
      productLimit: 20,
      features: {
        pos: false,      // Caisse POS non incluse
        productManagement: {
          maxProducts: 20,
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
      },
    },

    Pro: {
      name: "Pro",
      description: "Pour les vendeurs réguliers avec plus de volume.",
      pricing: {
        monthly: 2500,
        annual: 27000,   // 2500 * 12 - 10%
        trialMonths: 0,
        annualDiscount: 0.10,
      },
      commission: 2.5,
      productLimit: -1,  // illimité
      features: {
        pos: true,       // ✅ Caisse POS incluse — 0% commission sur ventes physiques
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
      },
    },

    Business: {
      name: "Business",
      description: "Pour les vendeurs établis à fort volume.",
      pricing: {
        monthly: 5000,
        annual: 54000,   // 5000 * 12 - 10%
        trialMonths: 0,
        annualDiscount: 0.10,
      },
      commission: 2.0,
      productLimit: -1,
      features: {
        pos: true,       // ✅ Caisse POS incluse — 0% commission sur ventes physiques
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
      },
    },
  },

  // Commission par défaut si le plan du seller n'est pas trouvé
  DEFAULT_COMMISSION: 3.0,

  PAYMENT_METHODS: {
    mynita:       { phone: "+22790123456", name: "iHambaObab Mynita",       active: true },
    aman:         { phone: "+22798765432", name: "iHambaObab Aman",         active: true },
    airtel_money: { phone: "+22787654321", name: "iHambaObab Airtel Money", active: true },
    orange_money: { phone: "+22776543210", name: "iHambaObab Orange Money", active: true },
  },

  SUBSCRIPTION_STATUSES: {
    ACTIVE:    'active',
    EXPIRED:   'expired',
    SUSPENDED: 'suspended',
    CANCELLED: 'cancelled',
    PENDING:   'pending',
    TRIAL:     'trial',
  },

  REQUEST_STATUSES: {
    PENDING_PAYMENT:   'pending_payment',
    PAYMENT_SUBMITTED: 'payment_submitted',
    PAYMENT_VERIFIED:  'payment_verified',
    ACTIVATED:         'activated',
    REJECTED:          'rejected',
    CANCELLED:         'cancelled',
  },

  GRACE_PERIOD_DAYS:        7,
  PAYMENT_DEADLINE_HOURS:   24,
  RENEWAL_REMINDER_DAYS:    [7, 3, 1],

  // ─── Utilitaires ──────────────────────────────────────────────

  getPlan(planName) {
    return SUBSCRIPTION_CONFIG.PLANS[planName] || null;
  },

  getPlanPrice(planName, billingCycle = 'monthly') {
    const plan = SUBSCRIPTION_CONFIG.PLANS[planName];
    return plan ? plan.pricing[billingCycle] : null;
  },

  getPlanCommission(planName) {
    const plan = SUBSCRIPTION_CONFIG.PLANS[planName];
    return plan ? plan.commission : SUBSCRIPTION_CONFIG.DEFAULT_COMMISSION;
  },

  calculateAnnualSavings(planName) {
    const plan = SUBSCRIPTION_CONFIG.PLANS[planName];
    if (!plan) return 0;
    return (plan.pricing.monthly * 12) - plan.pricing.annual;
  },

  getPlanFeatures(planName) {
    const plan = SUBSCRIPTION_CONFIG.PLANS[planName];
    return plan ? plan.features : null;
  },

  hasPosAccess(planName) {
    const plan = SUBSCRIPTION_CONFIG.PLANS[planName];
    return plan ? plan.features.pos === true : false;
  },

  // Retourne un objet compatible avec l'ancien PLAN_DEFAULTS (price + commission + productLimit + features)
  toPlanDefaults(planName) {
    const plan = SUBSCRIPTION_CONFIG.PLANS[planName];
    if (!plan) return null;
    return {
      price:        { monthly: plan.pricing.monthly, annual: plan.pricing.annual },
      commission:   plan.commission,
      productLimit: plan.productLimit,
      trialMonths:  plan.pricing.trialMonths,
      features:     plan.features,
    };
  },
};

module.exports = SUBSCRIPTION_CONFIG;
