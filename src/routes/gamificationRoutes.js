const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/gamificationController");
const { requireAdmin, extractToken } = require("../middleware/auth");
const { checkGamificationEnabled, checkModuleEnabled } = require("../middleware/gamificationMiddleware");

// ─── Public config (no auth needed) ──────────────────────────────────────────
router.get("/config/public", ctrl.getPublicConfig);

// ─── Client routes (require user token) ──────────────────────────────────────
// SÉCURITÉ : le compte est celui du jeton. L'identifiant envoyé (URL, corps, requête) est ignoré,
// sinon n'importe qui pouvait lire le portefeuille d'un autre ou pointer à sa place.
const ownAccount = (req, res, next) => {
  if (req.user?.role === "admin") return next();
  if (req.user?.role !== "user") return res.status(403).json({ success: false, message: "Réservé aux comptes clients." });
  const id = String(req.user.id || req.user._id); // extractToken fournit req.user.id (pas _id)
  if (req.params.userId !== undefined) req.params.userId = id;
  if (req.body && typeof req.body === "object") req.body.userId = id;
  req.query.userId = id;
  next();
};
router.get("/wallet/:userId", extractToken, ownAccount, checkGamificationEnabled, ctrl.getWallet);
router.get("/transactions/:userId", extractToken, ownAccount, checkGamificationEnabled, ctrl.getTransactions);
router.get("/redeem-preview", extractToken, ownAccount, checkGamificationEnabled, ctrl.redeemPreview);

router.post(
  "/checkin",
  extractToken,
  ownAccount,
  checkGamificationEnabled,
  checkModuleEnabled("DAILY_CHECKIN"),
  ctrl.dailyCheckin
);

// Débit direct de points : réservé à l'admin. Les clients utilisent leurs points à la commande
// (createCommande), où la remise est réellement appliquée.
router.post("/redeem", requireAdmin, checkGamificationEnabled, ctrl.redeemPoints);

// ─── Admin routes ─────────────────────────────────────────────────────────────
router.get("/admin/config", requireAdmin, ctrl.adminGetConfig);
router.get("/admin/stats", requireAdmin, ctrl.adminGetStats);
router.get("/admin/wallet/:userId", requireAdmin, ctrl.adminGetWallet);
router.get("/admin/transactions", requireAdmin, ctrl.adminGetAllTransactions);

router.patch("/admin/config/toggle", requireAdmin, ctrl.adminToggleSystem);
router.patch("/admin/config/module/:moduleName", requireAdmin, ctrl.adminUpdateModule);
router.patch("/admin/config/redemption", requireAdmin, ctrl.adminUpdateRedemption);

router.post("/admin/adjust", requireAdmin, ctrl.adminAdjustPoints);
router.post("/admin/blacklist-referral", requireAdmin, ctrl.adminBlacklistReferral);

// Referral admin routes
router.get("/admin/referral/stats", requireAdmin, ctrl.adminGetReferralStats);
router.get("/admin/referral/tree/:userId", requireAdmin, ctrl.adminGetReferralTree);
router.get("/admin/referral/pending", requireAdmin, ctrl.adminGetPendingReferrals);
router.post("/admin/referral/retry", requireAdmin, ctrl.adminRetryReferral);

// Event admin routes
router.get("/admin/events", requireAdmin, ctrl.adminGetEvents);
router.get("/admin/events/active", requireAdmin, ctrl.adminGetActiveEvents);
router.post("/admin/events", requireAdmin, ctrl.adminCreateEvent);
router.patch("/admin/events/:id", requireAdmin, ctrl.adminUpdateEvent);
router.delete("/admin/events/:id", requireAdmin, ctrl.adminDeleteEvent);

module.exports = router;
