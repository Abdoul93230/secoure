/**
 * Zone de livraison du client (adresse structurée, livraison v3).
 *
 * Source de vérité côté serveur : le client choisit une zone dans la liste (GET /api/shipping-v3/zones),
 * le serveur la valide, en déduit les champs texte historiques (region / quartier) et calcule les frais.
 */
const mongoose = require('mongoose');

const isId = (v) => /^[a-f\d]{24}$/i.test(String(v || ''));
const zones = () => mongoose.connection.db.collection('zonefs');

/**
 * Zone active et exploitable pour une adresse : jamais un pays seul.
 * @returns {Promise<null | { id, name, type, path: string, region: string, quartier: string }>}
 */
async function describeCustomerZone(zoneId) {
  if (!isId(zoneId)) return null;
  const z = await zones().findOne({ _id: new mongoose.Types.ObjectId(String(zoneId)) });
  if (!z || z.isActive === false || z.type === 'country') return null;
  // Chaîne complète via parent (seule source fiable)
  const chain = [z];
  const seen = new Set([String(z._id)]);
  for (let cur = z; cur.parent;) {
    const p = await zones().findOne({ _id: cur.parent }, { projection: { name: 1, type: 1, parent: 1 } });
    if (!p || seen.has(String(p._id))) break;
    seen.add(String(p._id));
    chain.unshift(p);
    cur = p;
  }
  const region = chain.find((c) => c.type === 'region');
  const city = chain.find((c) => c.type === 'city');
  return {
    id: String(z._id),
    name: z.name,
    type: z.type,
    path: chain.map((c) => c.name).join(' > '),
    // Champs texte historiques (commandes, notifications, admin) : région + quartier (ou ville)
    region: region?.name || z.name,
    quartier: z.type === 'district' ? z.name : city?.name || region?.name || z.name,
  };
}

/** Position GPS facultative, nettoyée (5 décimales ≈ 1 m) */
function cleanLocation(loc) {
  if (!loc || loc.lat == null || loc.lng == null) return undefined;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  const out = { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
  const acc = Number(loc.accuracy);
  if (Number.isFinite(acc) && acc >= 0) out.accuracy = Math.round(acc);
  return out;
}

/**
 * Zone de destination d'une commande, par ordre de confiance :
 * zone envoyée (customerZoneId) → zone des détails de livraison → commande existante (relance) → adresse enregistrée.
 */
async function resolveOrderZoneId({ data = {}, existingOrder = null, AdressShipping = null } = {}) {
  const candidates = [data.customerZoneId, data.livraisonDetails?.zoneId, existingOrder?.livraisonDetails?.zoneId];
  for (const c of candidates) if (isId(c)) return String(c);
  if (AdressShipping && data.clefUser) {
    const addr = await AdressShipping.findOne({ clefUser: data.clefUser }, { zoneId: 1 }).lean();
    if (isId(addr?.zoneId)) return String(addr.zoneId);
  }
  return null;
}

module.exports = { describeCustomerZone, cleanLocation, resolveOrderZoneId };
