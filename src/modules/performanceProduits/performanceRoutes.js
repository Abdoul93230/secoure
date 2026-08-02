const express = require('express');
const router = express.Router();
const { getPerformance, getAllPeriods } = require('./performanceController');
const requireModuleAccess = require('../../middleware/requireModuleAccess');

router.use(requireModuleAccess('performanceProduits'));

// GET /api/modules/performance/products?period=7d|30d|90d
router.get('/products', getPerformance);

// GET /api/modules/performance/products/all-periods — toutes les périodes en un appel
router.get('/products/all-periods', getAllPeriods);

module.exports = router;
