/**
 * Localités demandées par les clients mais absentes de la liste des zones.
 * Une entrée par (nom normalisé, zone la plus proche) : le compteur augmente à chaque demande.
 * L'admin les ajoute en un clic (onglet Zones) ou les ignore.
 */
const mongoose = require('mongoose');
const { norm } = require('./zoneTree');

const col = () => mongoose.connection.db.collection('zonerequests');
const isId = (v) => /^[a-f\d]{24}$/i.test(String(v || ''));
const oid = (v) => new mongoose.Types.ObjectId(String(v));

async function recordZoneRequest({ name, nearZoneId, source = 'client' }) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (clean.length < 2 || !isId(nearZoneId)) return null;
  const zones = mongoose.connection.db.collection('zonefs');
  const near = await zones.findOne({ _id: oid(nearZoneId), isActive: { $ne: false } }, { projection: { name: 1, fullPath: 1, ancestors: 1 } });
  if (!near) return null;

  // Déjà présente (nom ou autre nom) dans la même région : rien à demander
  const regionId = (near.ancestors || [])[1] || near._id;
  const n = norm(clean);
  const inRegion = await zones.find(
    { isActive: { $ne: false }, $or: [{ ancestors: regionId }, { _id: regionId }] },
    { projection: { name: 1, aliases: 1 } },
  ).toArray();
  const exists = inRegion.find((z) => [z.name, ...(z.aliases || [])].some((x) => norm(x) === n));
  if (exists) return { existing: String(exists._id) };

  const now = new Date();
  await col().updateOne(
    { norm: n, nearZoneId: near._id },
    {
      $set: { nearPath: near.fullPath, lastAt: now },
      $inc: { count: 1 },
      // Première orthographe conservée (souvent la plus soignée)
      $setOnInsert: { name: clean, status: 'pending', createdAt: now, source },
    },
    { upsert: true },
  );
  return { recorded: true };
}

async function listZoneRequests({ status } = {}) {
  const filter = status ? { status } : {};
  return col().find(filter).sort({ status: 1, count: -1, lastAt: -1 }).limit(500).toArray();
}

async function setZoneRequestStatus(id, status, zoneId = null) {
  if (!isId(id) || !['pending', 'added', 'ignored'].includes(status)) return false;
  const r = await col().updateOne({ _id: oid(id) }, { $set: { status, ...(zoneId ? { zoneId: oid(zoneId) } : {}), updatedAt: new Date() } });
  return r.matchedCount > 0;
}

async function getZoneRequest(id) {
  return isId(id) ? col().findOne({ _id: oid(id) }) : null;
}

module.exports = { recordZoneRequest, listZoneRequests, setZoneRequestStatus, getZoneRequest };
