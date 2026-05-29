const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const shippingService = require('../services/shippingServiceF');

const router = express.Router();

router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ extended: true }));

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Erreurs de validation', errors: errors.array() });
  }
  next();
};

// GET /api/admin/seller-shipping/:sellerId — politiques d'un seller
router.get('/:sellerId', [
  param('sellerId').isMongoId(),
  query('includeInactive').optional().isBoolean().toBoolean(),
  handleValidationErrors,
], async (req, res, next) => {
  try {
    const policies = await shippingService.getSellerPolicies(req.params.sellerId, req.query);
    res.json({ success: true, data: policies });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/seller-shipping/:sellerId/stats
router.get('/:sellerId/stats', [
  param('sellerId').isMongoId(),
  handleValidationErrors,
], async (req, res, next) => {
  try {
    const stats = await shippingService.getSellerStats(req.params.sellerId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/seller-shipping/:sellerId/zones/available
router.get('/:sellerId/zones/available', [
  param('sellerId').isMongoId(),
  query('search').optional().isString().trim(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  handleValidationErrors,
], async (req, res, next) => {
  try {
    const { search = '', limit = 50 } = req.query;
    const zones = await shippingService.getAvailableZones(req.params.sellerId, search, limit);
    res.json({ success: true, data: zones });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/seller-shipping/:sellerId — créer/modifier politique
router.post('/:sellerId', [
  param('sellerId').isMongoId(),
  body('zoneId').notEmpty().isMongoId(),
  body('fixedCost').isInt({ min: 0 }),
  body('costPerKg').isInt({ min: 0 }),
  body('isDefault').optional().isBoolean(),
  body('isActive').optional().isBoolean(),
  handleValidationErrors,
], async (req, res, next) => {
  try {
    const { zoneId, ...policyData } = req.body;
    const result = await shippingService.setPolicyForZone(req.params.sellerId, zoneId, policyData);
    res.json({ success: true, message: 'Politique configurée avec succès', data: result });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/seller-shipping/:sellerId/:policyId — modifier
router.put('/:sellerId/:policyId', [
  param('sellerId').isMongoId(),
  param('policyId').isMongoId(),
  body('fixedCost').optional().isInt({ min: 0 }),
  body('costPerKg').optional().isInt({ min: 0 }),
  body('isDefault').optional().isBoolean(),
  body('isActive').optional().isBoolean(),
  handleValidationErrors,
], async (req, res, next) => {
  try {
    const policies = await shippingService.getSellerPolicies(req.params.sellerId, { includeInactive: true });
    const policy = policies.zonePolicies.find(p => p._id.toString() === req.params.policyId);
    if (!policy) return res.status(404).json({ success: false, message: 'Politique introuvable' });

    const result = await shippingService.setPolicyForZone(
      req.params.sellerId,
      policy.zoneId._id,
      { ...policy.toObject(), ...req.body }
    );
    res.json({ success: true, message: 'Politique modifiée avec succès', data: result });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/seller-shipping/:sellerId/:policyId
router.delete('/:sellerId/:policyId', [
  param('sellerId').isMongoId(),
  param('policyId').isMongoId(),
  handleValidationErrors,
], async (req, res, next) => {
  try {
    const result = await shippingService.removePolicy(req.params.sellerId, req.params.policyId);
    res.json({ success: true, message: 'Politique supprimée avec succès', data: result });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/seller-shipping/:sellerId/:policyId/toggle
router.patch('/:sellerId/:policyId/toggle', [
  param('sellerId').isMongoId(),
  param('policyId').isMongoId(),
  body('isActive').isBoolean(),
  handleValidationErrors,
], async (req, res, next) => {
  try {
    const result = await shippingService.togglePolicyStatus(
      req.params.sellerId,
      req.params.policyId,
      req.body.isActive
    );
    res.json({
      success: true,
      message: `Politique ${req.body.isActive ? 'activée' : 'désactivée'}`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/seller-shipping/:sellerId/:policyId/duplicate
router.post('/:sellerId/:policyId/duplicate', [
  param('sellerId').isMongoId(),
  param('policyId').isMongoId(),
  body('targetZoneId').notEmpty().isMongoId(),
  handleValidationErrors,
], async (req, res, next) => {
  try {
    const result = await shippingService.duplicatePolicy(
      req.params.sellerId,
      req.params.policyId,
      req.body.targetZoneId
    );
    res.json({ success: true, message: 'Politique dupliquée avec succès', data: result });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/seller-shipping/:sellerId/calculate
router.post('/:sellerId/calculate', [
  param('sellerId').isMongoId(),
  body('customerZoneId').notEmpty().isMongoId(),
  body('weight').isFloat({ min: 0.1 }),
  handleValidationErrors,
], async (req, res, next) => {
  try {
    const result = await shippingService.calculateShippingCost(
      req.params.sellerId,
      req.body.customerZoneId,
      req.body.weight
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
