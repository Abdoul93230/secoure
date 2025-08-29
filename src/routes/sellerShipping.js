const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const shippingService = require('../services/shippingServiceF');

const router = express.Router();

// Body parsing middleware
router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ extended: true }));


// Middleware de validation des erreurs
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Erreurs de validation',
      errors: errors.array()
    });
  }
  next();
};

// GET /api/seller/shipping-policies - Obtenir les politiques du vendeur
router.get('/shipping-policies', [
  query('includeInactive').optional().isBoolean().toBoolean(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const policies = await shippingService.getSellerPolicies(
      req.user.id,
      req.query
    );
    
    res.json({
      success: true,
      data: policies
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/seller/shipping-policies/stats - Statistiques des politiques
router.get('/shipping-policies/stats', async (req, res, next) => {
  try {
    const stats = await shippingService.getSellerStats(req.user.id);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/seller/shipping-policies - Créer/modifier politique pour une zone
router.post('/shipping-policies', [
  body('zoneId').notEmpty().isMongoId(),
  body('fixedCost').isInt({ min: 0 }),
  body('costPerKg').isInt({ min: 0 }),
  body('isDefault').optional().isBoolean(),
  body('isActive').optional().isBoolean(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const { zoneId, ...policyData } = req.body;
    
    const result = await shippingService.setPolicyForZone(
      req.user.id,
      zoneId,
      policyData
    );
    
    res.json({
      success: true,
      message: 'Politique configurée avec succès',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/seller/shipping-policies/:policyId - Modifier une politique
router.put('/shipping-policies/:policyId', [
  param('policyId').isMongoId(),
  body('fixedCost').optional().isInt({ min: 0 }),
  body('costPerKg').optional().isInt({ min: 0 }),
  body('isDefault').optional().isBoolean(),
  body('isActive').optional().isBoolean(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    // Pour la simplicité, on récupère d'abord les politiques pour identifier la zone
    const policies = await shippingService.getSellerPolicies(req.user.id, { includeInactive: true });
    const policy = policies.zonePolicies.find(p => p._id.toString() === req.params.policyId);
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Politique introuvable'
      });
    }
    
    const result = await shippingService.setPolicyForZone(
      req.user.id,
      policy.zoneId._id,
      { ...policy.toObject(), ...req.body }
    );
    
    res.json({
      success: true,
      message: 'Politique modifiée avec succès',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/seller/shipping-policies/:policyId - Supprimer une politique
router.delete('/shipping-policies/:policyId', [
  param('policyId').isMongoId(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const result = await shippingService.removePolicy(
      req.user.id,
      req.params.policyId
    );
    
    res.json({
      success: true,
      message: 'Politique supprimée avec succès',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/seller/shipping-policies/:policyId/toggle - Activer/désactiver
router.patch('/shipping-policies/:policyId/toggle', [
  param('policyId').isMongoId(),
  body('isActive').isBoolean(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const result = await shippingService.togglePolicyStatus(
      req.user.id,
      req.params.policyId,
      req.body.isActive
    );
    
    res.json({
      success: true,
      message: `Politique ${req.body.isActive ? 'activée' : 'désactivée'} avec succès`,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/seller/shipping-policies/:policyId/duplicate - Dupliquer une politique
router.post('/shipping-policies/:policyId/duplicate', [
  param('policyId').isMongoId(),
  body('targetZoneId').notEmpty().isMongoId(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const result = await shippingService.duplicatePolicy(
      req.user.id,
      req.params.policyId,
      req.body.targetZoneId
    );
    
    res.json({
      success: true,
      message: 'Politique dupliquée avec succès',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/seller/zones/available - Zones disponibles pour configuration
router.get('/zones/available', [
  query('search').optional().isString().trim(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const { search = '', limit = 50 } = req.query;
    
    const zones = await shippingService.getAvailableZones(
      req.user.id,
      search,
      limit
    );
    
    res.json({
      success: true,
      data: zones
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/seller/shipping/calculate - Calculer les frais (test)
router.post('/shipping/calculate', [
  body('customerZoneId').notEmpty().isMongoId(),
  body('weight').isFloat({ min: 0.1 }),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const { customerZoneId, weight } = req.body;
    
    const result = await shippingService.calculateShippingCost(
      req.user.id,
      customerZoneId,
      weight
    );
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});


module.exports = router;