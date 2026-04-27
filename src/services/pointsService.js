const mongoose = require("mongoose");
const PointsWallet = require("../models/PointsWallet");
const PointsTransaction = require("../models/PointsTransaction");
const configService = require("./gamificationConfigService");
const eventService = require("./eventService");

// ─── Internal helper ────────────────────────────────────────────────────────

const _computeExpiresAt = async () => {
  const cfg = await configService.getConfig();
  const months = cfg.earning?.pointsExpireMonths || 12;
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d;
};

const _updateLevel = async (wallet) => {
  const level = await configService.getLevelForPoints(wallet.totalEarned);
  wallet.level = level;
};

// ─── Wallet getters ──────────────────────────────────────────────────────────

const getOrCreateWallet = async (userId) => {
  let wallet = await PointsWallet.findOne({ userId: String(userId) });
  if (!wallet) {
    wallet = await PointsWallet.create({ userId: String(userId) });
  }
  return wallet;
};

const getWallet = async (userId) => {
  return getOrCreateWallet(userId);
};

const getTransactions = async (userId, { page = 1, limit = 20, type } = {}) => {
  const query = { userId: String(userId) };
  if (type) query.type = type;
  const skip = (page - 1) * limit;
  const [transactions, total] = await Promise.all([
    PointsTransaction.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    PointsTransaction.countDocuments(query)
  ]);
  return { transactions, total, page, pages: Math.ceil(total / limit) };
};

// ─── Credit points (ACID session) ────────────────────────────────────────────

const creditPoints = async ({
  userId,
  delta,
  type,
  reason,
  idempotencyKey,
  orderId,
  referralUserId,
  reviewId,
  eventId,
  adminId,
  metadata
}) => {
  if (delta <= 0) throw new Error("delta doit être positif pour un crédit");

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Idempotency check
    if (idempotencyKey) {
      const existing = await PointsTransaction.findOne({ idempotencyKey }).session(session);
      if (existing) {
        await session.abortTransaction();
        session.endSession();
        return { alreadyProcessed: true, transaction: existing };
      }
    }

    const wallet = await PointsWallet.findOneAndUpdate(
      { userId: String(userId) },
      { $inc: { balance: delta, totalEarned: delta } },
      { new: true, upsert: true, session }
    );

    const newLevel = await configService.getLevelForPoints(wallet.totalEarned);
    const needsReferralCode = !wallet.referralCode;
    if (needsReferralCode || wallet.level !== newLevel) {
      if (needsReferralCode) {
        const base = wallet.userId.toString().slice(-5).toUpperCase();
        const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
        wallet.referralCode = `IHB-${base}-${rand}`;
      }
      wallet.level = newLevel;
      await wallet.save({ session });
    }

    const expiresAt = await _computeExpiresAt();
    const transaction = await PointsTransaction.create([{
      userId: String(userId),
      type,
      delta,
      balanceBefore: wallet.balance - delta,
      balanceAfter: wallet.balance,
      reason,
      idempotencyKey,
      orderId: orderId || null,
      referralUserId: referralUserId || null,
      reviewId: reviewId || null,
      eventId: eventId || null,
      adminId: adminId || null,
      expiresAt,
      metadata: metadata || {}
    }], { session });

    await session.commitTransaction();
    session.endSession();
    return { wallet, transaction: transaction[0], alreadyProcessed: false };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

// ─── Debit points (ACID session) ─────────────────────────────────────────────

const debitPoints = async ({
  userId,
  delta,
  type,
  reason,
  idempotencyKey,
  orderId,
  adminId,
  metadata
}) => {
  if (delta <= 0) throw new Error("delta doit être positif pour un débit");

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (idempotencyKey) {
      const existing = await PointsTransaction.findOne({ idempotencyKey }).session(session);
      if (existing) {
        await session.abortTransaction();
        session.endSession();
        return { alreadyProcessed: true, transaction: existing };
      }
    }

    const wallet = await PointsWallet.findOne({ userId: String(userId) }).session(session);
    if (!wallet || wallet.balance < delta) {
      await session.abortTransaction();
      session.endSession();
      throw new Error("Solde de points insuffisant");
    }

    wallet.balance -= delta;
    if (type === "REDEMPTION") wallet.totalSpent += delta;
    if (type === "EXPIRY") wallet.totalExpired += delta;
    await wallet.save({ session });

    const transaction = await PointsTransaction.create([{
      userId: String(userId),
      type,
      delta: -delta,
      balanceBefore: wallet.balance + delta,
      balanceAfter: wallet.balance,
      reason,
      idempotencyKey,
      orderId: orderId || null,
      adminId: adminId || null,
      metadata: metadata || {}
    }], { session });

    await session.commitTransaction();
    session.endSession();
    return { wallet, transaction: transaction[0], alreadyProcessed: false };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

// ─── Purchase points ──────────────────────────────────────────────────────────

const creditPurchasePoints = async ({ userId, orderAmountFcfa, orderId }) => {
  const [enabled, moduleCfg, wallet] = await Promise.all([
    configService.isModuleEnabled("POINTS_PURCHASE"),
    configService.getModuleConfig("POINTS_PURCHASE"),
    getOrCreateWallet(userId)
  ]);
  if (!enabled) return null;

  const rate = moduleCfg.ratePerThousand || 2;
  const levelMultiplier = await configService.getPurchaseMultiplier(wallet.level);
  const basePoints = Math.floor((orderAmountFcfa / 1000) * rate);
  const { multiplier: eventMultiplier, eventIds } = await eventService.getActiveMultiplier("PURCHASE");
  const delta = Math.floor(basePoints * levelMultiplier * eventMultiplier);
  if (delta <= 0) return null;

  return creditPoints({
    userId,
    delta,
    type: "PURCHASE",
    reason: `Commande livrée — ${orderAmountFcfa.toLocaleString("fr-FR")} FCFA${eventMultiplier > 1 ? ` (×${eventMultiplier} événement)` : ""}`,
    idempotencyKey: `PURCHASE_${orderId}`,
    orderId,
    eventId: eventIds[0] || null,
    metadata: { orderAmountFcfa, rate, levelMultiplier, eventMultiplier }
  });
};

// ─── Daily check-in ───────────────────────────────────────────────────────────

const processCheckin = async (userId) => {
  const enabled = await configService.isModuleEnabled("DAILY_CHECKIN");
  if (!enabled) return { error: "module_disabled" };

  const moduleCfg = await configService.getModuleConfig("DAILY_CHECKIN");
  const wallet = await getOrCreateWallet(userId);

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const lastStr = wallet.lastCheckinDate
    ? wallet.lastCheckinDate.toISOString().split("T")[0]
    : null;

  if (lastStr === todayStr) {
    return { error: "already_done_today" };
  }

  // Compute streak
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];
  const newStreak = lastStr === yesterdayStr ? wallet.checkinStreak + 1 : 1;

  // Update streak + last date first
  wallet.checkinStreak = newStreak;
  wallet.lastCheckinDate = now;
  await wallet.save();

  const basePoints = moduleCfg.pointsPerDay || 1;
  const idempotencyKey = `CHECKIN_${userId}_${todayStr}`;
  const { multiplier: eventMultiplier, eventIds } = await eventService.getActiveMultiplier("CHECKIN");
  const delta = Math.floor(basePoints * eventMultiplier);

  const result = await creditPoints({
    userId,
    delta,
    type: "CHECKIN",
    reason: `Check-in quotidien — Série: ${newStreak} jours${eventMultiplier > 1 ? ` (×${eventMultiplier} événement)` : ""}`,
    idempotencyKey,
    eventId: eventIds[0] || null,
    metadata: { streak: newStreak, eventMultiplier }
  });

  // Bonus on streak milestones
  let bonusResult = null;
  if (newStreak === 7 && moduleCfg.bonus7d) {
    bonusResult = await creditPoints({
      userId,
      delta: moduleCfg.bonus7d,
      type: "CHECKIN_STREAK",
      reason: "Bonus série 7 jours consécutifs",
      idempotencyKey: `CHECKIN_STREAK7_${userId}_${todayStr}`,
      metadata: { streakMilestone: 7 }
    });
  } else if (newStreak === 30 && moduleCfg.bonus30d) {
    bonusResult = await creditPoints({
      userId,
      delta: moduleCfg.bonus30d,
      type: "CHECKIN_STREAK",
      reason: "Bonus série 30 jours consécutifs",
      idempotencyKey: `CHECKIN_STREAK30_${userId}_${todayStr}`,
      metadata: { streakMilestone: 30 }
    });
  }

  return { checkin: result, bonus: bonusResult, streak: newStreak };
};

// ─── First order bonus ────────────────────────────────────────────────────────

const creditFirstOrderBonus = async ({ userId, orderId }) => {
  const enabled = await configService.isModuleEnabled("FIRST_ORDER_BONUS");
  if (!enabled) return null;

  const wallet = await getOrCreateWallet(userId);
  if (wallet.firstOrderBonusGiven) return null;

  const moduleCfg = await configService.getModuleConfig("FIRST_ORDER_BONUS");
  const basePoints = moduleCfg.points || 50;
  const { multiplier: eventMultiplier, eventIds } = await eventService.getActiveMultiplier("FIRST_ORDER");
  const delta = Math.floor(basePoints * eventMultiplier);

  wallet.firstOrderBonusGiven = true;
  await wallet.save();

  return creditPoints({
    userId,
    delta,
    type: "FIRST_ORDER",
    reason: `Bonus première commande${eventMultiplier > 1 ? ` (×${eventMultiplier} événement)` : ""}`,
    idempotencyKey: `FIRST_ORDER_${userId}`,
    orderId,
    eventId: eventIds[0] || null,
    metadata: { eventMultiplier }
  });
};

// ─── Review points ────────────────────────────────────────────────────────────

const creditReviewPoints = async ({ userId, reviewId, hasPhoto }) => {
  const enabled = await configService.isModuleEnabled("REVIEW_POINTS");
  if (!enabled) return null;

  const moduleCfg = await configService.getModuleConfig("REVIEW_POINTS");
  const basePoints = hasPhoto ? (moduleCfg.withPhoto || 5) : (moduleCfg.textOnly || 2);
  const { multiplier: eventMultiplier, eventIds } = await eventService.getActiveMultiplier("REVIEW");
  const delta = Math.floor(basePoints * eventMultiplier);

  return creditPoints({
    userId,
    delta,
    type: "REVIEW",
    reason: `${hasPhoto ? "Avis produit avec photo" : "Avis produit texte"}${eventMultiplier > 1 ? ` (×${eventMultiplier} événement)` : ""}`,
    idempotencyKey: `REVIEW_${reviewId}`,
    reviewId,
    eventId: eventIds[0] || null,
    metadata: { hasPhoto, eventMultiplier }
  });
};

// ─── Redemption (debit at checkout) ──────────────────────────────────────────

const redeemPoints = async ({ userId, pointsToRedeem, orderId, orderAmountFcfa }) => {
  const cfg = await configService.getConfig();
  const maxPct = cfg.redemption?.maxPercentPerOrder || 30;
  const rate = cfg.redemption?.pointsToFcfaRate || 20;

  const maxFcfa = Math.floor(orderAmountFcfa * maxPct / 100);
  const maxPoints = Math.floor(maxFcfa / rate);
  const actualPoints = Math.min(pointsToRedeem, maxPoints);

  if (actualPoints <= 0) throw new Error("Nombre de points à utiliser invalide");

  const discountFcfa = actualPoints * rate;

  return debitPoints({
    userId,
    delta: actualPoints,
    type: "REDEMPTION",
    reason: `Utilisation de ${actualPoints} BP sur commande (−${discountFcfa} FCFA)`,
    idempotencyKey: `REDEMPTION_${orderId}`,
    orderId,
    metadata: { discountFcfa, rate }
  });
};

// ─── Cancel points on order cancellation ─────────────────────────────────────

const revokeOrderPoints = async ({ userId, orderId }) => {
  // Find the credit transaction for this order
  const creditTxn = await PointsTransaction.findOne({
    userId: String(userId),
    orderId,
    type: "PURCHASE"
  });
  if (!creditTxn || creditTxn.delta <= 0) return null;

  return debitPoints({
    userId,
    delta: creditTxn.delta,
    type: "CANCELLATION",
    reason: "Annulation commande — points retirés",
    idempotencyKey: `CANCELLATION_${orderId}`,
    orderId
  });
};

// ─── Admin manual adjustment ──────────────────────────────────────────────────

const adminAdjust = async ({ userId, delta, reason, adminId }) => {
  if (delta > 0) {
    return creditPoints({ userId, delta, type: "ADMIN_CREDIT", reason, adminId });
  } else {
    return debitPoints({ userId, delta: Math.abs(delta), type: "ADMIN_DEBIT", reason, adminId });
  }
};

// ─── Expire points (cron job) ─────────────────────────────────────────────────

const expirePoints = async () => {
  const now = new Date();
  const expiredTxns = await PointsTransaction.find({
    expiresAt: { $lte: now },
    expired: false,
    delta: { $gt: 0 }
  });

  let totalExpired = 0;
  for (const txn of expiredTxns) {
    try {
      const wallet = await PointsWallet.findOne({ userId: txn.userId });
      if (!wallet || wallet.balance <= 0) {
        txn.expired = true;
        await txn.save();
        continue;
      }
      const toExpire = Math.min(txn.delta, wallet.balance);
      if (toExpire > 0) {
        await debitPoints({
          userId: txn.userId,
          delta: toExpire,
          type: "EXPIRY",
          reason: "Expiration de points (12 mois)",
          idempotencyKey: `EXPIRY_${txn._id}`
        });
        totalExpired += toExpire;
      }
      txn.expired = true;
      await txn.save();
    } catch (err) {
      console.error(`[PointsService] expirePoints error for txn ${txn._id}:`, err.message);
    }
  }
  return { expired: expiredTxns.length, totalPoints: totalExpired };
};

module.exports = {
  getWallet,
  getOrCreateWallet,
  getTransactions,
  creditPoints,
  debitPoints,
  creditPurchasePoints,
  processCheckin,
  creditFirstOrderBonus,
  creditReviewPoints,
  redeemPoints,
  revokeOrderPoints,
  adminAdjust,
  expirePoints
};
