/**
 * « Près de chez moi » : produits des boutiques les plus proches de la zone du client.
 * Paliers : même quartier → même ville → même région (les autres régions sont exclues).
 * Mêmes règles de visibilité que le reste du catalogue (publié, boutique éligible, non masqué).
 */
const { computeRelation } = require('./engine');
const { resolveSellerOrigin, zoneForEngine } = require('./quoteService');

const TIERS = ['sameDistrict', 'sameCity', 'sameRegion'];
const TIER_LABEL = { sameDistrict: 'Même quartier', sameCity: 'Même ville', sameRegion: 'Même région' };
const TTL_MS = 5 * 60 * 1000;
const tierCache = new Map(); // zoneId → { at, tiers, relationBySeller }

/** Boutiques éligibles regroupées par palier de proximité */
async function nearbySellerTiers(zoneId) {
  const hit = tierCache.get(String(zoneId));
  if (hit && Date.now() - hit.at < TTL_MS) return hit;

  const destination = await zoneForEngine(zoneId);
  if (!destination) return null;
  const productService = require('../productService');
  const { SellerRequest } = require('../../Models');
  const eligible = await productService.getEligibleSellerIds();
  const sellers = await SellerRequest.find({ _id: { $in: eligible } }, { city: 1, region: 1, address: 1, shippingOriginZoneId: 1 }).lean();

  const tiers = Object.fromEntries(TIERS.map((t) => [t, []]));
  const relationBySeller = {};
  for (const s of sellers) {
    const origin = await resolveSellerOrigin(s);
    if (!origin || origin.source === 'country-fallback') continue;
    const { relation } = computeRelation(origin, destination);
    if (!TIERS.includes(relation)) continue;
    tiers[relation].push(String(s._id));
    relationBySeller[String(s._id)] = TIER_LABEL[relation];
  }
  const value = { at: Date.now(), tiers, relationBySeller, destination: { zoneId: destination.id, name: destination.name, label: destination.label } };
  if (tierCache.size > 500) tierCache.clear();
  tierCache.set(String(zoneId), value);
  return value;
}

/** Produits paginés, les plus proches d'abord (puis les plus récents) */
async function nearbyProducts(zoneId, { page = 1, limit = 20 } = {}) {
  const t = await nearbySellerTiers(zoneId);
  if (!t) return null;
  const { Produit } = require('../../Models');
  const base = { isDeleted: false, isPublished: 'Published', 'subscriptionControl.forcedHidden': { $ne: true } };
  const counts = await Promise.all(TIERS.map((k) => (t.tiers[k].length ? Produit.countDocuments({ ...base, Clefournisseur: { $in: t.tiers[k] } }) : 0)));
  const total = counts.reduce((a, b) => a + b, 0);

  // Fenêtre [start, end) répartie sur les paliers successifs
  let start = (page - 1) * limit;
  let remaining = limit;
  const products = [];
  for (let i = 0; i < TIERS.length && remaining > 0; i += 1) {
    if (start >= counts[i]) { start -= counts[i]; continue; }
    const take = Math.min(remaining, counts[i] - start);
    const docs = await Produit.find({ ...base, Clefournisseur: { $in: t.tiers[TIERS[i]] } })
      .sort({ createdAt: -1, _id: -1 })
      .skip(start)
      .limit(take)
      .populate('Clefournisseur', 'name storeName logo subscriptionStatus isvalid')
      .lean();
    products.push(...docs);
    remaining -= docs.length;
    start = 0;
  }
  return {
    destination: t.destination,
    products,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    relationBySeller: t.relationBySeller,
    sellerCount: Object.keys(t.relationBySeller).length,
  };
}

const clearNearbyCache = () => tierCache.clear();

module.exports = { nearbyProducts, nearbySellerTiers, clearNearbyCache };
