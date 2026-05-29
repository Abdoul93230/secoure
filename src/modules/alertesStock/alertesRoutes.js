const express = require('express');
const router = express.Router();
const { getAlertes, updateSeuil } = require('./alertesController');
const requireModuleAccess = require('../../middleware/requireModuleAccess');

router.use(requireModuleAccess('alertesStock'));

// GET /api/modules/stock/alerts
router.get('/alerts', getAlertes);

// PATCH /api/modules/stock/seuil/:produitId  { seuil: 5 }
router.patch('/seuil/:produitId', updateSeuil);

module.exports = router;
