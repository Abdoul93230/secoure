/**
 * API admin du moteur de livraison v3 — /api/admin/shipping-v3 (requireAdmin au montage)
 *   Modèles   : GET/POST /templates, GET/PUT/DELETE /templates/:id, POST /templates/:id/duplicate, POST /templates/:id/default
 *   Campagnes : GET/POST /campaigns, PUT/DELETE /campaigns/:id
 *   Boutiques : GET /sellers, PATCH /sellers/:sellerId, POST /sellers/bulk
 *   Outils    : POST /simulate
 */
const express = require('express');
const ShippingTemplate = require('../models/ShippingTemplate');
const ShippingCampaign = require('../models/ShippingCampaign');
const { SellerRequest, Produit } = require('../Models');
const { quoteParcel } = require('../services/shipping/engine');
const {
  invalidateShippingCaches,
  resolveSellerOrigin,
  zoneForEngine,
  ensureDefaultTemplate,
  loadTemplates,
} = require('../services/shipping/quoteService');

const router = express.Router();
const isId = (v) => /^[a-f\d]{24}$/i.test(String(v || ''));
const RELATIONS = ['sameDistrict', 'sameCity', 'sameRegion', 'otherRegion', 'international'];

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: Object.values(e.errors).map((x) => x.message).join(' · ') });
    }
    if (e.code === 11000) return res.status(409).json({ success: false, message: 'Ce code de modèle existe déjà.' });
    console.error('[admin/shipping-v3]', e);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

/** Champs modifiables d'un modèle (liste blanche) */
function templatePayload(body = {}) {
  const out = {};
  for (const k of ['name', 'description', 'isActive', 'areaRates', 'regionRoutes', 'destinationRules', 'includedWeightKg', 'extraPerKgByClass', 'sameDayCutoff', 'maxWeightKg', 'codAllowed']) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  if (body.relations && typeof body.relations === 'object') {
    out.relations = {};
    for (const r of RELATIONS) if (body.relations[r]) out.relations[r] = body.relations[r];
  }
  return out;
}

function campaignPayload(body = {}) {
  const out = {};
  for (const k of ['name', 'description', 'isActive', 'startsAt', 'endsAt', 'minParcelSubtotal', 'relations', 'destinationZoneIds', 'sellerIds', 'priority']) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

const actor = (req) => String(req.userId || req.user?.id || 'admin');
const done = (res, data, status = 200) => {
  invalidateShippingCaches();
  return res.status(status).json({ success: true, data });
};

// ─── Modèles ─────────────────────────────────────────────────────────────────

router.get('/templates', wrap(async (_req, res) => {
  await ensureDefaultTemplate();
  const templates = await ShippingTemplate.find().sort({ isDefault: -1, kind: 1, name: 1 }).lean();
  const usage = await SellerRequest.aggregate([{ $match: { shippingTemplateId: { $ne: null } } }, { $group: { _id: '$shippingTemplateId', n: { $sum: 1 } } }]);
  const used = new Map(usage.map((u) => [String(u._id), u.n]));
  res.json({ success: true, data: templates.map((t) => ({ ...t, sellerCount: used.get(String(t._id)) || 0 })) });
}));

router.get('/templates/:id', wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Identifiant invalide.' });
  const t = await ShippingTemplate.findById(req.params.id).lean();
  if (!t) return res.status(404).json({ success: false, message: 'Modèle introuvable.' });
  return res.json({ success: true, data: t });
}));

router.post('/templates', wrap(async (req, res) => {
  const t = await ShippingTemplate.create({ ...templatePayload(req.body), kind: req.body.ownerSellerId ? 'custom' : 'platform', ownerSellerId: isId(req.body.ownerSellerId) ? req.body.ownerSellerId : null, isDefault: false, updatedBy: actor(req) });
  return done(res, t, 201);
}));

router.put('/templates/:id', wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Identifiant invalide.' });
  const t = await ShippingTemplate.findById(req.params.id);
  if (!t) return res.status(404).json({ success: false, message: 'Modèle introuvable.' });
  const payload = templatePayload(req.body);
  if (t.isDefault && payload.isActive === false) return res.status(400).json({ success: false, message: 'Le modèle par défaut ne peut pas être désactivé.' });
  t.set({ ...payload, updatedBy: actor(req) });
  await t.save();
  return done(res, t);
}));

router.post('/templates/:id/duplicate', wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Identifiant invalide.' });
  const src = await ShippingTemplate.findById(req.params.id).lean();
  if (!src) return res.status(404).json({ success: false, message: 'Modèle introuvable.' });
  const { _id, code, createdAt, updatedAt, isDefault, ...rest } = src;
  const sellerId = isId(req.body.ownerSellerId) ? req.body.ownerSellerId : null;
  const copy = await ShippingTemplate.create({
    ...rest,
    name: req.body.name || `${src.name} (copie)`,
    kind: sellerId ? 'custom' : 'platform',
    ownerSellerId: sellerId,
    basedOnTemplateId: src._id,
    isDefault: false,
    updatedBy: actor(req),
  });
  // « Personnaliser » une boutique : on lui affecte directement sa copie
  if (sellerId) await SellerRequest.updateOne({ _id: sellerId }, { $set: { shippingTemplateId: copy._id } });
  return done(res, copy, 201);
}));

router.post('/templates/:id/default', wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Identifiant invalide.' });
  const t = await ShippingTemplate.findById(req.params.id);
  if (!t || !t.isActive) return res.status(404).json({ success: false, message: 'Modèle introuvable ou inactif.' });
  if (t.kind === 'custom') return res.status(400).json({ success: false, message: 'Un modèle personnalisé de boutique ne peut pas être le modèle par défaut.' });
  t.isDefault = true;
  t.updatedBy = actor(req);
  await t.save();
  return done(res, t);
}));

router.delete('/templates/:id', wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Identifiant invalide.' });
  const t = await ShippingTemplate.findById(req.params.id);
  if (!t) return res.status(404).json({ success: false, message: 'Modèle introuvable.' });
  if (t.isDefault) return res.status(400).json({ success: false, message: 'Choisissez d’abord un autre modèle par défaut.' });
  // Les boutiques et produits concernés retombent sur le modèle par défaut
  const [sellers, products] = await Promise.all([
    SellerRequest.updateMany({ shippingTemplateId: t._id }, { $set: { shippingTemplateId: null } }),
    Produit.updateMany({ 'shipping.templateId': t._id }, { $set: { 'shipping.templateId': null } }),
  ]);
  await t.deleteOne();
  return done(res, { deleted: true, sellersReassigned: sellers.modifiedCount, productsReassigned: products.modifiedCount });
}));

// ─── Campagnes de livraison offerte ──────────────────────────────────────────

router.get('/campaigns', wrap(async (_req, res) => {
  res.json({ success: true, data: await ShippingCampaign.find().sort({ isActive: -1, priority: -1, createdAt: -1 }).lean() });
}));

router.post('/campaigns', wrap(async (req, res) => done(res, await ShippingCampaign.create({ ...campaignPayload(req.body), updatedBy: actor(req) }), 201)));

router.put('/campaigns/:id', wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Identifiant invalide.' });
  const c = await ShippingCampaign.findById(req.params.id);
  if (!c) return res.status(404).json({ success: false, message: 'Campagne introuvable.' });
  c.set({ ...campaignPayload(req.body), updatedBy: actor(req) });
  await c.save();
  return done(res, c);
}));

router.delete('/campaigns/:id', wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Identifiant invalide.' });
  await ShippingCampaign.deleteOne({ _id: req.params.id });
  return done(res, { deleted: true });
}));

// ─── Boutiques : lieu d'expédition et modèle ─────────────────────────────────

router.get('/sellers', wrap(async (_req, res) => {
  const [sellers, templates] = await Promise.all([
    SellerRequest.find({}, { storeName: 1, name: 1, city: 1, region: 1, isvalid: 1, subscriptionStatus: 1, shippingOriginZoneId: 1, shippingTemplateId: 1, logo: 1 }).sort({ storeName: 1 }).lean(),
    loadTemplates(),
  ]);
  const def = templates.find((t) => t.isDefault);
  const byId = new Map(templates.map((t) => [String(t._id), t]));
  const data = [];
  for (const s of sellers) {
    const origin = await resolveSellerOrigin(s);
    const t = byId.get(String(s.shippingTemplateId)) || def;
    data.push({
      _id: s._id,
      storeName: s.storeName || s.name,
      logo: s.logo,
      isvalid: s.isvalid,
      subscriptionStatus: s.subscriptionStatus,
      profileLocation: [s.city, s.region].filter(Boolean).join(' / '),
      origin: origin ? { zoneId: origin.id, label: origin.label, source: origin.source } : null,
      template: t ? { _id: t._id, name: t.name, kind: t.kind, inherited: !s.shippingTemplateId } : null,
    });
  }
  res.json({ success: true, data });
}));

async function validateSellerShippingPatch(body) {
  const set = {};
  if (body.shippingOriginZoneId !== undefined) {
    if (body.shippingOriginZoneId !== null && !(await zoneForEngine(body.shippingOriginZoneId))) throw Object.assign(new Error('Zone d’expédition inconnue.'), { status: 400 });
    set.shippingOriginZoneId = body.shippingOriginZoneId;
  }
  if (body.shippingTemplateId !== undefined) {
    if (body.shippingTemplateId !== null && !(await ShippingTemplate.exists({ _id: body.shippingTemplateId, isActive: true }))) throw Object.assign(new Error('Modèle inconnu ou inactif.'), { status: 400 });
    set.shippingTemplateId = body.shippingTemplateId;
  }
  return set;
}

router.patch('/sellers/:sellerId', wrap(async (req, res) => {
  if (!isId(req.params.sellerId)) return res.status(400).json({ success: false, message: 'Identifiant invalide.' });
  let set;
  try { set = await validateSellerShippingPatch(req.body || {}); } catch (e) { return res.status(e.status || 400).json({ success: false, message: e.message }); }
  const r = await SellerRequest.updateOne({ _id: req.params.sellerId }, { $set: set });
  if (!r.matchedCount) return res.status(404).json({ success: false, message: 'Boutique introuvable.' });
  return done(res, { updated: true });
}));

router.post('/sellers/bulk', wrap(async (req, res) => {
  const ids = (req.body?.sellerIds || []).filter(isId);
  if (!ids.length) return res.status(400).json({ success: false, message: 'Aucune boutique sélectionnée.' });
  let set;
  try { set = await validateSellerShippingPatch(req.body || {}); } catch (e) { return res.status(e.status || 400).json({ success: false, message: e.message }); }
  if (!Object.keys(set).length) return res.status(400).json({ success: false, message: 'Rien à modifier.' });
  const r = await SellerRequest.updateMany({ _id: { $in: ids } }, { $set: set });
  return done(res, { updated: r.modifiedCount });
}));

// ─── Simulateur ──────────────────────────────────────────────────────────────

router.post('/simulate', wrap(async (req, res) => {
  const { sellerId, originZoneId, destinationZoneId, templateId, items } = req.body || {};
  const templates = await loadTemplates();
  const seller = isId(sellerId) ? await SellerRequest.findById(sellerId, { city: 1, region: 1, shippingOriginZoneId: 1, shippingTemplateId: 1 }).lean() : null;
  const origin = isId(originZoneId) ? await zoneForEngine(originZoneId) : await resolveSellerOrigin(seller || {});
  const destination = await zoneForEngine(destinationZoneId);
  const template = templates.find((t) => String(t._id) === String(templateId))
    || templates.find((t) => String(t._id) === String(seller?.shippingTemplateId))
    || templates.find((t) => t.isDefault);
  const campaigns = await ShippingCampaign.find({ isActive: true }).lean();
  const parcelItems = (Array.isArray(items) && items.length ? items : [{ quantity: 1, unitPrice: 0, sizeClass: 'small' }]).slice(0, 50);
  const quote = quoteParcel({ template, origin, destination, items: parcelItems, sellerId, campaigns });
  res.json({ success: true, data: { ...quote, origin: origin && { zoneId: origin.id, label: origin.label }, destination: destination && { zoneId: destination.id, label: destination.label }, template: template && { _id: template._id, name: template.name } } });
}));

module.exports = router;
