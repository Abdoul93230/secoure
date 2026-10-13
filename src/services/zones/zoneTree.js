/**
 * Outils de l'arbre des zones (collection zonefs) : chemins, références, fusion.
 * Le champ `parent` est la seule source de vérité ; level / fullPath / ancestors en sont déduits.
 */
const mongoose = require('mongoose');

const TYPE_LEVEL = Object.freeze({ country: 0, region: 1, city: 2, district: 3 });
const CHILD_TYPE = Object.freeze({ country: 'region', region: 'city', city: 'district', district: null });
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const str = (v) => (v ? String(v) : null);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '');

const zonesCol = () => mongoose.connection.db.collection('zonefs');

/** Recalcule level / fullPath / ancestors de toutes les zones ; n'écrit que les différences */
async function rebuildPaths() {
  const zones = await zonesCol().find({}, { projection: { name: 1, parent: 1, level: 1, fullPath: 1, ancestors: 1 } }).toArray();
  const byId = new Map(zones.map((z) => [String(z._id), z]));
  const ops = [];
  for (const z of zones) {
    const chain = [];
    const seen = new Set();
    let cur = z;
    while (cur && !seen.has(String(cur._id))) {
      seen.add(String(cur._id));
      chain.unshift(cur);
      cur = cur.parent ? byId.get(String(cur.parent)) : null;
    }
    const fullPath = chain.map((c) => c.name).join(' > ');
    const ancestors = chain.slice(0, -1).map((c) => String(c._id));
    const level = Math.min(3, chain.length - 1);
    if (z.fullPath !== fullPath || z.level !== level || (z.ancestors || []).map(String).join() !== ancestors.join()) {
      ops.push({ updateOne: { filter: { _id: z._id }, update: { $set: { fullPath, level, ancestors: ancestors.map(oid) } } } });
    }
  }
  if (ops.length) await zonesCol().bulkWrite(ops, { ordered: false });
  return ops.length;
}

/** Code unique (champ requis du modèle) : PARENT-NOM, 20 caractères max */
async function uniqueCode(parentCode, name) {
  const base = `${parentCode ? `${parentCode}-` : ''}${slug(name).slice(0, 8) || 'ZONE'}`.slice(0, 20);
  let code = base;
  for (let i = 1; await zonesCol().findOne({ code }, { projection: { _id: 1 } }); i += 1) {
    code = `${base.slice(0, 20 - String(i).length - 1)}-${i}`;
  }
  return code;
}

/** Où chaque zone est utilisée : boutiques, modèles, campagnes, anciennes politiques */
async function zoneReferences() {
  const db = mongoose.connection.db;
  const refs = new Map();
  const add = (id, label) => {
    if (!id) return;
    const k = String(id);
    if (!refs.has(k)) refs.set(k, []);
    refs.get(k).push(label);
  };
  const [sellers, templates, campaigns, policies] = await Promise.all([
    db.collection('sellerrequests').find({ shippingOriginZoneId: { $ne: null } }, { projection: { storeName: 1, shippingOriginZoneId: 1 } }).toArray(),
    db.collection('shippingtemplates').find({}, { projection: { name: 1, areaRates: 1, regionRoutes: 1, destinationRules: 1 } }).toArray(),
    db.collection('shippingcampaigns').find({}, { projection: { name: 1, destinationZoneIds: 1 } }).toArray(),
    db.collection('shippingpolicies').find({}, { projection: { 'zonePolicies.zoneId': 1 } }).toArray(),
  ]);
  for (const s of sellers) add(s.shippingOriginZoneId, `Boutique « ${s.storeName} » (lieu d’expédition)`);
  for (const t of templates) {
    for (const a of t.areaRates || []) add(a.zoneId, `Modèle « ${t.name} » (tarif local)`);
    for (const r of t.regionRoutes || []) { add(r.fromZoneId, `Modèle « ${t.name} » (trajet)`); add(r.toZoneId, `Modèle « ${t.name} » (trajet)`); }
    for (const r of t.destinationRules || []) add(r.zoneId, `Modèle « ${t.name} » (règle de destination)`);
  }
  for (const c of campaigns) for (const id of c.destinationZoneIds || []) add(id, `Campagne « ${c.name} »`);
  for (const p of policies) for (const zp of p.zonePolicies || []) add(zp.zoneId, 'Ancienne politique de livraison');
  return refs;
}

/**
 * Fusionne `sourceId` dans `targetId` (même type) :
 * références redirigées, sous-zones rattachées à la cible, nom de la source ajouté aux synonymes,
 * source désactivée (jamais supprimée : historique des commandes).
 */
async function mergeZones(sourceId, targetId) {
  const db = mongoose.connection.db;
  const [src, dst] = await Promise.all([zonesCol().findOne({ _id: oid(sourceId) }), zonesCol().findOne({ _id: oid(targetId) })]);
  if (!src || !dst) throw Object.assign(new Error('Zone introuvable.'), { status: 404 });
  if (String(src._id) === String(dst._id)) throw Object.assign(new Error('Choisissez une autre zone.'), { status: 400 });
  if (src.type !== dst.type) throw Object.assign(new Error('Les deux zones doivent être du même type.'), { status: 400 });
  if ((dst.ancestors || []).map(String).includes(String(src._id))) throw Object.assign(new Error('La cible est une sous-zone de la source.'), { status: 400 });

  const S = src._id;
  const T = dst._id;
  const res = {};
  res.sellers = (await db.collection('sellerrequests').updateMany({ shippingOriginZoneId: S }, { $set: { shippingOriginZoneId: T } })).modifiedCount;
  let templates = 0;
  for (const path of ['areaRates.$[x].zoneId', 'regionRoutes.$[x].fromZoneId', 'regionRoutes.$[x].toZoneId', 'destinationRules.$[x].zoneId']) {
    const [list, field] = path.split('.$[x].');
    templates += (await db.collection('shippingtemplates').updateMany({ [`${list}.${field}`]: S }, { $set: { [path]: T } }, { arrayFilters: [{ [`x.${field}`]: S }] })).modifiedCount;
  }
  res.templates = templates;
  await db.collection('shippingcampaigns').updateMany({ destinationZoneIds: S }, { $addToSet: { destinationZoneIds: T } });
  res.campaigns = (await db.collection('shippingcampaigns').updateMany({ destinationZoneIds: S }, { $pull: { destinationZoneIds: S } })).modifiedCount;
  res.children = (await zonesCol().updateMany({ parent: S }, { $set: { parent: T } })).modifiedCount;

  const aliases = [...new Set([...(dst.aliases || []), src.name, ...(src.aliases || [])])].filter((a) => norm(a) !== norm(dst.name));
  await zonesCol().updateOne({ _id: T }, { $set: { aliases, updatedAt: new Date() } });
  await zonesCol().updateOne({ _id: S }, { $set: { isActive: false, mergedInto: T, updatedAt: new Date() } });
  await rebuildPaths();
  return res;
}

module.exports = { TYPE_LEVEL, CHILD_TYPE, norm, oid, str, zonesCol, rebuildPaths, uniqueCode, zoneReferences, mergeZones };
