const mongoose = require('mongoose');

/**
 * Modèle PromoCode moderne pour Ihambaobab
 * Gère les codes promo avec types (percentage/fixed), quotas, restrictions et historique d'usage
 */
const promoCodeSchema = new mongoose.Schema({
  // --- Identité du code ---
  code: {
    type: String,
    required: [true, "Le code promo est requis"],
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  description: {
    type: String,
    default: '',
  },

  // --- Type et valeur ---
  type: {
    type: String,
    required: [true, "Le type de réduction est requis"],
    enum: {
      values: ['percentage', 'fixed'],
      message: "Le type doit être 'percentage' ou 'fixed'",
    },
  },
  value: {
    type: Number,
    required: [true, "La valeur de réduction est requise"],
    min: [0, "La valeur ne peut pas être négative"],
  },

  // --- Fenêtre de validité ---
  startDate: {
    type: Date,
    default: Date.now,
  },
  endDate: {
    type: Date,
    required: [true, "La date de fin est requise"],
  },
  isActive: {
    type: Boolean,
    default: true,
  },

  // --- Limites ---
  minOrderAmount: {
    type: Number,
    default: 0,
    min: [0, "Le montant minimum ne peut pas être négatif"],
  },
  maxDiscount: {
    type: Number,
    default: null, // null = pas de plafond
  },
  maxUsage: {
    type: Number,
    default: null, // null = illimité
  },
  maxUsagePerUser: {
    type: Number,
    default: 1,
  },
  currentUsage: {
    type: Number,
    default: 0,
  },

  // --- Portée (restrictions) ---
  applicableProducts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
  }],
  applicableCategories: [{
    type: String,
  }],

  // --- Historique d'utilisation ---
  usageHistory: [{
    userId: { type: String, required: false },
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    discountAmount: { type: Number, required: true },
    orderAmount: { type: Number, required: true },
    usedAt: { type: Date, default: Date.now },
  }],

  // --- Métadonnées legacy ---
  isWelcomeCode: {
    type: Boolean,
    default: false,
  },
  clefUser: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
  strict: false,
});

// --- Index composites pour les requêtes fréquentes ---
promoCodeSchema.index({ code: 1, isActive: 1 });
promoCodeSchema.index({ endDate: 1, isActive: 1 });

// ========================================================
// MÉTHODES D'INSTANCE
// ========================================================

/**
 * Vérifie si le code promo est globalement valide
 * @returns {{ valid: boolean, message: string }}
 */
promoCodeSchema.methods.isValid = function () {
  const now = new Date();

  if (!this.isActive) {
    return { valid: false, message: "Ce code promo est désactivé" };
  }

  if (this.startDate && now < this.startDate) {
    return { valid: false, message: "Ce code promo n'est pas encore actif" };
  }

  if (this.endDate && now > this.endDate) {
    return { valid: false, message: "Ce code promo a expiré" };
  }

  if (this.maxUsage !== null && this.currentUsage >= this.maxUsage) {
    return { valid: false, message: "Ce code promo a atteint sa limite d'utilisation" };
  }

  return { valid: true, message: "Code valide" };
};

/**
 * Calcule la réduction pour un montant de commande donné
 * @param {number} orderAmount - Montant de la commande
 * @returns {{ discount: number, finalAmount: number }}
 */
promoCodeSchema.methods.calculateDiscount = function (orderAmount) {
  if (orderAmount < this.minOrderAmount) {
    return { discount: 0, finalAmount: orderAmount };
  }

  let discount = 0;

  if (this.type === 'percentage') {
    discount = Math.round((orderAmount * this.value) / 100);
    // Appliquer le plafond maxDiscount
    if (this.maxDiscount !== null && discount > this.maxDiscount) {
      discount = this.maxDiscount;
    }
  } else if (this.type === 'fixed') {
    discount = this.value;
  }

  // La réduction ne peut pas dépasser le montant de la commande
  discount = Math.min(discount, orderAmount);
  discount = Math.round(discount);

  const finalAmount = Math.round(orderAmount - discount);

  return { discount, finalAmount };
};

/**
 * Vérifie si un utilisateur peut encore utiliser ce code
 * @param {string} userId - ID de l'utilisateur
 * @returns {{ canUse: boolean, message: string }}
 */
promoCodeSchema.methods.canUserUse = function (userId) {
  // Si un quota par utilisateur est défini, l'ID utilisateur est obligatoire
  if (this.maxUsagePerUser !== null && !userId) {
    return { 
      canUse: false, 
      message: "Veuillez vous connecter pour utiliser ce code promo" 
    };
  }

  // Si pas de quota défini, tout le monde peut l'utiliser
  if (this.maxUsagePerUser === null) {
    return { canUse: true, message: "OK" };
  }

  const searchId = String(userId).trim();
  
  const userUsageCount = this.usageHistory.filter(
    (entry) => String(entry.userId).trim() === searchId
  ).length;

  if (userUsageCount >= this.maxUsagePerUser) {
    return {
      canUse: false,
      message: `Vous avez déjà utilisé ce code promo le nombre maximum de fois autorisé (${this.maxUsagePerUser})`,
    };
  }

  return { canUse: true, message: "OK" };
};

// ========================================================
// MÉTHODES STATIQUES
// ========================================================

/**
 * Met à jour automatiquement les codes expirés (pour le CRON)
 */
promoCodeSchema.statics.deactivateExpiredCodes = async function () {
  const now = new Date();
  const result = await this.updateMany(
    { endDate: { $lt: now }, isActive: true },
    { isActive: false }
  );
  return result;
};

/**
 * Recherche un code actif par son texte
 * @param {string} code
 */
promoCodeSchema.statics.findActiveByCode = async function (code) {
  return this.findOne({
    code: code.toUpperCase().trim(),
  });
};

const PromoCode = mongoose.model('PromoCodeV2', promoCodeSchema);

module.exports = PromoCode;
