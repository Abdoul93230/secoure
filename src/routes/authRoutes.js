const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authentification = require('../auth/authentification');
const middelware = require('../auth/middelware');
const userController = require('../userControler');
const AdminController = require('../auth/AdminController');
const forgotPassword = require('../auth/forgotPassword');
const quickAuthController = require('../auth/quickAuthController');
const { SellerRequest } = require('../Models');

// Rate limiter strict pour les endpoints sensibles (login, forgot password)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: "Trop de tentatives. Veuillez réessayer dans 15 minutes." },
});

// Authentication — protégés par rate limit strict
router.post('/login', authLimiter, authentification.login);
router.post('/AdminLogin', authLimiter, authentification.AdminLogin);

// Vérification unicité vendeur en temps réel (inscription)
router.post('/auth/check-seller-unique', async (req, res) => {
  try {
    const { email, phone, storeName } = req.body;
    if (email) {
      const exists = !!(await SellerRequest.findOne({ email: email.toLowerCase().trim() }).lean());
      return res.json({ exists });
    }
    if (phone) {
      const exists = !!(await SellerRequest.findOne({ phone: phone.trim() }).lean());
      return res.json({ exists });
    }
    if (storeName) {
      const exists = !!(await SellerRequest.findOne({ storeName: { $regex: new RegExp(`^${storeName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }).lean());
      return res.json({ exists });
    }
    return res.status(400).json({ error: 'Paramètre manquant' });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// QuickAuth (phone/email first flow)
router.post('/auth/check-phone', quickAuthController.checkPhone);
router.post('/auth/send-otp', quickAuthController.sendOtp);
router.post('/auth/resend-otp', quickAuthController.resendOtp);
router.post('/auth/verify-otp', quickAuthController.verifyOtp);
router.post('/auth/quick-register', quickAuthController.quickRegister);
router.post('/auth/request-password-reset-otp', quickAuthController.requestPasswordResetOtp);
router.post('/auth/reset-password-phone', quickAuthController.resetPasswordWithPhoneOtp);

// Token verification
router.get('/verify', middelware.auth, userController.verifyToken);
router.get('/verifyAdmin', middelware.authAdmin, AdminController.verifyToken);

// Admin routes
router.get('/admin/:adminId', AdminController.getAdmin);

// Password reset
router.post('/forgot_password', forgotPassword.forgot_password);
router.post('/forgotPassword', forgotPassword.forgot_password);
router.post('/reset_password', forgotPassword.reset_password);
// Vendeur : reset par email OU par SMS (même endpoint, champ email ou phone)
router.post('/forgotPassword_seller', forgotPassword.forgot_password_seller);
router.post('/reset_password_seller', forgotPassword.reset_password_seller);

module.exports = router;