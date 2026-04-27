const PointsWallet = require("../models/PointsWallet");
const PointsTransaction = require("../models/PointsTransaction");
const configService = require("./gamificationConfigService");
const pointsService = require("./pointsService");

// ─── Validate referral on first delivered order of a referred user ────────────

const handleOrderDelivered = async ({ userId, orderId, ignoreExpiry = false }) => {
  try {
    const [enabled, abuseCfg, referralCfg] = await Promise.all([
      configService.isModuleEnabled("REFERRAL"),
      configService.getModuleConfig("REFERRAL_ANTIABUSE"),
      configService.getModuleConfig("REFERRAL"),
    ]);
    if (!enabled) return { skipped: "module_disabled" };

    const wallet = await PointsWallet.findOne({ userId: String(userId) });
    if (!wallet || !wallet.referredBy) return { skipped: "no_referral" };

    // Only trigger on the very first delivered order
    const alreadyCredited = await PointsTransaction.findOne({
      userId: String(userId),
      type: "REFERRAL_FILLEUL",
    });
    if (alreadyCredited) return { skipped: "already_rewarded" };

    // Check referral expiry window (skippable for manual admin retry)
    if (!ignoreExpiry) {
      const expiryDays = referralCfg.expiryDays || 30;
      const walletAge = (Date.now() - new Date(wallet.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (walletAge > expiryDays) return { skipped: "expired" };
    }

    // Anti-abuse: check monthly cap for parrain
    const parrainWallet = await PointsWallet.findOne({ userId: String(wallet.referredBy) });
    if (!parrainWallet || parrainWallet.referralBlacklisted) {
      return { skipped: "parrain_blacklisted" };
    }

    const maxPerMonth = abuseCfg?.maxPerMonth || 10;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyCount = await PointsTransaction.countDocuments({
      userId: String(wallet.referredBy),
      type: "REFERRAL_PARRAIN",
      createdAt: { $gte: startOfMonth },
    });
    if (monthlyCount >= maxPerMonth) {
      return { skipped: "monthly_cap_reached" };
    }

    // Compute parrain tier bonus
    const tiers = referralCfg.tiers || [];
    const totalReferrals = parrainWallet.totalValidatedReferrals || 0;
    let bonusPoints = 0;
    for (const tier of tiers) {
      const max = tier.maxReferrals === null ? Infinity : tier.maxReferrals;
      if (totalReferrals >= tier.minReferrals - 1 && totalReferrals < max) {
        bonusPoints = tier.bonusPerReferral || 0;
        break;
      }
    }

    const parrainPoints = (referralCfg.pointsParrain || 25) + bonusPoints;
    const filleulPoints = referralCfg.pointsFilleul || 10;

    // Credit parrain
    await pointsService.creditPoints({
      userId: String(wallet.referredBy),
      delta: parrainPoints,
      type: "REFERRAL_PARRAIN",
      reason: `Parrainage validé — filleul ${userId} a livré sa 1ère commande`,
      idempotencyKey: `REFERRAL_PARRAIN_${userId}_${orderId}`,
      referralUserId: String(userId),
      orderId,
      metadata: { bonusPoints, totalReferrals: totalReferrals + 1 },
    });

    // Credit filleul
    await pointsService.creditPoints({
      userId: String(userId),
      delta: filleulPoints,
      type: "REFERRAL_FILLEUL",
      reason: "Bonus parrainage — 1ère commande livrée",
      idempotencyKey: `REFERRAL_FILLEUL_${userId}_${orderId}`,
      referralUserId: String(wallet.referredBy),
      orderId,
    });

    // Increment parrain referral count
    await PointsWallet.updateOne(
      { userId: String(wallet.referredBy) },
      { $inc: { totalValidatedReferrals: 1 } }
    );

    console.log(`✅ Parrainage validé: parrain ${wallet.referredBy} +${parrainPoints}BP, filleul ${userId} +${filleulPoints}BP`);
    return { success: true, parrainPoints, filleulPoints };
  } catch (err) {
    console.error("referralService.handleOrderDelivered:", err.message);
    return { error: err.message };
  }
};

// ─── Store referral code at registration ──────────────────────────────────────

const attachReferralOnRegister = async ({ userId, refCode }) => {
  if (!refCode) return;
  try {
    const enabled = await configService.isModuleEnabled("REFERRAL");
    if (!enabled) return;

    // Find parrain by referral code
    const parrainWallet = await PointsWallet.findOne({ referralCode: refCode.toUpperCase() });
    if (!parrainWallet) return;

    // Can't refer yourself
    if (String(parrainWallet.userId) === String(userId)) return;

    // Ensure filleul wallet exists (triggers pre-save hook for referralCode)
    let filleulWallet = await PointsWallet.findOne({ userId: String(userId) });
    if (!filleulWallet) {
      filleulWallet = await PointsWallet.create({ userId: String(userId) });
    }
    filleulWallet.referredBy = String(parrainWallet.userId);
    await filleulWallet.save();
    console.log(`✅ Parrainage enregistré: ${userId} parrainé par ${parrainWallet.userId}`);
  } catch (err) {
    console.error("referralService.attachReferralOnRegister:", err.message);
  }
};

// ─── Admin: get referral tree for a user ─────────────────────────────────────

const getReferralTree = async (userId) => {
  const direct = await PointsWallet.find({ referredBy: String(userId) })
    .select("userId totalValidatedReferrals level createdAt referralCode")
    .lean();

  const tree = await Promise.all(
    direct.map(async (child) => {
      const txn = await PointsTransaction.findOne({
        userId: child.userId,
        type: "REFERRAL_FILLEUL",
      }).lean();
      return { ...child, validated: !!txn };
    })
  );
  return tree;
};

// ─── Admin: pending referrals (within window, not yet validated) ─────────────

const getPendingReferrals = async () => {
  const cfg = await configService.getModuleConfig("REFERRAL");
  const expiryDays = cfg.expiryDays || 30;
  const cutoff = new Date(Date.now() - expiryDays * 24 * 60 * 60 * 1000);

  const wallets = await PointsWallet.find({
    referredBy: { $ne: null },
    createdAt: { $gte: cutoff },
  }).lean();

  const pending = [];
  for (const w of wallets) {
    const validated = await PointsTransaction.findOne({
      userId: w.userId,
      type: "REFERRAL_FILLEUL",
    });
    if (!validated) pending.push(w);
  }
  return pending;
};

module.exports = {
  handleOrderDelivered,
  attachReferralOnRegister,
  getReferralTree,
  getPendingReferrals,
};
