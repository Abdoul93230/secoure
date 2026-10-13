/**
 * API publique du moteur de livraison v3 — /api/shipping/v3
 *   POST /quote      devis complet d'un panier (un colis par boutique)
 *   GET  /estimate   estimation pour une fiche produit
 *   GET  /zones      toutes les zones actives (arbre complet, pour les sélecteurs)
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { quoteCart, listActiveZones } = require('../services/shipping/quoteService');

const router = express.Router();
const isId = (v) => /^[a-f\d]{24}$/i.test(String(v || ''));

// Protection contre l'abus (calcul coûteux) : 120 devis / minute / IP
router.use(rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false }));

router.post('/quote', async (req, res) => {
  try {
    const { destinationZoneId, items } = req.body || {};
    if (!isId(destinationZoneId)) return res.status(400).json({ success: false, message: 'Zone de livraison invalide.' });
    if (!Array.isArray(items) || !items.length || items.length > 100) {
      return res.status(400).json({ success: false, message: 'Panier vide ou trop volumineux.' });
    }
    const quote = await quoteCart({ destinationZoneId, items });
    return res.json({ success: true, data: quote });
  } catch (e) {
    console.error('[shipping/v3/quote]', e);
    return res.status(500).json({ success: false, message: 'Calcul de la livraison indisponible.' });
  }
});

router.get('/estimate', async (req, res) => {
  try {
    const { productId, destinationZoneId } = req.query;
    if (!isId(productId) || !isId(destinationZoneId)) return res.status(400).json({ success: false, message: 'Paramètres invalides.' });
    const quote = await quoteCart({ destinationZoneId, items: [{ productId, quantity: Math.max(1, Number(req.query.quantity) || 1) }] });
    return res.json({ success: true, data: quote.parcels[0] || null });
  } catch (e) {
    console.error('[shipping/v3/estimate]', e);
    return res.status(500).json({ success: false, message: 'Estimation indisponible.' });
  }
});

router.get('/zones', async (_req, res) => {
  try {
    const data = await listActiveZones();
    res.set('Cache-Control', 'public, max-age=60');
    return res.json({ success: true, total: data.length, data });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Zones indisponibles.' });
  }
});

module.exports = router;
