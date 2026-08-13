const express = require('express');
const router = express.Router();
const { getAlertes, getSeuil, updateSeuil } = require('./alertesController');
const requireModuleAccess = require('../../middleware/requireModuleAccess');

router.use(requireModuleAccess('alertesStock'));

// GET  /api/modules/stock/alerts
router.get('/alerts', getAlertes);

// GET  /api/modules/stock/seuil   — seuil global actuel
router.get('/seuil', getSeuil);

// PATCH /api/modules/stock/seuil  { seuil: number }
router.patch('/seuil', updateSeuil);

module.exports = router;
