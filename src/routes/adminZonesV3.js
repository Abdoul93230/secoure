/**
 * Gestion des zones (admin) — /api/admin/shipping-v3/zones (requireAdmin hérité du routeur parent)
 *   GET    /                liste complète (actives + inactives) avec sous-zones et références
 *   POST   /                créer une zone (type déduit du parent)
 *   PUT    /:id             renommer, synonymes, point GPS, déplacer
 *   POST   /:id/status      activer / désactiver (désactivation en cascade)
 *   POST   /:id/merge       fusionner dans une autre zone du même type
 */
const express = require('express');
const { invalidateShippingCaches } = require('../services/shipping/quoteService');
const { CHILD_TYPE, norm, oid, zonesCol, rebuildPaths, uniqueCode, zoneReferences, mergeZones } = require('../services/zones/zoneTree');

const router = express.Router();
const isId = (v) => /^[a-f\d]{24}$/i.test(String(v || ''));
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e.status) return fail(res, e.status, e.message);
    console.error('[admin/zones-v3]', e);
    return fail(res, 500, 'Erreur serveur.');
  }
};

/** Nom, synonymes et point GPS validés */
function cleanFields(body = {}) {
  const out = {};
  if (body.name !== undefined) {
    const name = String(body.name || '').replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 100) throw Object.assign(new Error('Le nom doit faire entre 2 et 100 caractères.'), { status: 400 });
    out.name = name;
  }
  if (body.aliases !== undefined) {
    const list = (Array.isArray(body.aliases) ? body.aliases : String(body.aliases).split(','))
      .map((a) => String(a || '').replace(/\s+/g, ' ').trim()).filter((a) => a.length >= 2 && a.length <= 100);
    out.aliases = [...new Map(list.map((a) => [norm(a), a])).values()].slice(0, 20);
  }
  if (body.center !== undefined) {
    if (body.center === null || body.center.lat === '' || body.center.lat == null) {
      out.center = null;
    } else {
      const lat = Number(body.center.lat);
      const lng = Number(body.center.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        throw Object.assign(new Error('Coordonnées GPS invalides.'), { status: 400 });
      }
      out.center = { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
    }
  }
  return out;
}

/** Refuse deux zones actives de même nom (ou synonyme) sous le même parent */
async function assertUniqueAmongSiblings(parentId, name, exceptId) {
  const siblings = await zonesCol().find({ parent: parentId ? oid(parentId) : null, isActive: { $ne: false } }, { projection: { name: 1, aliases: 1 } }).toArray();
  const n = norm(name);
  const clash = siblings.find((s) => String(s._id) !== String(exceptId) && [s.name, ...(s.aliases || [])].some((x) => norm(x) === n));
  if (clash) throw Object.assign(new Error(`« ${clash.name} » existe déjà à cet endroit.`), { status: 409 });
}

const done = async (res, data, { paths = false } = {}) => {
  if (paths) await rebuildPaths();
  invalidateShippingCaches();
  return res.json({ success: true, data });
};

router.get('/', wrap(async (_req, res) => {
  const [zones, refs] = await Promise.all([
    zonesCol().find({}, { projection: { name: 1, code: 1, type: 1, parent: 1, level: 1, fullPath: 1, isActive: 1, aliases: 1, center: 1, mergedInto: 1 } }).sort({ fullPath: 1 }).toArray(),
    zoneReferences(),
  ]);
  const children = new Map();
  for (const z of zones) {
    if (!z.parent) continue;
    const k = String(z.parent);
    const c = children.get(k) || { total: 0, active: 0 };
    c.total += 1;
    if (z.isActive !== false) c.active += 1;
    children.set(k, c);
  }
  res.json({
    success: true,
    data: zones.map((z) => ({
      ...z,
      isActive: z.isActive !== false,
      children: children.get(String(z._id)) || { total: 0, active: 0 },
      refs: refs.get(String(z._id)) || [],
    })),
  });
}));

router.post('/', wrap(async (req, res) => {
  const fields = cleanFields(req.body);
  if (!fields.name) return fail(res, 400, 'Le nom est requis.');
  let parent = null;
  if (req.body.parent) {
    if (!isId(req.body.parent)) return fail(res, 400, 'Zone parente invalide.');
    parent = await zonesCol().findOne({ _id: oid(req.body.parent) });
    if (!parent) return fail(res, 404, 'Zone parente introuvable.');
    if (parent.isActive === false) return fail(res, 400, 'Réactivez d’abord la zone parente.');
  }
  const type = parent ? CHILD_TYPE[parent.type] : 'country';
  if (!type) return fail(res, 400, 'Un quartier ne peut pas contenir de sous-zone.');
  await assertUniqueAmongSiblings(parent?._id, fields.name);
  const now = new Date();
  const doc = {
    name: fields.name,
    code: await uniqueCode(parent?.code, fields.name),
    type,
    parent: parent ? parent._id : null,
    isActive: true,
    aliases: fields.aliases || [],
    ...(fields.center ? { center: fields.center } : {}),
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await zonesCol().insertOne(doc);
  return done(res, { _id: insertedId, ...doc }, { paths: true });
}));

router.put('/:id', wrap(async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 400, 'Identifiant invalide.');
  const z = await zonesCol().findOne({ _id: oid(req.params.id) });
  if (!z) return fail(res, 404, 'Zone introuvable.');
  const fields = cleanFields(req.body);
  const set = { updatedAt: new Date() };
  const unset = {};
  if (fields.name) set.name = fields.name;
  if (fields.aliases) set.aliases = fields.aliases.filter((a) => norm(a) !== norm(fields.name || z.name));
  if (fields.center === null) unset.center = '';
  else if (fields.center) set.center = fields.center;

  let parentId = z.parent;
  if (req.body.parent !== undefined && String(req.body.parent || '') !== String(z.parent || '')) {
    if (!isId(req.body.parent)) return fail(res, 400, 'Choisissez la nouvelle zone parente.');
    const p = await zonesCol().findOne({ _id: oid(req.body.parent) });
    if (!p) return fail(res, 404, 'Zone parente introuvable.');
    if (CHILD_TYPE[p.type] !== z.type) return fail(res, 400, `Un(e) ${z.type === 'district' ? 'quartier' : z.type === 'city' ? 'ville' : 'région'} doit être rattaché(e) à un(e) ${z.type === 'district' ? 'ville / commune' : z.type === 'city' ? 'région' : 'pays'}.`);
    if (String(p._id) === String(z._id) || (p.ancestors || []).map(String).includes(String(z._id))) return fail(res, 400, 'Une zone ne peut pas être déplacée dans sa propre sous-zone.');
    if (p.isActive === false && z.isActive !== false) return fail(res, 400, 'La nouvelle zone parente est désactivée.');
    parentId = p._id;
    set.parent = p._id;
  }
  if (z.isActive !== false && (set.name || set.parent)) await assertUniqueAmongSiblings(parentId, set.name || z.name, z._id);

  await zonesCol().updateOne({ _id: z._id }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) });
  return done(res, { updated: true }, { paths: Boolean(set.name || set.parent) });
}));

router.post('/:id/status', wrap(async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 400, 'Identifiant invalide.');
  const z = await zonesCol().findOne({ _id: oid(req.params.id) });
  if (!z) return fail(res, 404, 'Zone introuvable.');
  const active = req.body?.isActive === true;

  if (!active) {
    const subtree = await zonesCol().find({ $or: [{ _id: z._id }, { ancestors: z._id }], isActive: { $ne: false } }, { projection: { _id: 1, name: 1 } }).toArray();
    const refs = await zoneReferences();
    const used = subtree.flatMap((s) => (refs.get(String(s._id)) || []).map((r) => `${s.name} : ${r}`));
    if (used.length && req.body?.force !== true) {
      return fail(res, 409, 'Cette zone (ou une sous-zone) est encore utilisée.', { refs: used });
    }
    const r = await zonesCol().updateMany({ _id: { $in: subtree.map((s) => s._id) } }, { $set: { isActive: false, updatedAt: new Date() } });
    return done(res, { deactivated: r.modifiedCount });
  }

  if (z.parent) {
    const p = await zonesCol().findOne({ _id: z.parent }, { projection: { isActive: 1, name: 1 } });
    if (p && p.isActive === false) return fail(res, 400, `Réactivez d’abord « ${p.name} ».`);
  }
  await assertUniqueAmongSiblings(z.parent, z.name, z._id);
  const ids = [z._id];
  if (req.body?.includeChildren) {
    const sub = await zonesCol().find({ ancestors: z._id, mergedInto: { $exists: false } }, { projection: { _id: 1 } }).toArray();
    ids.push(...sub.map((s) => s._id));
  }
  const r = await zonesCol().updateMany({ _id: { $in: ids } }, { $set: { isActive: true, updatedAt: new Date() }, $unset: { mergedInto: '' } });
  return done(res, { activated: r.modifiedCount });
}));

router.post('/:id/merge', wrap(async (req, res) => {
  if (!isId(req.params.id) || !isId(req.body?.targetId)) return fail(res, 400, 'Choisissez la zone cible.');
  const result = await mergeZones(req.params.id, req.body.targetId);
  return done(res, result);
}));

module.exports = router;
