/**
 * Synchronise les zones avec le référentiel du Niger (src/services/zones/nigerReferential.js).
 *
 *  - Réutilise les zones existantes de même type et de même nom (ou synonyme) dans la même région :
 *    leur identifiant est conservé → aucune référence cassée (boutiques, modèles, campagnes, commandes).
 *    Elles peuvent être renommées (graphie officielle) ou déplacées dans la bonne commune.
 *  - Crée les zones manquantes.
 *  - DÉSACTIVE (sans supprimer) les zones du Niger absentes du référentiel (données de démonstration :
 *    « Centre-ville », « Marché central »…) et, sauf --keep-foreign, les sous-zones des pays étrangers
 *    (la livraison internationale n'est pas ouverte ; les pays restent sélectionnables).
 *  - Recalcule level / fullPath / ancestors de toutes les zones.
 *
 * Usage :
 *   node scripts/syncNigerZones.js                  → simulation (aucune écriture)
 *   node scripts/syncNigerZones.js --apply          → applique
 *   node scripts/syncNigerZones.js --apply --keep-foreign
 * Idempotent : une seconde exécution ne change rien.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { nigerTree } = require('../src/services/zones/nigerReferential');

const APPLY = process.argv.includes('--apply');
const KEEP_FOREIGN = process.argv.includes('--keep-foreign');
const TYPE_LEVEL = { country: 0, region: 1, city: 2, district: 3 };
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
const sid = (v) => (v ? String(v) : null);

/**
 * Calcule le plan de synchronisation à partir des zones existantes (fonction pure, testable).
 * @returns {{ zones: Map, created: [], updated: [], deactivated: [], reactivated: [] }}
 */
function planSync(existing, tree, { keepForeign = false, newId = () => new mongoose.Types.ObjectId() } = {}) {
  const zones = new Map(existing.map((z) => [String(z._id), { ...z, _id: z._id, parent: sid(z.parent) }]));
  const before = new Map(existing.map((z) => [String(z._id), { name: z.name, parent: sid(z.parent), isActive: z.isActive !== false, fullPath: z.fullPath }]));
  const used = new Set();
  const codes = new Set(existing.map((z) => z.code));
  const created = [];

  const regionOf = (id) => {
    let cur = zones.get(id);
    const seen = new Set();
    while (cur && !seen.has(String(cur._id))) {
      seen.add(String(cur._id));
      if (cur.type === 'region') return String(cur._id);
      cur = cur.parent ? zones.get(cur.parent) : null;
    }
    return null;
  };

  const code = (parentCode, name) => {
    const base = `${parentCode ? `${parentCode}-` : ''}${slug(name).slice(0, 8)}`.slice(0, 20);
    let out = base;
    for (let i = 1; codes.has(out); i += 1) out = `${base.slice(0, 20 - String(i).length - 1)}-${i}`;
    codes.add(out);
    return out;
  };

  const find = (node, parentId, regionId) => {
    const keys = new Set([node.name, ...(node.aliases || [])].map(norm));
    const pool = [...zones.values()].filter((z) => z.type === node.type && !used.has(String(z._id)) && keys.has(norm(z.name)));
    const scope = (z) => {
      if (node.type === 'country') return true;
      if (node.type === 'region') return z.parent === parentId;
      return regionOf(String(z._id)) === regionId;
    };
    const candidates = pool.filter(scope);
    // Même parent d'abord, puis zone active
    candidates.sort((a, b) => (b.parent === parentId) - (a.parent === parentId) || (b.isActive !== false) - (a.isActive !== false));
    return candidates[0] || null;
  };

  const walk = (node, parentId, regionId) => {
    let z = find(node, parentId, regionId);
    const parentCode = parentId ? zones.get(parentId)?.code : null;
    if (z) {
      used.add(String(z._id));
      const aliases = [...new Set([...(z.aliases || []), ...(node.aliases || [])].filter((a) => norm(a) !== norm(node.name)))];
      // L'ancien nom devient un synonyme s'il est différent de la graphie officielle
      if (norm(z.name) !== norm(node.name) && !aliases.some((a) => norm(a) === norm(z.name))) aliases.push(z.name);
      Object.assign(z, { name: node.name, parent: parentId, isActive: true, aliases, center: z.center?.lat != null ? z.center : node.center || undefined });
    } else {
      z = { _id: newId(), name: node.name, type: node.type, parent: parentId, isActive: true, aliases: node.aliases || [], center: node.center || undefined, code: code(parentCode, node.name), __new: true };
      zones.set(String(z._id), z);
      used.add(String(z._id));
      created.push(z);
    }
    const id = String(z._id);
    const nextRegion = node.type === 'region' ? id : regionId;
    for (const child of node.children || []) walk(child, id, nextRegion);
    return id;
  };
  const nigerId = walk(tree, null, null);

  // Chemins finaux
  const pathOf = (id) => {
    const chain = [];
    const seen = new Set();
    let cur = zones.get(id);
    while (cur && !seen.has(String(cur._id))) {
      seen.add(String(cur._id));
      chain.unshift(cur);
      cur = cur.parent ? zones.get(cur.parent) : null;
    }
    return chain;
  };

  // Désactivations
  const deactivated = [];
  for (const z of zones.values()) {
    if (used.has(String(z._id)) || z.isActive === false) continue;
    const chain = pathOf(String(z._id));
    const inNiger = String(chain[0]?._id) === nigerId;
    const foreignSub = !inNiger && z.type !== 'country';
    if (inNiger || (foreignSub && !keepForeign)) {
      z.isActive = false;
      deactivated.push(z);
    }
  }

  for (const z of zones.values()) {
    const chain = pathOf(String(z._id));
    z.fullPath = chain.map((x) => x.name).join(' > ');
    z.ancestors = chain.slice(0, -1).map((x) => String(x._id));
    z.level = Math.min(3, chain.length - 1);
  }

  const updated = [];
  const reactivated = [];
  for (const z of zones.values()) {
    if (z.__new) continue;
    const b = before.get(String(z._id));
    if (b.name !== z.name || b.parent !== z.parent || b.fullPath !== z.fullPath) updated.push({ z, before: b });
    if (!b.isActive && z.isActive) reactivated.push(z);
  }
  return { zones, created, updated, deactivated, reactivated, nigerId };
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error('MONGODB_URI manquant');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log(`Base : ${db.databaseName} — mode ${APPLY ? 'APPLICATION' : 'SIMULATION (aucune écriture)'}\n`);

  const existing = await db.collection('zonefs').find({}).toArray();
  const plan = planSync(existing, nigerTree(), { keepForeign: KEEP_FOREIGN });

  // Références vers les zones désactivées (à revoir dans l'admin)
  const refs = new Map();
  const addRef = (id, what) => id && refs.set(String(id), (refs.get(String(id)) || []).concat(what));
  for (const s of await db.collection('sellerrequests').find({ shippingOriginZoneId: { $ne: null } }, { projection: { storeName: 1, shippingOriginZoneId: 1 } }).toArray()) addRef(s.shippingOriginZoneId, `boutique « ${s.storeName} »`);
  for (const t of await db.collection('shippingtemplates').find({}).toArray()) {
    for (const a of t.areaRates || []) addRef(a.zoneId, `modèle « ${t.name} »`);
    for (const r of t.regionRoutes || []) { addRef(r.fromZoneId, `modèle « ${t.name} »`); addRef(r.toZoneId, `modèle « ${t.name} »`); }
    for (const r of t.destinationRules || []) addRef(r.zoneId, `modèle « ${t.name} »`);
  }
  for (const c of await db.collection('shippingcampaigns').find({}).toArray()) for (const id of c.destinationZoneIds || []) addRef(id, `campagne « ${c.name} »`);

  const count = (type) => [...plan.zones.values()].filter((z) => z.isActive !== false && z.type === type && z.fullPath.startsWith('Niger')).length;
  console.log(`Après synchronisation — Niger : ${count('region')} régions, ${count('city')} villes/communes, ${count('district')} quartiers actifs\n`);

  console.log(`== Zones créées : ${plan.created.length} ==`);
  for (const z of plan.created) console.log(`  + ${z.fullPath}`);
  console.log(`\n== Zones conservées mais renommées / déplacées : ${plan.updated.length} ==`);
  for (const { z, before } of plan.updated) console.log(`  ~ ${before.fullPath}  →  ${z.fullPath}`);
  console.log(`\n== Zones réactivées : ${plan.reactivated.length} ==`);
  for (const z of plan.reactivated) console.log(`  ↺ ${z.fullPath}`);
  console.log(`\n== Zones désactivées (non supprimées) : ${plan.deactivated.length} ==`);
  for (const z of plan.deactivated) console.log(`  - ${z.fullPath}${refs.get(String(z._id)) ? `   ⚠ utilisée par : ${refs.get(String(z._id)).join(', ')}` : ''}`);
  const risky = plan.deactivated.filter((z) => refs.get(String(z._id)));
  if (risky.length) console.log(`\n⚠ ${risky.length} zone(s) désactivée(s) encore utilisée(s) : à réaffecter dans l'admin (Centre de livraison).`);

  if (APPLY) {
    const ops = [];
    for (const z of plan.zones.values()) {
      const doc = {
        name: z.name, parent: z.parent ? new mongoose.Types.ObjectId(z.parent) : null, isActive: z.isActive !== false,
        fullPath: z.fullPath, level: z.level, ancestors: z.ancestors.map((a) => new mongoose.Types.ObjectId(a)), aliases: z.aliases || [],
        ...(z.center?.lat != null ? { center: { lat: z.center.lat, lng: z.center.lng } } : {}),
      };
      if (z.__new) {
        ops.push({ insertOne: { document: { _id: z._id, code: z.code, type: z.type, ...doc, createdAt: new Date(), updatedAt: new Date() } } });
      } else {
        ops.push({ updateOne: { filter: { _id: z._id }, update: { $set: { ...doc, updatedAt: new Date() } } } });
      }
    }
    const r = await db.collection('zonefs').bulkWrite(ops, { ordered: true });
    console.log(`\n✔ Appliqué : ${r.insertedCount} créée(s), ${r.modifiedCount} mise(s) à jour. Les caches du serveur se rafraîchissent en moins de 5 minutes.`);
  } else {
    console.log('\nSimulation terminée — relancez avec --apply pour appliquer.');
  }
  await mongoose.disconnect();
}

if (require.main === module) main().catch((e) => { console.error('ERREUR', e.message); process.exit(1); });

module.exports = { planSync };
