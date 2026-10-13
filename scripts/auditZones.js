/**
 * Audit des zones de livraison (collection zonefs).
 *
 * Par défaut : LECTURE SEULE. Affiche un rapport complet :
 *   - répartition par type et par niveau, zones inactives ;
 *   - arbre cassé : parent introuvable, hiérarchie incohérente (ex. quartier sous un pays),
 *     cycles, « level » / « fullPath » / « ancestors » faux ;
 *   - doublons probables (même nom normalisé sous le même parent) ;
 *   - références vers chaque zone (boutiques, modèles, campagnes, anciennes politiques).
 *
 * Option --fix-tree : recalcule level, fullPath et ancestors À PARTIR DU CHAMP parent
 * (seule source fiable). Ne supprime, ne fusionne et ne renomme AUCUNE zone.
 *
 * Usage :
 *   node scripts/auditZones.js              → rapport (aucune écriture)
 *   node scripts/auditZones.js --json       → rapport + export JSON complet de l'arbre (stdout)
 *   node scripts/auditZones.js --fix-tree   → répare level / fullPath / ancestors
 */
require('dotenv').config();
const mongoose = require('mongoose');

const FIX = process.argv.includes('--fix-tree');
const JSON_OUT = process.argv.includes('--json');
const TYPE_LEVEL = { country: 0, region: 1, city: 2, district: 3 };
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const str = (v) => (v ? String(v) : null);

(async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error('MONGODB_URI manquant');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log(`Base : ${db.databaseName} — mode ${FIX ? 'RÉPARATION DE L’ARBRE' : 'AUDIT (aucune écriture)'}\n`);

  const zones = await db.collection('zonefs').find({}).toArray();
  const byId = new Map(zones.map((z) => [String(z._id), z]));
  const children = new Map();
  for (const z of zones) {
    const p = str(z.parent);
    if (!children.has(p)) children.set(p, []);
    children.get(p).push(z);
  }

  // ── Chemin réel reconstruit depuis parent ──
  const issues = { orphans: [], cycles: [], badHierarchy: [], badLevel: [], badPath: [], badAncestors: [] };
  const computed = new Map();
  for (const z of zones) {
    const chain = [];
    const seen = new Set();
    let cur = z;
    let broken = null;
    while (cur) {
      const id = String(cur._id);
      if (seen.has(id)) { broken = 'cycle'; break; }
      seen.add(id);
      chain.unshift(cur);
      if (!cur.parent) break;
      const parent = byId.get(String(cur.parent));
      if (!parent) { broken = 'orphan'; break; }
      cur = parent;
    }
    if (broken === 'cycle') { issues.cycles.push(z); continue; }
    if (broken === 'orphan') issues.orphans.push(z);
    const fullPath = chain.map((c) => c.name).join(' > ');
    const ancestors = chain.slice(0, -1).map((c) => String(c._id));
    const level = chain.length - 1;
    computed.set(String(z._id), { fullPath, ancestors, level });

    const parent = z.parent ? byId.get(String(z.parent)) : null;
    if (parent && TYPE_LEVEL[parent.type] >= TYPE_LEVEL[z.type]) issues.badHierarchy.push({ z, parent });
    if (!parent && z.type !== 'country') issues.badHierarchy.push({ z, parent: null });
    if (z.level !== level) issues.badLevel.push({ z, expected: level });
    if (z.fullPath !== fullPath) issues.badPath.push({ z, expected: fullPath });
    const cur2 = (z.ancestors || []).map(String);
    if (cur2.join() !== ancestors.join()) issues.badAncestors.push({ z, expected: ancestors });
  }

  // ── Doublons probables ──
  const dupGroups = [];
  for (const [, list] of children) {
    const g = new Map();
    for (const z of list) {
      const k = norm(z.name);
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(z);
    }
    for (const [, same] of g) if (same.length > 1) dupGroups.push(same);
  }
  // Même nom à des endroits différents (souvent normal, ex. « Centre-ville », à vérifier)
  const byName = new Map();
  for (const z of zones) {
    const k = `${z.type}|${norm(z.name)}`;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(z);
  }
  const homonyms = [...byName.values()].filter((l) => l.length > 1 && new Set(l.map((x) => str(x.parent))).size > 1);

  // ── Références ──
  const refs = new Map();
  const addRef = (id, what) => {
    if (!id) return;
    const k = String(id);
    refs.set(k, (refs.get(k) || []).concat(what));
  };
  const has = async (name) => (await db.listCollections({ name }).toArray()).length > 0;
  if (await has('sellerrequests')) {
    for (const s of await db.collection('sellerrequests').find({ shippingOriginZoneId: { $ne: null } }, { projection: { storeName: 1, shippingOriginZoneId: 1 } }).toArray()) addRef(s.shippingOriginZoneId, `boutique « ${s.storeName} »`);
  }
  if (await has('shippingtemplates')) {
    for (const t of await db.collection('shippingtemplates').find({}).toArray()) {
      for (const a of t.areaRates || []) addRef(a.zoneId, `modèle « ${t.name} » (tarif local)`);
      for (const r of t.regionRoutes || []) { addRef(r.fromZoneId, `modèle « ${t.name} » (trajet)`); addRef(r.toZoneId, `modèle « ${t.name} » (trajet)`); }
      for (const r of t.destinationRules || []) addRef(r.zoneId, `modèle « ${t.name} » (règle)`);
    }
  }
  if (await has('shippingcampaigns')) {
    for (const c of await db.collection('shippingcampaigns').find({}).toArray()) for (const id of c.destinationZoneIds || []) addRef(id, `campagne « ${c.name} »`);
  }
  if (await has('shippingpolicies')) {
    for (const p of await db.collection('shippingpolicies').find({}).toArray()) for (const zp of p.zonePolicies || []) addRef(zp.zoneId, 'ancienne politique');
  }

  // ── Rapport ──
  const line = (z) => `${z.fullPath || z.name}  [${z.type}${z.isActive === false ? ', inactive' : ''}]  ${z._id}`;
  const section = (title, list, fmt) => {
    console.log(`\n== ${title} : ${list.length} ==`);
    list.slice(0, 60).forEach((x) => console.log(`  - ${fmt(x)}`));
    if (list.length > 60) console.log(`  … +${list.length - 60}`);
  };

  console.log(`Zones : ${zones.length} (${zones.filter((z) => z.isActive === false).length} inactives)`);
  for (const t of Object.keys(TYPE_LEVEL)) console.log(`  ${t.padEnd(9)} ${zones.filter((z) => z.type === t).length}`);

  console.log('\n== Arbre actuel (reconstruit depuis parent) ==');
  const print = (parentId, depth) => {
    for (const z of (children.get(parentId) || []).sort((a, b) => a.name.localeCompare(b.name, 'fr'))) {
      const n = (children.get(String(z._id)) || []).length;
      const r = refs.get(String(z._id))?.length || 0;
      console.log(`${'  '.repeat(depth)}${z.name} (${z.type}${n ? `, ${n} sous-zones` : ''}${r ? `, ${r} réf.` : ''}${z.isActive === false ? ', INACTIVE' : ''})`);
      if (depth < 3) print(String(z._id), depth + 1);
    }
  };
  print(null, 1);

  section('Parent introuvable (zones orphelines)', issues.orphans, line);
  section('Cycles dans l’arbre', issues.cycles, line);
  section('Hiérarchie incohérente (type du parent)', issues.badHierarchy, ({ z, parent }) => `${line(z)}  sous  ${parent ? `${parent.name} [${parent.type}]` : 'aucun parent'}`);
  section('Doublons probables (même nom, même parent)', dupGroups, (g) => g.map((z) => `${z.name} ${z._id}${refs.get(String(z._id)) ? ` (${refs.get(String(z._id)).length} réf.)` : ''}`).join('  |  '));
  section('Même nom à plusieurs endroits (à vérifier)', homonyms, (g) => g.map((z) => z.fullPath).join('  |  '));
  console.log(`\n== Champs calculés faux (réparables avec --fix-tree) ==`);
  console.log(`  level     : ${issues.badLevel.length}`);
  console.log(`  fullPath  : ${issues.badPath.length}`);
  console.log(`  ancestors : ${issues.badAncestors.length}`);
  issues.badPath.slice(0, 15).forEach(({ z, expected }) => console.log(`  - « ${z.fullPath} » → « ${expected} »`));

  if (JSON_OUT) {
    console.log('\n== EXPORT JSON ==');
    console.log(JSON.stringify(zones.map((z) => ({
      _id: z._id, name: z.name, type: z.type, parent: z.parent, isActive: z.isActive !== false,
      fullPath: computed.get(String(z._id))?.fullPath, refs: refs.get(String(z._id)) || [],
    }))));
  }

  if (FIX) {
    const ops = [];
    for (const z of zones) {
      const c = computed.get(String(z._id));
      if (!c) continue;
      const anc = c.ancestors.map((id) => new mongoose.Types.ObjectId(id));
      if (z.level !== c.level || z.fullPath !== c.fullPath || (z.ancestors || []).map(String).join() !== c.ancestors.join()) {
        ops.push({ updateOne: { filter: { _id: z._id }, update: { $set: { level: Math.min(3, c.level), fullPath: c.fullPath, ancestors: anc } } } });
      }
    }
    if (ops.length) await db.collection('zonefs').bulkWrite(ops, { ordered: false });
    console.log(`\n✔ ${ops.length} zone(s) réparée(s) (level / fullPath / ancestors). Aucune zone supprimée ni renommée.`);
  } else {
    console.log('\nAucune écriture effectuée.');
  }
  await mongoose.disconnect();
})().catch((e) => { console.error('ERREUR', e.message); process.exit(1); });
