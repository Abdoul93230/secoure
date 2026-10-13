/**
 * API publique du moteur de livraison v3 — /api/shipping/v3
 *   POST /quote      devis complet d'un panier (un colis par boutique)
 *   GET  /estimate   estimation pour une fiche produit
 *   POST /zone-requests  localité absente de la liste (nom + zone la plus proche)
 *   GET  /nearby     produits des boutiques les plus proches (?zoneId=…)
 *   GET  /origins    ville d'expédition des boutiques (?ids=…)
 *   GET  /zones      toutes les zones actives (arbre complet, pour les sélecteurs)
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { quoteCart, listActiveZones, sellerOriginBadges } = require('../services/shipping/quoteService');

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

/** Localité absente de la liste : enregistrée pour que l'admin l'ajoute (20 / heure / IP) */
const zoneRequestLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
router.post('/zone-requests', zoneRequestLimiter, async (req, res) => {
  try {
    const { name, nearZoneId } = req.body || {};
    const r = await require('../services/zones/zoneRequests').recordZoneRequest({ name, nearZoneId });
    if (!r) return res.status(400).json({ success: false, message: 'Indiquez le nom de votre localité et la ville la plus proche.' });
    return res.json({ success: true, data: r });
  } catch (e) {
    console.error('[shipping/v3/zone-requests]', e);
    return res.status(500).json({ success: false, message: 'Enregistrement impossible.' });
  }
});

/** « Près de chez moi » : ?zoneId=…&page=1&limit=20 — produits des boutiques les plus proches */
router.get('/nearby', async (req, res) => {
  try {
    const { zoneId } = req.query;
    if (!isId(zoneId)) return res.status(400).json({ success: false, message: 'Zone invalide.' });
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(40, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const data = await require('../services/shipping/nearby').nearbyProducts(zoneId, { page, limit });
    if (!data) return res.status(404).json({ success: false, message: 'Zone introuvable.' });
    res.set('Cache-Control', 'public, max-age=120');
    return res.json({ success: true, data });
  } catch (e) {
    console.error('[shipping/v3/nearby]', e);
    return res.status(500).json({ success: false, message: 'Produits proches indisponibles.' });
  }
});

/** Ville d'expédition des boutiques (badge « 📍 ville ») : ?ids=a,b,c (200 max) */
router.get('/origins', async (req, res) => {
  try {
    const ids = String(req.query.ids || '').split(',').map((x) => x.trim()).filter((x) => isId(x)).slice(0, 200);
    if (!ids.length) return res.json({ success: true, data: {} });
    const data = await sellerOriginBadges(ids);
    res.set('Cache-Control', 'public, max-age=300');
    return res.json({ success: true, data });
  } catch (e) {
    console.error('[shipping/v3/origins]', e);
    return res.status(500).json({ success: false, message: 'Origines indisponibles.' });
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
