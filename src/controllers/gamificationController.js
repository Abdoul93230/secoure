const pointsService = require("../services/pointsService");
const configService = require("../services/gamificationConfigService");
const eventService = require("../services/eventService");
const PointsWallet = require("../models/PointsWallet");
const PointsTransaction = require("../models/PointsTransaction");

// ─── Public / Client routes ───────────────────────────────────────────────────

// GET /api/gamification/wallet/:userId
const getWallet = async (req, res) => {
  try {
    const { userId } = req.params;
    const wallet = await pointsService.getWallet(userId);
    const cfg = await configService.getConfig();
    const rate = cfg.redemption?.pointsToFcfaRate || 20;
    res.json({
      success: true,
      wallet: {
        balance: wallet.balance,
        totalEarned: wallet.totalEarned,
        totalSpent: wallet.totalSpent,
        balanceFcfa: wallet.balance * rate,
        level: wallet.level,
        checkinStreak: wallet.checkinStreak,
        lastCheckinDate: wallet.lastCheckinDate,
        referralCode: wallet.referralCode,
        totalValidatedReferrals: wallet.totalValidatedReferrals
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/gamification/transactions/:userId
const getTransactions = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20, type } = req.query;
    const result = await pointsService.getTransactions(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      type
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/gamification/checkin
const dailyCheckin = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: "userId requis" });
    const result = await pointsService.processCheckin(userId);
    if (result.error === "already_done_today") {
      return res.status(409).json({ success: false, message: "Check-in déjà effectué aujourd'hui" });
    }
    if (result.error === "module_disabled") {
      return res.status(503).json({ success: false, message: "Module check-in désactivé" });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/gamification/redeem
const redeemPoints = async (req, res) => {
  try {
    const { userId, pointsToRedeem, orderId, orderAmountFcfa } = req.body;
    if (!userId || !pointsToRedeem || !orderId || !orderAmountFcfa) {
      return res.status(400).json({ success: false, message: "Paramètres manquants" });
    }
    const result = await pointsService.redeemPoints({
      userId,
      pointsToRedeem: parseInt(pointsToRedeem),
      orderId,
      orderAmountFcfa: parseFloat(orderAmountFcfa)
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// GET /api/gamification/redeem-preview
const redeemPreview = async (req, res) => {
  try {
    const { userId, orderAmountFcfa } = req.query;
    const wallet = await pointsService.getWallet(userId);
    const cfg = await configService.getConfig();
    const maxPct = cfg.redemption?.maxPercentPerOrder || 30;
    const rate = cfg.redemption?.pointsToFcfaRate || 20;
    const maxFcfa = Math.floor(parseFloat(orderAmountFcfa) * maxPct / 100);
    const maxPoints = Math.floor(maxFcfa / rate);
    const usablePoints = Math.min(wallet.balance, maxPoints);
    res.json({
      success: true,
      balance: wallet.balance,
      usablePoints,
      usableFcfa: usablePoints * rate,
      maxPercent: maxPct
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/gamification/config/public
const getPublicConfig = async (req, res) => {
  try {
    const cfg = await configService.getConfig();
    const m = cfg.modules || {};
    const activeEvents = await eventService.getActiveEvents();
    res.json({
      success: true,
      enabled: cfg.enabled,
      redemption: cfg.redemption,
      earning: cfg.earning,
      levels: m.LEVELS?.config?.thresholds || [],
      modules: {
        DAILY_CHECKIN: m.DAILY_CHECKIN?.enabled ? m.DAILY_CHECKIN.config : null,
        REVIEW_POINTS: m.REVIEW_POINTS?.enabled ? m.REVIEW_POINTS.config : null,
        POINTS_PURCHASE: m.POINTS_PURCHASE?.enabled ? m.POINTS_PURCHASE.config : null,
        FIRST_ORDER_BONUS: m.FIRST_ORDER_BONUS?.enabled ? m.FIRST_ORDER_BONUS.config : null,
        REFERRAL: m.REFERRAL?.enabled ? m.REFERRAL.config : null,
      },
      activeEvents: activeEvents.map(e => ({
        name: e.name,
        description: e.description,
        multiplier: e.multiplier,
        endDate: e.endDate,
        applicableTypes: e.applicableTypes,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Admin routes ─────────────────────────────────────────────────────────────

// GET /api/gamification/admin/config
const adminGetConfig = async (req, res) => {
  try {
    const cfg = await configService.getConfig();
    res.json({ success: true, config: cfg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/gamification/admin/config/toggle
const adminToggleSystem = async (req, res) => {
  try {
    const { enabled } = req.body;
    const cfg = await configService.toggleSystem(enabled);
    res.json({ success: true, enabled: cfg.enabled });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/gamification/admin/config/module/:moduleName
const adminUpdateModule = async (req, res) => {
  try {
    const { moduleName } = req.params;
    const patch = req.body;
    const cfg = await configService.updateModule(moduleName, patch);
    res.json({ success: true, module: cfg.modules[moduleName] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PATCH /api/gamification/admin/config/redemption
const adminUpdateRedemption = async (req, res) => {
  try {
    const cfg = await configService.updateRedemptionSettings(req.body);
    res.json({ success: true, redemption: cfg.redemption });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// GET /api/gamification/admin/wallet/:userId
const adminGetWallet = async (req, res) => {
  try {
    const wallet = await pointsService.getWallet(req.params.userId);
    res.json({ success: true, wallet });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/gamification/admin/adjust
const adminAdjustPoints = async (req, res) => {
  try {
    const { userId, delta, reason } = req.body;
    if (!userId || delta === undefined || !reason) {
      return res.status(400).json({ success: false, message: "userId, delta et reason sont requis" });
    }
    const result = await pointsService.adminAdjust({
      userId,
      delta: parseInt(delta),
      reason,
      adminId: req.user?.id
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// GET /api/gamification/admin/transactions
const adminGetAllTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 50, type, userId } = req.query;
    const query = {};
    if (type) query.type = type;
    if (userId) query.userId = userId;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [transactions, total] = await Promise.all([
      PointsTransaction.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      PointsTransaction.countDocuments(query)
    ]);
    res.json({
      success: true,
      transactions,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/gamification/admin/stats
const adminGetStats = async (req, res) => {
  try {
    const [totalDistributed, totalRedeemed, walletsCount, topReferrers] = await Promise.all([
      PointsTransaction.aggregate([
        { $match: { delta: { $gt: 0 }, type: { $ne: "ADMIN_CREDIT" } } },
        { $group: { _id: null, total: { $sum: "$delta" } } }
      ]),
      PointsTransaction.aggregate([
        { $match: { type: "REDEMPTION" } },
        { $group: { _id: null, total: { $sum: { $abs: "$delta" } } } }
      ]),
      PointsWallet.countDocuments(),
      PointsWallet.find({ totalValidatedReferrals: { $gt: 0 } })
        .sort({ totalValidatedReferrals: -1 })
        .limit(10)
        .select("userId totalValidatedReferrals level referralCode")
    ]);

    const cfg = await configService.getConfig();
    const rate = cfg.redemption?.pointsToFcfaRate || 20;
    const earnRate = cfg.earning?.fcfaPerPoint || 500;

    const distributed = totalDistributed[0]?.total || 0;
    const redeemed = totalRedeemed[0]?.total || 0;
    const inCirculation = distributed - redeemed;

    res.json({
      success: true,
      stats: {
        totalPointsDistributed: distributed,
        totalPointsRedeemed: redeemed,
        pointsInCirculation: inCirculation,
        costFcfa: distributed * earnRate,
        savingsGrantedFcfa: redeemed * rate,
        potentialLiabilityFcfa: inCirculation * rate,
        activeWallets: walletsCount,
        topReferrers
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/gamification/admin/blacklist-referral
const adminBlacklistReferral = async (req, res) => {
  try {
    const { userId, blacklisted } = req.body;
    await PointsWallet.updateOne(
      { userId: String(userId) },
      { referralBlacklisted: blacklisted !== false }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/gamification/admin/referral/tree/:userId
const adminGetReferralTree = async (req, res) => {
  try {
    const referralService = require("../services/referralService");
    const tree = await referralService.getReferralTree(req.params.userId);
    res.json({ success: true, tree });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/gamification/admin/referral/pending
const adminGetPendingReferrals = async (req, res) => {
  try {
    const referralService = require("../services/referralService");
    const pending = await referralService.getPendingReferrals();
    res.json({ success: true, pending, total: pending.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/gamification/admin/referral/stats
const adminGetReferralStats = async (req, res) => {
  try {
    const [totalReferrals, blacklisted, pending] = await Promise.all([
      PointsWallet.countDocuments({ totalValidatedReferrals: { $gt: 0 } }),
      PointsWallet.countDocuments({ referralBlacklisted: true }),
      PointsWallet.countDocuments({ referredBy: { $ne: null } }),
    ]);
    const topReferrers = await PointsWallet.find({ totalValidatedReferrals: { $gt: 0 } })
      .sort({ totalValidatedReferrals: -1 })
      .limit(20)
      .select("userId referralCode totalValidatedReferrals level referralBlacklisted createdAt")
      .lean();
    res.json({ success: true, stats: { totalReferrers: totalReferrals, blacklisted, pendingFilleuls: pending }, topReferrers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/gamification/admin/referral/retry
// Allows admin to manually trigger referral credit for a user who already placed an order
const adminRetryReferral = async (req, res) => {
  try {
    const { userId, orderId } = req.body;
    if (!userId || !orderId) {
      return res.status(400).json({ success: false, message: "userId et orderId requis" });
    }
    const referralService = require("../services/referralService");
    const result = await referralService.handleOrderDelivered({ userId, orderId, ignoreExpiry: true });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Admin Event routes ───────────────────────────────────────────────────────

// GET /api/gamification/admin/events
const adminGetEvents = async (req, res) => {
  try {
    const events = await eventService.getAllEvents();
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/gamification/admin/events/active
const adminGetActiveEvents = async (req, res) => {
  try {
    const events = await eventService.getActiveEvents();
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/gamification/admin/events
const adminCreateEvent = async (req, res) => {
  try {
    const event = await eventService.createEvent(req.body, req.user?.id);
    res.status(201).json({ success: true, event });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PATCH /api/gamification/admin/events/:id
const adminUpdateEvent = async (req, res) => {
  try {
    const event = await eventService.updateEvent(req.params.id, req.body);
    res.json({ success: true, event });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// DELETE /api/gamification/admin/events/:id
const adminDeleteEvent = async (req, res) => {
  try {
    await eventService.deleteEvent(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

module.exports = {
  getWallet,
  getTransactions,
  dailyCheckin,
  redeemPoints,
  redeemPreview,
  getPublicConfig,
  adminGetConfig,
  adminToggleSystem,
  adminUpdateModule,
  adminUpdateRedemption,
  adminGetWallet,
  adminAdjustPoints,
  adminGetAllTransactions,
  adminGetStats,
  adminBlacklistReferral,
  adminGetReferralTree,
  adminGetPendingReferrals,
  adminGetReferralStats,
  adminGetEvents,
  adminGetActiveEvents,
  adminCreateEvent,
  adminUpdateEvent,
  adminDeleteEvent,
  adminRetryReferral,
};
