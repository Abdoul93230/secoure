const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/gamificationController");
const { requireAdmin, extractToken } = require("../middleware/auth");
const { checkGamificationEnabled, checkModuleEnabled } = require("../middleware/gamificationMiddleware");

// ─── Public config (no auth needed) ──────────────────────────────────────────
router.get("/config/public", ctrl.getPublicConfig);

// ─── Client routes (require user token) ──────────────────────────────────────
router.get("/wallet/:userId", extractToken, checkGamificationEnabled, ctrl.getWallet);
router.get("/transactions/:userId", extractToken, checkGamificationEnabled, ctrl.getTransactions);
router.get("/redeem-preview", extractToken, checkGamificationEnabled, ctrl.redeemPreview);

router.post(
  "/checkin",
  extractToken,
  checkGamificationEnabled,
  checkModuleEnabled("DAILY_CHECKIN"),
  ctrl.dailyCheckin
);

router.post(
  "/redeem",
  extractToken,
  checkGamificationEnabled,
  ctrl.redeemPoints
);

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
