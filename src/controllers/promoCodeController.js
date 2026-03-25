const PromoCode = require('../models/PromoCode');

// ========================================================
// ROUTES CLIENT
// ========================================================

/**
 * POST /api/promocodes/validate
 * Valide un code promo et retourne la réduction calculée
 */
const validatePromoCode = async (req, res) => {
  try {
    const { code, orderAmount, userId, products } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: "Le code promo est requis",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        valid: false,
        message: "Veuillez vous connecter pour utiliser un code promo",
      });
    }

    if (!orderAmount || orderAmount <= 0) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: "Le montant de la commande est requis et doit être positif",
      });
    }

    // 1. Rechercher le code
    const promoCode = await PromoCode.findActiveByCode(code);

    if (!promoCode) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: "Ce code promo n'existe pas",
      });
    }

    // 2. Vérifier la validité globale
    const validity = promoCode.isValid();
    if (!validity.valid) {
      return res.status(200).json({
        success: true,
        valid: false,
        message: validity.message,
      });
    }

    // 3. Vérifier la limite par utilisateur
    if (userId) {
      const userCheck = promoCode.canUserUse(userId);
      if (!userCheck.canUse) {
        return res.status(200).json({
          success: true,
          valid: false,
          message: userCheck.message,
        });
      }
    }

    // 4. Vérifier le montant minimum de commande
    if (orderAmount < promoCode.minOrderAmount) {
      return res.status(200).json({
        success: true,
        valid: false,
        message: `Le montant minimum de commande est de ${promoCode.minOrderAmount} XOF`,
      });
    }

    // 5. Vérifier les restrictions de produits
    if (promoCode.applicableProducts && promoCode.applicableProducts.length > 0 && products) {
      const productIds = products.map(p => p.toString());
      const applicableIds = promoCode.applicableProducts.map(p => p.toString());
      const hasApplicableProduct = productIds.some(pid => applicableIds.includes(pid));

      if (!hasApplicableProduct) {
        return res.status(200).json({
          success: true,
          valid: false,
          message: "Ce code promo ne s'applique pas aux produits de votre panier",
        });
      }
    }

    // 6. Calculer la réduction
    const { discount, finalAmount } = promoCode.calculateDiscount(orderAmount);

    return res.status(200).json({
      success: true,
      valid: true,
      promoCode: {
        id: promoCode._id,
        code: promoCode.code,
        description: promoCode.description,
        type: promoCode.type,
        value: promoCode.value,
      },
      discount,
      finalAmount,
    });
  } catch (error) {
    console.error("Erreur validation code promo:", error);
    return res.status(500).json({
      success: false,
      valid: false,
      message: "Erreur serveur lors de la validation du code promo",
    });
  }
};

// ========================================================
// ROUTES ADMIN — CRUD
// ========================================================

/**
 * POST /api/promocodes/admin
 * Créer un nouveau code promo
 */
const createPromoCode = async (req, res) => {
  try {
    const {
      code,
      description,
      type,
      value,
      startDate,
      endDate,
      isActive,
      minOrderAmount,
      maxDiscount,
      maxUsage,
      maxUsagePerUser,
      applicableProducts,
      applicableCategories,
      isWelcomeCode,
    } = req.body;

    // Vérifier si le code existe déjà
    const existing = await PromoCode.findOne({ code: code.toUpperCase().trim() });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Un code promo avec ce code existe déjà",
      });
    }

    const promoCode = new PromoCode({
      code: code.toUpperCase().trim(),
      description: description || '',
      type,
      value,
      startDate: startDate || new Date(),
      endDate,
      isActive: isActive !== undefined ? isActive : true,
      minOrderAmount: minOrderAmount || 0,
      maxDiscount: maxDiscount || null,
      maxUsage: maxUsage || null,
      maxUsagePerUser: maxUsagePerUser || 1,
      applicableProducts: applicableProducts || [],
      applicableCategories: applicableCategories || [],
      isWelcomeCode: isWelcomeCode || false,
    });

    await promoCode.save();

    return res.status(201).json({
      success: true,
      message: "Code promo créé avec succès",
      data: promoCode,
    });
  } catch (error) {
    console.error("Erreur création code promo:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Erreur lors de la création du code promo",
    });
  }
};

/**
 * GET /api/promocodes/admin
 * Lister tous les codes promo avec filtres
 */
const getAllPromoCodes = async (req, res) => {
  try {
    const { status, type, search, page = 1, limit = 20 } = req.query;
    const filter = {};

    // Filtre par statut
    if (status === 'active') {
      filter.isActive = true;
      filter.endDate = { $gte: new Date() };
    } else if (status === 'expired') {
      filter.endDate = { $lt: new Date() };
    } else if (status === 'inactive') {
      filter.isActive = false;
    }

    // Filtre par type
    if (type) {
      filter.type = type;
    }

    // Recherche par code ou description
    if (search) {
      filter.$or = [
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await PromoCode.countDocuments(filter);
    const promoCodes = await PromoCode.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    return res.status(200).json({
      success: true,
      data: promoCodes,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Erreur récupération codes promo:", error);
    return res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des codes promo",
    });
  }
};

/**
 * GET /api/promocodes/admin/:id
 * Récupérer un code promo par ID
 */
const getPromoCodeById = async (req, res) => {
  try {
    const promoCode = await PromoCode.findById(req.params.id);

    if (!promoCode) {
      return res.status(404).json({
        success: false,
        message: "Code promo introuvable",
      });
    }

    return res.status(200).json({
      success: true,
      data: promoCode,
    });
  } catch (error) {
    console.error("Erreur récupération code promo:", error);
    return res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération du code promo",
    });
  }
};

/**
 * PUT /api/promocodes/admin/:id
 * Mettre à jour un code promo
 */
const updatePromoCode = async (req, res) => {
  try {
    const updateFields = {};
    const allowedFields = [
      'description', 'type', 'value', 'startDate', 'endDate',
      'isActive', 'minOrderAmount', 'maxDiscount', 'maxUsage',
      'maxUsagePerUser', 'applicableProducts', 'applicableCategories',
      'isWelcomeCode',
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateFields[field] = req.body[field];
      }
    });

    // Si le code est mis à jour, forcer l'uppercase
    if (req.body.code) {
      updateFields.code = req.body.code.toUpperCase().trim();
    }

    const promoCode = await PromoCode.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!promoCode) {
      return res.status(404).json({
        success: false,
        message: "Code promo introuvable",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Code promo mis à jour avec succès",
      data: promoCode,
    });
  } catch (error) {
    console.error("Erreur mise à jour code promo:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Erreur lors de la mise à jour du code promo",
    });
  }
};

/**
 * DELETE /api/promocodes/admin/:id
 * Supprimer un code promo
 */
const deletePromoCode = async (req, res) => {
  try {
    const promoCode = await PromoCode.findByIdAndDelete(req.params.id);

    if (!promoCode) {
      return res.status(404).json({
        success: false,
        message: "Code promo introuvable",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Code promo supprimé avec succès",
    });
  } catch (error) {
    console.error("Erreur suppression code promo:", error);
    return res.status(500).json({
      success: false,
      message: "Erreur lors de la suppression du code promo",
    });
  }
};

/**
 * PATCH /api/promocodes/admin/:id/toggle
 * Activer/désactiver un code promo
 */
const togglePromoCode = async (req, res) => {
  try {
    const promoCode = await PromoCode.findById(req.params.id);

    if (!promoCode) {
      return res.status(404).json({
        success: false,
        message: "Code promo introuvable",
      });
    }

    promoCode.isActive = !promoCode.isActive;
    await promoCode.save();

    return res.status(200).json({
      success: true,
      message: `Code promo ${promoCode.isActive ? 'activé' : 'désactivé'} avec succès`,
      data: promoCode,
    });
  } catch (error) {
    console.error("Erreur toggle code promo:", error);
    return res.status(500).json({
      success: false,
      message: "Erreur lors de la modification du statut du code promo",
    });
  }
};

// ========================================================
// ROUTES ADMIN — STATS
// ========================================================

/**
 * GET /api/promocodes/admin/:id/stats
 * Statistiques d'un code promo spécifique
 */
const getPromoCodeStats = async (req, res) => {
  try {
    const promoCode = await PromoCode.findById(req.params.id);

    if (!promoCode) {
      return res.status(404).json({
        success: false,
        message: "Code promo introuvable",
      });
    }

    const totalDiscount = promoCode.usageHistory.reduce(
      (sum, entry) => sum + (entry.discountAmount || 0), 0
    );

    const uniqueUsers = [...new Set(
      promoCode.usageHistory.map(entry => entry.userId)
    )];

    const stats = {
      code: promoCode.code,
      type: promoCode.type,
      value: promoCode.value,
      isActive: promoCode.isActive,
      isExpired: promoCode.endDate ? new Date() > promoCode.endDate : false,
      totalUsage: promoCode.currentUsage,
      maxUsage: promoCode.maxUsage,
      remainingUsage: promoCode.maxUsage
        ? promoCode.maxUsage - promoCode.currentUsage
        : 'illimité',
      totalDiscountGiven: totalDiscount,
      uniqueUsersCount: uniqueUsers.length,
      recentUsage: promoCode.usageHistory
        .sort((a, b) => new Date(b.usedAt) - new Date(a.usedAt))
        .slice(0, 10),
      createdAt: promoCode.createdAt,
      startDate: promoCode.startDate,
      endDate: promoCode.endDate,
    };

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Erreur stats code promo:", error);
    return res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des statistiques",
    });
  }
};

/**
 * GET /api/promocodes/admin/stats/global
 * Statistiques globales de tous les codes promo
 */
const getGlobalStats = async (req, res) => {
  try {
    const now = new Date();

    const [
      totalCodes,
      activeCodes,
      expiredCodes,
      allCodes,
    ] = await Promise.all([
      PromoCode.countDocuments(),
      PromoCode.countDocuments({ isActive: true, endDate: { $gte: now } }),
      PromoCode.countDocuments({ endDate: { $lt: now } }),
      PromoCode.find({}, 'currentUsage usageHistory'),
    ]);

    let totalUsage = 0;
    let totalDiscount = 0;
    const allUsers = new Set();

    allCodes.forEach(code => {
      totalUsage += code.currentUsage;
      code.usageHistory.forEach(entry => {
        totalDiscount += entry.discountAmount || 0;
        allUsers.add(entry.userId);
      });
    });

    return res.status(200).json({
      success: true,
      data: {
        totalCodes,
        activeCodes,
        expiredCodes,
        inactiveCodes: totalCodes - activeCodes - expiredCodes,
        totalUsage,
        totalDiscountGiven: totalDiscount,
        uniqueUsersCount: allUsers.size,
      },
    });
  } catch (error) {
    console.error("Erreur stats globales:", error);
    return res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des statistiques globales",
    });
  }
};

// ========================================================
// UTILITAIRE — Intégration commande
// ========================================================

/**
 * Enregistre l'utilisation d'un code promo
 * @param {string} promoCodeId - ID du code promo
 * @param {number} orderAmount - Montant de la commande
 * @param {string} userId - ID de l'utilisateur
 * @param {string} orderId - ID de la commande (doit être l'ID réel généré par MongoDB)
 * @param {number} discountAmount - Montant de la réduction appliquée
 * @param {object} options - Options (session, etc.)
 */
const recordPromoUsage = async (promoCodeId, orderAmount, userId, orderId, discountAmount, options = {}) => {
  const { session } = options;
  try {
    const promoCode = await PromoCode.findById(promoCodeId).session(session);
    if (!promoCode) {
      console.warn("recordPromoUsage: Code promo introuvable", promoCodeId);
      return;
    }

    // Incrémenter l'usage et ajouter à l'historique
    promoCode.currentUsage += 1;
    promoCode.usageHistory.push({
      userId: userId ? userId.toString() : null,
      orderId: orderId.toString(),
      discountAmount: discountAmount,
      orderAmount: orderAmount,
      usedAt: new Date(),
    });

    await promoCode.save({ session });
    console.log(`✅ Usage enregistré pour le code ${promoCode.code} (Commande: ${orderId})`);
  } catch (error) {
    console.error("Erreur enregistrement usage code promo:", error);
    // On ne lève pas d'erreur pour ne pas bloquer la commande si c'est juste le compteur qui échoue
  }
};

/**
 * Applique un code promo lors de la création d'une commande (Version simplifiée/legacy)
 * @param {string} promoCodeId - ID du code promo
 * @param {number} orderAmount - Montant de la commande
 * @param {string} userId - ID de l'utilisateur
 * @param {object|string} optionsOrOrderId - Options (si objet) ou orderId (si string)
 */
const applyPromoToOrder = async (promoCodeId, orderAmount, userId, optionsOrOrderId) => {
  const session = typeof optionsOrOrderId === 'object' ? optionsOrOrderId.session : null;
  const orderId = typeof optionsOrOrderId === 'string' ? optionsOrOrderId : (optionsOrOrderId?.orderId || null);

  try {
    const promoCode = await PromoCode.findById(promoCodeId).session(session);

    if (!promoCode) {
      return { success: false, discount: 0, finalAmount: orderAmount, message: "Code promo introuvable" };
    }

    // Revalider
    const validity = promoCode.isValid();
    if (!validity.valid) {
      return { success: false, discount: 0, finalAmount: orderAmount, message: validity.message };
    }

    // Vérifier la limite par utilisateur (Obligatoire si quota défini)
    const userCheck = promoCode.canUserUse(userId);
    if (!userCheck.canUse) {
      return { success: false, discount: 0, finalAmount: orderAmount, message: userCheck.message };
    }

    // Calculer la réduction
    const { discount, finalAmount } = promoCode.calculateDiscount(orderAmount);

    // Si on a un orderId, on enregistre l'usage tout de suite
    if (orderId) {
      promoCode.currentUsage += 1;
      promoCode.usageHistory.push({
        userId: userId ? userId.toString() : null,
        orderId: orderId.toString(),
        discountAmount: discount,
        orderAmount,
        usedAt: new Date(),
      });
      await promoCode.save({ session });
    }

    return { success: true, discount, finalAmount, message: "Code promo appliqué", promoCode };
  } catch (error) {
    console.error("Erreur application code promo à la commande:", error);
    return { success: false, discount: 0, finalAmount: orderAmount, message: "Erreur serveur" };
  }
};

/**
 * Restaure l'usage d'un code promo (annulation de commande)
 * @param {string} promoCodeId - ID du code promo
 * @param {string} orderId - ID de la commande annulée
 * @param {object} options - Options (session, etc.)
 */
const restorePromoUsage = async (promoCodeId, orderId, options = {}) => {
  const { session } = options;
  try {
    if (!promoCodeId || !orderId) return;

    const promoCode = await PromoCode.findById(promoCodeId).session(session);
    if (!promoCode) {
      console.warn("restorePromoUsage: Code promo introuvable", promoCodeId);
      return;
    }

    // Retirer l'entrée de l'historique
    const initialHistoryLength = promoCode.usageHistory.length;
    promoCode.usageHistory = promoCode.usageHistory.filter(
      entry => entry.orderId && entry.orderId.toString() !== orderId.toString()
    );

    // Si on a effectivement retiré quelque chose, décrémenter
    if (promoCode.usageHistory.length < initialHistoryLength) {
      promoCode.currentUsage = Math.max(0, promoCode.currentUsage - (initialHistoryLength - promoCode.usageHistory.length));
      await promoCode.save({ session });
      console.log(`✅ Usage restauré pour le code ${promoCode.code} (Commande ID: ${orderId})`);
    } else {
      console.log(`ℹ️ Aucun usage (lié à cette commande) à restaurer pour le code ${promoCode.code}`);
    }
  } catch (error) {
    console.error("Erreur restauration usage code promo:", error);
  }
};

/**
 * GET /api/promocodes/admin/:id/details
 * Récupère les détails complets d'un code promo, y compris l'historique de ses utilisations peuplé et des KPIs.
 */
const getPromoCodeDetails = async (req, res) => {
  try {
    const promoCode = await PromoCode.findById(req.params.id).lean();

    if (!promoCode) {
      return res.status(404).json({
        success: false,
        message: "Code promo introuvable",
      });
    }

    const { User, Commande } = require('../Models');
    
    const usageHistory = [];
    let totalDiscountGiven = 0;
    let totalRevenueGenerated = 0;
    const dailyUsageMap = {};

    for (const usage of promoCode.usageHistory || []) {
      // 1. Peupler l'utilisateur
      let userDetails = null;
      if (usage.userId) {
        try {
          const user = await User.findById(usage.userId).select('name email phoneNumber');
          if (user) {
            userDetails = {
              id: user._id,
              name: user.name,
              email: user.email,
              phone: user.phoneNumber
            };
          }
        } catch (e) {
          // Object Id invalide potentiellement
        }
      }

      // 2. Peupler la commande
      let orderDetails = null;
      if (usage.orderId) {
        try {
          const order = await Commande.findById(usage.orderId).select('reference prix statusPayment statusCommande dateCreation');
          if (order) {
            orderDetails = {
              id: order._id,
              reference: order.reference,
              status: order.statusCommande,
              payment: order.statusPayment,
              date: order.dateCreation
            };
          }
        } catch (e) {
          // Commande non trouvée
        }
      }

      totalDiscountGiven += (usage.discountAmount || 0);
      totalRevenueGenerated += (usage.orderAmount || 0);

      // 3. Agréger les données par jour pour le Graphique (Recharts)
      const dateObj = new Date(usage.usedAt || Date.now());
      const dateString = dateObj.toISOString().split('T')[0];
      
      if (!dailyUsageMap[dateString]) {
        dailyUsageMap[dateString] = { date: dateString, count: 0, discount: 0, revenue: 0 };
      }
      dailyUsageMap[dateString].count += 1;
      dailyUsageMap[dateString].discount += (usage.discountAmount || 0);
      dailyUsageMap[dateString].revenue += (usage.orderAmount || 0);

      usageHistory.push({
        ...usage,
        user: userDetails,
        order: orderDetails
      });
    }

    // Trier l'historique (du plus récent au plus ancien)
    usageHistory.sort((a, b) => new Date(b.usedAt) - new Date(a.usedAt));

    // Transformer la map journalière en un tableau trié chronologiquement pour le graphique
    const chartData = Object.values(dailyUsageMap).sort((a, b) => new Date(a.date) - new Date(b.date));

    // Utilisateurs uniques
    const uniqueUsersSet = new Set(usageHistory.filter(u => u.userId).map(u => u.userId.toString()));

    const data = {
      ...promoCode,
      usageHistory, // On remplace par le tableau enrichi
      stats: {
        totalDiscountGiven,
        totalRevenueGenerated,
        totalUses: promoCode.currentUsage || 0,
        uniqueUsersCount: uniqueUsersSet.size,
        chartData
      }
    };

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Erreur details code promo:", error);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la récupération des détails.",
    });
  }
};

module.exports = {
  // Client
  validatePromoCode,
  // Admin CRUD
  createPromoCode,
  getPromoCodeDetails,
  getAllPromoCodes,
  getPromoCodeById,
  updatePromoCode,
  deletePromoCode,
  togglePromoCode,
  // Admin Stats
  getPromoCodeStats,
  getGlobalStats,
  // Utilitaires pour intégration commande
  applyPromoToOrder,
  restorePromoUsage,
  recordPromoUsage,
};
