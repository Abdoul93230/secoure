const express = require('express');
const router = express.Router();
const { getRapportMensuel, getRapportHebdo } = require('./rapportController');
const requireModuleAccess = require('../../middleware/requireModuleAccess');

router.use(requireModuleAccess('rapportPeriodique'));

// GET /api/modules/rapports/mensuel?month=2026-05
router.get('/mensuel', getRapportMensuel);

// GET /api/modules/rapports/hebdo
router.get('/hebdo', getRapportHebdo);

module.exports = router;
