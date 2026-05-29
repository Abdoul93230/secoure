const express = require('express');
const router = express.Router();
const { getBilanToday, getBilanHistory, getBilanRange } = require('./bilanController');
const requireModuleAccess = require('../../middleware/requireModuleAccess');

router.use(requireModuleAccess('bilanJournalier'));

// GET /api/modules/bilan/today
router.get('/today', getBilanToday);

// GET /api/modules/bilan/history?days=7
router.get('/history', getBilanHistory);

// GET /api/modules/bilan/range?from=2026-05-01&to=2026-05-25
router.get('/range', getBilanRange);

module.exports = router;
