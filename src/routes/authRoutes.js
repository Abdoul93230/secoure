const express = require('express');
const router = express.Router();
const authentification = require('../auth/authentification');
const middelware = require('../auth/middelware');
const userController = require('../userControler');
const AdminController = require('../auth/AdminController');
const forgotPassword = require('../auth/forgotPassword');

// Authentication
router.post('/login', authentification.login);
router.post('/AdminLogin', authentification.AdminLogin);

// Token verification
router.get('/verify', middelware.auth, userController.verifyToken);
router.get('/verifyAdmin', middelware.authAdmin, AdminController.verifyToken);

// Admin routes
router.get('/admin/:adminId', AdminController.getAdmin);

// Password reset
router.post('/forgot_password', forgotPassword.forgot_password);
router.post('/forgotPassword', forgotPassword.forgot_password);
router.post('/reset_password', forgotPassword.reset_password);
router.post('/forgotPassword_seller', forgotPassword.forgot_password_seller);
router.post('/reset_password_seller', forgotPassword.reset_password_seller);

module.exports = router;