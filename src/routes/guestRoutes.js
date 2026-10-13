/**
 * Commande sans compte, suivi partageable et création du compte après coup.
 * Voir src/controllers/guestController.js.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const guest = require('../controllers/guestController');
const { orderActor } = require('../auth/guestAuth');

const router = express.Router();

// Anti-abus : les SMS coûtent → peu de demandes par IP
const smsLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Trop de codes demandés. Réessayez plus tard.' } });
const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const sessionLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const trackLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

router.post('/api/guest/session', sessionLimiter, guest.startSession);
router.post('/api/guest/send-otp', smsLimiter, guest.sendOtp);
router.post('/api/guest/verify-otp', verifyLimiter, guest.verifyOtp);
router.get('/api/guest/orders', orderActor({ allowAdmin: false }), guest.myOrders);
router.post('/api/guest/claim', orderActor({ allowAdmin: false }), guest.claimAccount);

router.get('/api/track/:reference', trackLimiter, guest.trackOrder);
router.get('/api/orders/:id/share', orderActor(), guest.shareLink);

module.exports = router;
