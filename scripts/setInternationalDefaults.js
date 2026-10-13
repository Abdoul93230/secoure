/**
 * Ouvre la livraison internationale avec des valeurs par défaut sur le modèle par défaut (Standard Niger).
 *
 *  - Ligne « International » : desservie, 5 000 F de base, 3 à 7 jours
 *  - Prix fixe par pays (règles de destination), du plus proche au plus loin :
 *      Nigeria 4 000 F · Bénin 5 000 F · Burkina Faso 6 000 F · Mali 8 000 F
 *    (+ kilos supplémentaires selon la classe du produit, comme en national)
 *
 * Ne remplace jamais un réglage déjà fait dans l'admin : un pays qui a déjà une règle est ignoré,
 * et la ligne « International » n'est modifiée que si elle est encore fermée (sauf --force).
 * Les campagnes de livraison offerte ne s'appliquent à l'international que si elles le ciblent explicitement.
 *
 * Usage :
 *   node scripts/setInternationalDefaults.js          → simulation (aucune écriture)
 *   node scripts/setInternationalDefaults.js --apply  → applique
 */
require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

const INTERNATIONAL = { available: true, baseFee: 5000, delay: { sameDay: false, minDays: 3, maxDays: 7 } };
const COUNTRY_PRICES = [
  { name: 'Nigeria', amount: 4000 },
  { name: 'Bénin', amount: 5000 },
  { name: 'Burkina Faso', amount: 6000 },
  { name: 'Mali', amount: 8000 },
];

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

(async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error('MONGODB_URI manquant');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log(`Base : ${db.databaseName} — mode ${APPLY ? 'APPLICATION' : 'SIMULATION (aucune écriture)'}\n`);

  const template = await db.collection('shippingtemplates').findOne({ isDefault: true });
  if (!template) throw new Error('Aucun modèle par défaut : démarrez le serveur une fois (il le crée), puis relancez.');
  console.log(`Modèle par défaut : « ${template.name} »`);

  const set = {};
  const current = template.relations?.international || {};
  if (current.available === true && !FORCE) {
    console.log(`  International déjà ouvert (${current.baseFee} F) : inchangé`);
  } else {
    set['relations.international'] = INTERNATIONAL;
    console.log(`  International : desservi, ${INTERNATIONAL.baseFee} F, ${INTERNATIONAL.delay.minDays} à ${INTERNATIONAL.delay.maxDays} jours`);
  }

  const countries = await db.collection('zonefs').find({ type: 'country', isActive: { $ne: false } }, { projection: { name: 1 } }).toArray();
  const rules = [...(template.destinationRules || [])];
  const ruled = new Set(rules.map((r) => String(r.zoneId)));
  let added = 0;
  for (const { name, amount } of COUNTRY_PRICES) {
    const country = countries.find((c) => norm(c.name) === norm(name));
    if (!country) { console.log(`  ${name} : zone pays introuvable, ignoré`); continue; }
    if (ruled.has(String(country._id))) { console.log(`  ${name} : règle déjà définie, inchangée`); continue; }
    rules.push({ _id: new mongoose.Types.ObjectId(), zoneId: country._id, mode: 'fixed', amount, note: `Livraison ${name}` });
    added += 1;
    console.log(`  ${name} : prix fixe ${amount} F`);
  }
  if (added) set.destinationRules = rules;

  // Campagnes qui offriraient aussi l'international (ciblage explicite uniquement)
  const campaigns = await db.collection('shippingcampaigns').find({ isActive: true }).toArray();
  const risky = campaigns.filter((c) => (c.relations || []).includes('international'));
  if (risky.length) {
    console.log(`\n⚠ Campagne(s) de livraison offerte qui s'appliqueraient aussi à l'international :`);
    for (const c of risky) console.log(`   - « ${c.name} » : décochez « International » dans l'admin si l'international doit rester payant.`);
  }

  if (!Object.keys(set).length) {
    console.log('\nRien à modifier.');
  } else if (APPLY) {
    await db.collection('shippingtemplates').updateOne({ _id: template._id }, { $set: { ...set, updatedAt: new Date(), updatedBy: 'script:setInternationalDefaults' } });
    console.log('\n✔ Appliqué. Le calcul en tient compte en moins d’une minute (cache serveur).');
  } else {
    console.log('\nSimulation terminée — relancez avec --apply pour appliquer.');
  }
  await mongoose.disconnect();
})().catch((e) => { console.error('ERREUR', e.message); process.exit(1); });
