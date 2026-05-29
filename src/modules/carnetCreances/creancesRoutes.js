const express = require('express');
const router = express.Router();
const {
  listerCreances,
  creerCreance,
  modifierCreance,
  supprimerCreance,
  rembourser,
  changerStatut,
  envoyerRappel,
  getStats,
} = require('./creancesController');
const requireModuleAccess = require('../../middleware/requireModuleAccess');

router.use(requireModuleAccess('carnetCreances'));

// GET    /api/modules/creances?statut=en_cours
router.get('/', listerCreances);

// GET    /api/modules/creances/stats
router.get('/stats', getStats);

// POST   /api/modules/creances/
router.post('/', creerCreance);

// PATCH  /api/modules/creances/:id
router.patch('/:id', modifierCreance);

// DELETE /api/modules/creances/:id
router.delete('/:id', supprimerCreance);

// PATCH  /api/modules/creances/:id/rembourser
router.patch('/:id/rembourser', rembourser);

// PATCH  /api/modules/creances/:id/statut
router.patch('/:id/statut', changerStatut);

// POST   /api/modules/creances/:id/rappel
router.post('/:id/rappel', envoyerRappel);

module.exports = router;
