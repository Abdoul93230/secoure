/**
 * Script one-shot :
 * 1. Supprime les index uniques parasites sur produits
 * 2. Supprime les doublons (même vendeur + même nom), garde le plus récent
 * Usage : node src/scripts/cleanDuplicateProducts.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb+srv://abdoulrazak9323:qrru0xfJGmJG0TSc@cluster0.mvrgous.mongodb.net/?retryWrites=true&w=majority";
  await mongoose.connect(uri);
  console.log('Connecté à MongoDB');

  const db = mongoose.connection.db;
  const collection = db.collection('produits');

  // 1. Supprimer les index uniques parasites qu'on avait créés par erreur
  const indexes = await collection.indexes();
  const toDropNames = indexes
    .filter(idx => idx.unique && (
      JSON.stringify(idx.key).includes('name') ||
      JSON.stringify(idx.key).includes('barcode')
    ))
    .map(idx => idx.name);

  if (toDropNames.length > 0) {
    for (const name of toDropNames) {
      await collection.dropIndex(name);
      console.log(`Index supprimé : ${name}`);
    }
  } else {
    console.log('Aucun index unique parasite trouvé.');
  }

  // 2. Nettoyer les doublons (même vendeur + même nom)
  const Produit = mongoose.model('Produit', new mongoose.Schema({}, { strict: false }), 'produits');

  const duplicates = await Produit.aggregate([
    { $match: { isDeleted: { $ne: true } } },
    { $group: {
      _id: { seller: '$Clefournisseur', name: '$name' },
      ids: { $push: '$_id' },
      count: { $sum: 1 },
    }},
    { $match: { count: { $gt: 1 } } },
  ]);

  console.log(`\nGroupes avec doublons : ${duplicates.length}`);

  let totalDeleted = 0;
  for (const group of duplicates) {
    const sorted = group.ids.sort((a, b) => b.toString().localeCompare(a.toString()));
    const toDelete = sorted.slice(1);
    await Produit.deleteMany({ _id: { $in: toDelete } });
    console.log(`  "${group._id.name}" — supprimé ${toDelete.length} doublon(s)`);
    totalDeleted += toDelete.length;
  }

  console.log(`\nTerminé. ${totalDeleted} doublon(s) supprimé(s).`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
