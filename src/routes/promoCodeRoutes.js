const express = require('express');
const router = express.Router();
const promoCodeController = require('../controllers/promoCodeController');
const authMiddleware = require('../middleware/auth');

// ========================================================
// ROUTES CLIENT (publiques)
// ========================================================

// Valider un code promo
router.post('/validate', promoCodeController.validatePromoCode);

// ========================================================
// ROUTES ADMIN (protégées)
// ========================================================

// Stats globales (DOIT être avant /:id pour ne pas être capturé)
router.get('/admin/stats/global', authMiddleware.requireAdmin, promoCodeController.getGlobalStats);

// CRUD
router.post('/admin', authMiddleware.requireAdmin, promoCodeController.createPromoCode);
router.get('/admin', authMiddleware.requireAdmin, promoCodeController.getAllPromoCodes);
router.get('/admin/:id', authMiddleware.requireAdmin, promoCodeController.getPromoCodeById);
router.put('/admin/:id', authMiddleware.requireAdmin, promoCodeController.updatePromoCode);
router.delete('/admin/:id', authMiddleware.requireAdmin, promoCodeController.deletePromoCode);

// Toggle activation
router.patch('/admin/:id/toggle', authMiddleware.requireAdmin, promoCodeController.togglePromoCode);

// Stats d'un code spécifique
router.get('/admin/:id/stats', authMiddleware.requireAdmin, promoCodeController.getPromoCodeStats);

// Détails exhaustifs d'un code promo (pour la vue Admin détaillée)
router.get('/admin/:id/details', authMiddleware.requireAdmin, promoCodeController.getPromoCodeDetails);

module.exports = router;
