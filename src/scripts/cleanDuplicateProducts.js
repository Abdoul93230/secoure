/**
 * Script one-shot : supprime les doublons de produits (même vendeur + même nom)
 * Garde le plus récent, supprime les autres.
 * Usage : node src/scripts/cleanDuplicateProducts.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb+srv://abdoulrazak9323:qrru0xfJGmJG0TSc@cluster0.mvrgous.mongodb.net/?retryWrites=true&w=majority";
  await mongoose.connect(uri);
  console.log('Connecté à MongoDB');

  const Produit = mongoose.model('Produit', new mongoose.Schema({}, { strict: false }), 'produits');

  // Trouve tous les groupes (vendeur + nom) avec plus d'un doc
  const duplicates = await Produit.aggregate([
    { $match: { isDeleted: { $ne: true } } },
    { $group: {
      _id: { seller: '$Clefournisseur', name: '$name' },
      ids: { $push: '$_id' },
      count: { $sum: 1 },
    }},
    { $match: { count: { $gt: 1 } } },
  ]);

  console.log(`Groupes avec doublons trouvés : ${duplicates.length}`);

  let totalDeleted = 0;
  for (const group of duplicates) {
    // Garde le premier (_id le plus récent = ObjectId le plus grand), supprime le reste
    const sorted = group.ids.sort((a, b) => b.toString().localeCompare(a.toString()));
    const toDelete = sorted.slice(1); // tous sauf le plus récent
    await Produit.deleteMany({ _id: { $in: toDelete } });
    console.log(`  "${group._id.name}" — supprimé ${toDelete.length} doublon(s)`);
    totalDeleted += toDelete.length;
  }

  console.log(`\nTerminé. ${totalDeleted} doublon(s) supprimé(s).`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
