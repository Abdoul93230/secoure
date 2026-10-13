/**
 * Migration des anciennes politiques de livraison (ShippingPolicy) vers le moteur v3.
 *
 * Pour chaque boutique ayant des politiques par zone :
 *   → un modèle personnalisé « Personnalisé — <boutique> », copie de « Standard Niger »,
 *     où chaque ancienne zone devient une règle de destination à PRIX FIXE (fixedCost conservé) ;
 *   → la boutique est affectée à ce modèle.
 * Le coût au kilo suit désormais les classes de taille du modèle (150 / 200 / 500 F).
 * Les anciennes données ShippingPolicy ne sont NI modifiées NI supprimées.
 *
 * Usage :
 *   node scripts/migrateShippingV3.js            → simulation (aucune écriture)
 *   node scripts/migrateShippingV3.js --apply    → applique la migration (idempotent)
 */
require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

(async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error('MONGODB_URI manquant');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log(`Base : ${db.databaseName} — mode ${APPLY ? 'APPLICATION' : 'SIMULATION (aucune écriture)'}\n`);

  const ShippingTemplate = require('../src/models/ShippingTemplate');
  const { ensureDefaultTemplate } = require('../src/services/shipping/quoteService');
  const { buildStandardTemplate } = require('../src/services/shipping/defaults');

  const standard = APPLY ? (await ensureDefaultTemplate()).toObject() : buildStandardTemplate({});
  const policies = await db.collection('shippingpolicies').find({ 'zonePolicies.0': { $exists: true } }).toArray();
  console.log(`${policies.length} boutique(s) avec une ancienne politique\n`);

  let created = 0;
  for (const pol of policies) {
    const seller = await db.collection('sellerrequests').findOne({ _id: pol.sellerId }, { projection: { storeName: 1, name: 1, shippingTemplateId: 1 } });
    const storeName = seller?.storeName || seller?.name || String(pol.sellerId);
    const active = (pol.zonePolicies || []).filter((z) => z.isActive !== false && !z.isDefault);
    const ignoredDefault = (pol.zonePolicies || []).find((z) => z.isDefault);

    console.log(`• ${storeName}`);
    for (const z of active) {
      const zone = await db.collection('zonefs').findOne({ _id: z.zoneId }, { projection: { fullPath: 1 } });
      console.log(`    zone ${zone?.fullPath || z.zoneId} : ${z.fixedCost} F fixe (ancien ${z.costPerKg} F/kg → classes 150/200/500 F/kg)`);
    }
    if (ignoredDefault) console.log(`    ancienne politique « par défaut » (${ignoredDefault.fixedCost} F + ${ignoredDefault.costPerKg} F/kg) → remplacée par la grille Standard Niger`);
    if (!seller) { console.log('    ⚠️ boutique introuvable : ignorée'); continue; }
    if (seller.shippingTemplateId) { console.log('    déjà migrée : ignorée'); continue; }
    if (!active.length) { console.log('    aucune zone spécifique : la boutique utilisera Standard Niger'); continue; }

    if (APPLY) {
      const { _id, code, createdAt, updatedAt, isDefault, ...base } = standard;
      const t = await ShippingTemplate.create({
        ...base,
        name: `Personnalisé — ${storeName}`.slice(0, 80),
        description: 'Migré depuis l’ancienne configuration par zone.',
        kind: 'custom',
        ownerSellerId: pol.sellerId,
        basedOnTemplateId: _id || null,
        isDefault: false,
        destinationRules: active.map((z) => ({ zoneId: z.zoneId, mode: 'fixed', amount: z.fixedCost, note: 'Migré' })),
        updatedBy: 'migration-v3',
      });
      await db.collection('sellerrequests').updateOne({ _id: pol.sellerId }, { $set: { shippingTemplateId: t._id } });
      created += 1;
      console.log(`    ✔ modèle créé : ${t.name}`);
    }
  }
  console.log(`\n${APPLY ? `${created} modèle(s) créé(s).` : 'Simulation terminée — relancez avec --apply pour appliquer.'}`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error('ÉCHEC :', e.message);
  process.exit(1);
});
