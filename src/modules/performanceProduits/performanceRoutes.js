const express = require('express');
const router = express.Router();
const { getPerformance } = require('./performanceController');
const requireModuleAccess = require('../../middleware/requireModuleAccess');

router.use(requireModuleAccess('performanceProduits'));

// GET /api/modules/performance/products?period=7d|30d|90d
router.get('/products', getPerformance);

module.exports = router;
