/**
 * Service de devis de livraison : relie le moteur pur (engine.js) aux données.
 * Source de vérité UNIQUE des frais : utilisé par l'API de devis, la création de commande
 * et les anciens endpoints (/api/shipping2/calculate…) pour garantir « prix affiché = prix facturé ».
 */
const mongoose = require('mongoose');
const Zone = require('../../models/Zone');
const ShippingTemplate = require('../../models/ShippingTemplate');
const ShippingCampaign = require('../../models/ShippingCampaign');
const { quoteParcel } = require('./engine');
const { STANDARD_TEMPLATE_CODE, buildStandardTemplate } = require('./defaults');
const { REASON_MESSAGES } = require('./constants');

const { ObjectId } = mongoose.Types;
const str = (v) => (v == null ? '' : String(v));
const isId = (v) => !!v && ObjectId.isValid(String(v));

// ─── Caches courts (données d'admin rarement modifiées) ──────────────────────
const TTL_MS = 60 * 1000;
let zonesCache = { at: 0, byId: null, pending: null };
let templatesCache = { at: 0, list: null };
let campaignsCache = { at: 0, list: null };

/** À appeler après toute modification admin (zones, modèles, campagnes) */
let activeZonesCache = { at: 0, data: null };

/** Zones actives pour les sélecteurs (GET /api/shipping-v3/zones) — vidé à chaque modification admin */
async function listActiveZones() {
  if (activeZonesCache.data && Date.now() - activeZonesCache.at < 5 * 60 * 1000) return activeZonesCache.data;
  const data = await Zone.find({ isActive: true }, { name: 1, type: 1, parent: 1, fullPath: 1, level: 1, aliases: 1, center: 1 }).sort({ fullPath: 1 }).lean();
  activeZonesCache = { at: Date.now(), data };
  return data;
}

function invalidateShippingCaches() {
  originBadgeCache.clear();
  activeZonesCache = { at: 0, data: null };
  zonesCache = { at: 0, byId: null, pending: null };
  templatesCache = { at: 0, list: null };
  campaignsCache = { at: 0, list: null };
}

const normalizeName = (s) =>
  str(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function loadZones() {
  if (zonesCache.byId && Date.now() - zonesCache.at < TTL_MS) return zonesCache.byId;
  if (!zonesCache.pending) {
    zonesCache.pending = Zone.find({}, { name: 1, type: 1, parent: 1, isActive: 1, fullPath: 1, aliases: 1 })
      .lean()
      .then((zones) => {
        const byId = new Map(zones.map((z) => [str(z._id), z]));
        zonesCache = { at: Date.now(), byId, pending: null };
        return byId;
      })
      .catch((e) => {
        zonesCache.pending = null;
        throw e;
      });
  }
  return zonesCache.pending;
}

/** Zone normalisée pour le moteur : { id, label, path: [{id, type}] } */
async function zoneForEngine(zoneId) {
  if (!isId(zoneId)) return null;
  const byId = await loadZones();
  const z = byId.get(str(zoneId));
  if (!z) return null;
  // Chemin reconstruit via les liens « parent » : le champ « ancestors » stocké est incomplet
  // pour la majorité des zones en production (bug du modèle Zone, ref 'Zone' au lieu de 'ZoneF').
  const chain = [];
  const seen = new Set();
  for (let cur = z; cur && !seen.has(str(cur._id)); cur = cur.parent ? byId.get(str(cur.parent)) : null) {
    seen.add(str(cur._id));
    chain.unshift(cur);
  }
  const path = chain.map((x) => ({ id: str(x._id), type: x.type }));
  return { id: str(z._id), label: z.fullPath || z.name, name: z.name, path };
}

async function loadTemplates() {
  if (templatesCache.list && Date.now() - templatesCache.at < TTL_MS) return templatesCache.list;
  let list = await ShippingTemplate.find({ isActive: true }).lean();
  if (!list.some((t) => t.isDefault)) {
    await ensureDefaultTemplate();
    list = await ShippingTemplate.find({ isActive: true }).lean();
  }
  templatesCache = { at: Date.now(), list };
  return list;
}

async function loadCampaigns() {
  if (campaignsCache.list && Date.now() - campaignsCache.at < TTL_MS) return campaignsCache.list;
  const list = await ShippingCampaign.find({ isActive: true }).lean();
  campaignsCache = { at: Date.now(), list };
  return list;
}

/** Crée « Standard Niger » s'il n'existe aucun modèle par défaut (idempotent) */
async function ensureDefaultTemplate() {
  const existing = await ShippingTemplate.findOne({ isDefault: true, isActive: true });
  if (existing) return existing;
  const byCode = await ShippingTemplate.findOne({ code: STANDARD_TEMPLATE_CODE });
  if (byCode) {
    byCode.isDefault = true;
    byCode.isActive = true;
    return byCode.save();
  }
  const byId = await loadZones();
  const niamey = [...byId.values()].find((z) => z.type === 'region' && normalizeName(z.name) === 'niamey');
  return ShippingTemplate.create(buildStandardTemplate({ niameyZoneId: niamey?._id }));
}

// ─── Boutique : lieu d'expédition et modèle ──────────────────────────────────

const PLATFORM_COUNTRY = 'niger';
const TYPE_DEPTH = { district: 3, city: 2, region: 1, country: 0 };

/** Pays de la plateforme : repli prudent quand la boutique n'est pas localisable */
async function platformCountryZone() {
  const byId = await loadZones();
  const niger = [...byId.values()].find((z) => z.type === 'country' && normalizeName(z.name) === PLATFORM_COUNTRY);
  return niger ? zoneForEngine(niger._id) : null;
}

/** Mots candidats depuis les champs libres du profil (« Niamey / Saga », « Niamey2 »…) */
const locationTokens = (seller) => {
  const out = new Set();
  for (const field of ['city', 'region']) {
    const raw = str(seller?.[field]);
    for (const part of [raw, ...raw.split(/[\/,;|>\-]+/)]) {
      const n = normalizeName(part);
      if (n) out.add(n);
      const noDigits = normalizeName(part.replace(/\d+/g, ' '));
      if (noDigits) out.add(noDigits);
    }
  }
  return [...out];
};

/**
 * Lieu d'expédition d'une boutique :
 *  1. configuré par l'admin (shippingOriginZoneId)
 *  2. déduit des champs ville/région du profil : zone la plus précise (jamais le pays seul), Niger d'abord
 *  3. repli : le pays de la plateforme (frais « autre région », prudent ; reste « international » pour l'étranger)
 */
async function resolveSellerOrigin(seller) {
  if (isId(seller?.shippingOriginZoneId)) {
    const z = await zoneForEngine(seller.shippingOriginZoneId);
    if (z) return { ...z, source: 'configured' };
  }
  const byId = await loadZones();
  const tokens = locationTokens(seller);
  const names = (z) => [z.name, ...(z.aliases || [])].map(normalizeName);
  // Cohérence : nombre de niveaux du chemin cités dans le profil (« Sabon Gari / Zinder » → Zinder, pas Maradi)
  const coherence = (z) => str(z.fullPath).split('>').filter((seg) => tokens.includes(normalizeName(seg))).length;
  const candidates = [...byId.values()]
    .filter((z) => z.isActive !== false && z.type !== 'country' && names(z).some((n) => tokens.includes(n)))
    .map((z) => ({ z, score: coherence(z), home: normalizeName(z.fullPath).startsWith(PLATFORM_COUNTRY) ? 1 : 0 }))
    .sort((a, b) => b.home - a.home || b.score - a.score || TYPE_DEPTH[b.z.type] - TYPE_DEPTH[a.z.type])
    .map((c) => c.z);
  if (candidates[0]) return { ...(await zoneForEngine(candidates[0]._id)), source: 'inferred' };
  const country = await platformCountryZone();
  return country ? { ...country, source: 'country-fallback' } : null;
}

const pickTemplate = (templates, id) => templates.find((t) => str(t._id) === str(id) && t.isActive !== false);
const defaultTemplate = (templates) => templates.find((t) => t.isDefault) || templates[0];

// ─── Devis ───────────────────────────────────────────────────────────────────

/** Prix unitaire facturé : même règle que la création de commande */
const serverUnitPrice = (p) => (Number(p.prixPromo) > 0 ? Number(p.prixPromo) : Number(p.prix) || 0);

/**
 * Devis pour un panier.
 * @param {{ destinationZoneId: string, items: {productId: string, quantity: number}[], now?: Date }} input
 */
async function quoteCart({ destinationZoneId, items, now = new Date() }) {
  const { Produit, SellerRequest } = require('../../Models');
  const destination = await zoneForEngine(destinationZoneId);

  const lines = (items || []).filter((it) => isId(it.productId)).map((it) => ({ productId: str(it.productId), quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)) }));
  const products = await Produit.find({ _id: { $in: lines.map((l) => l.productId) } }, { name: 1, prix: 1, prixPromo: 1, shipping: 1, Clefournisseur: 1 }).lean();
  const productMap = new Map(products.map((p) => [str(p._id), p]));

  const groups = new Map();
  const unknownProducts = [];
  for (const l of lines) {
    const p = productMap.get(l.productId);
    if (!p) { unknownProducts.push(l.productId); continue; }
    const sid = str(p.Clefournisseur);
    if (!groups.has(sid)) groups.set(sid, []);
    groups.get(sid).push({
      productId: l.productId,
      quantity: l.quantity,
      unitPrice: serverUnitPrice(p),
      weightKg: Number(p.shipping?.weight) > 0 ? Number(p.shipping.weight) : null,
      sizeClass: p.shipping?.sizeClass || null,
      templateId: p.shipping?.templateId || null,
    });
  }

  const sellers = await SellerRequest.find({ _id: { $in: [...groups.keys()].filter(isId) } }, { storeName: 1, name: 1, city: 1, region: 1, shippingOriginZoneId: 1, shippingTemplateId: 1 }).lean();
  const sellerMap = new Map(sellers.map((s) => [str(s._id), s]));
  const [templates, campaigns] = await Promise.all([loadTemplates(), loadCampaigns()]);

  const parcels = [];
  for (const [sellerId, parcelItems] of groups) {
    const seller = sellerMap.get(sellerId) || {};
    const origin = await resolveSellerOrigin(seller);
    const storeTemplate = pickTemplate(templates, seller.shippingTemplateId) || defaultTemplate(templates);
    // Modèles propres à certains produits (ex. « Colis lourd ») : on retient le plus cher (jamais de sous-facturation)
    const candidates = [storeTemplate, ...new Set(parcelItems.map((i) => i.templateId).filter(Boolean))]
      .map((t) => (typeof t === 'object' ? t : pickTemplate(templates, t)))
      .filter(Boolean);
    const quotes = [...new Map(candidates.map((t) => [str(t._id), t])).values()].map((template) =>
      quoteParcel({ template, origin, destination, items: parcelItems, sellerId, campaigns, now }));
    const blocking = quotes.find((q) => !q.deliverable);
    const chosen = blocking || quotes.sort((a, b) => (b.fee ?? 0) + (b.free?.amount ?? 0) - ((a.fee ?? 0) + (a.free?.amount ?? 0)))[0];

    parcels.push({
      sellerId,
      storeName: seller.storeName || seller.name || 'Boutique',
      origin: origin ? { zoneId: origin.id, label: origin.label, name: origin.name, source: origin.source } : null,
      items: parcelItems.map(({ productId, quantity }) => ({ productId, quantity })),
      ...chosen,
    });
  }

  const deliverable = parcels.every((p) => p.deliverable);
  return {
    destination: destination ? { zoneId: destination.id, label: destination.label } : null,
    parcels,
    totalFee: parcels.reduce((s, p) => s + (p.fee || 0), 0),
    allDeliverable: deliverable,
    quoteRequired: parcels.some((p) => p.quoteRequired),
    unknownProducts,
    message: destination ? null : REASON_MESSAGES.DESTINATION_UNKNOWN,
  };
}

/**
 * Compatibilité avec l'ancien calcul (vendeur + zone + poids, sans liste d'articles).
 * Renvoie le même format que ShippingPolicy.calculateShippingCost.
 */
async function legacyQuote(sellerId, customerZoneId, weight) {
  const { SellerRequest } = require('../../Models');
  const [seller, destination, templates] = await Promise.all([
    isId(sellerId) ? SellerRequest.findById(sellerId, { city: 1, region: 1, shippingOriginZoneId: 1, shippingTemplateId: 1 }).lean() : null,
    zoneForEngine(customerZoneId),
    loadTemplates(),
  ]);
  if (!destination) throw new Error('Zone client introuvable');
  const origin = await resolveSellerOrigin(seller || {});
  const template = pickTemplate(templates, seller?.shippingTemplateId) || defaultTemplate(templates);
  // Pas de campagne ici : l'ancien appel ne connaît pas le montant des articles
  const q = quoteParcel({ template, origin, destination, items: [{ quantity: 1, unitPrice: 0, weightKg: Number(weight) || 0.5 }], sellerId, campaigns: [] });
  if (!q.deliverable) throw new Error(q.message || 'Livraison indisponible pour cette zone');
  return {
    fixedCost: q.baseFee + (q.surcharge || 0),
    costPerKg: template.extraPerKgByClass?.[q.sizeClass] || 0,
    weight: q.weightKg,
    weightCost: q.extraFee,
    totalCost: q.fee,
    appliedPolicy: { zone: q.relationLabel, type: q.relation, isDefault: false },
    delay: q.delay,
  };
}

// ─── Badge « 📍 ville » des boutiques (cartes produit, fiche produit) ──────────

const originBadgeCache = new Map(); // sellerId → { at, value }

/** Ville affichée pour une boutique : « Niamey » (toutes communes), sinon la ville, sinon la région */
async function originBadgeOf(seller) {
  const origin = await resolveSellerOrigin(seller);
  if (!origin || origin.source === 'country-fallback') return null;
  const byId = await loadZones();
  const chain = (origin.path || []).map((p) => byId.get(str(p.id))).filter(Boolean);
  const country = chain.find((z) => z.type === 'country');
  const region = chain.find((z) => z.type === 'region');
  const city = chain.find((z) => z.type === 'city');
  const district = chain.find((z) => z.type === 'district');
  const isNiamey = normalizeName(region?.name) === 'niamey';
  const cityName = isNiamey ? 'Niamey' : city?.name || region?.name || null;
  if (!cityName) return null;
  const abroad = country && normalizeName(country.name) !== PLATFORM_COUNTRY;
  return {
    city: abroad ? `${cityName}, ${country.name}` : cityName,
    detail: district?.name || (isNiamey ? city?.name : null) || null,
    regionId: str(region?._id) || null,
    source: origin.source,
  };
}

/** Badges de plusieurs boutiques (cache 5 min par boutique) */
async function sellerOriginBadges(sellerIds) {
  const ids = [...new Set((sellerIds || []).map(str).filter(isId))].slice(0, 200);
  const out = {};
  const missing = [];
  for (const id of ids) {
    const hit = originBadgeCache.get(id);
    if (hit && Date.now() - hit.at < TTL_MS * 5) out[id] = hit.value;
    else missing.push(id);
  }
  if (missing.length) {
    const { SellerRequest } = require('../../Models');
    const sellers = await SellerRequest.find({ _id: { $in: missing } }, { city: 1, region: 1, shippingOriginZoneId: 1 }).lean();
    const byId = new Map(sellers.map((s) => [str(s._id), s]));
    for (const id of missing) {
      const s = byId.get(id);
      const value = s ? await originBadgeOf(s) : null;
      originBadgeCache.set(id, { at: Date.now(), value });
      out[id] = value;
    }
  }
  return out;
}

module.exports = {
  quoteCart,
  sellerOriginBadges,
  legacyQuote,
  resolveSellerOrigin,
  zoneForEngine,
  ensureDefaultTemplate,
  invalidateShippingCaches,
  loadTemplates,
  listActiveZones,
};
