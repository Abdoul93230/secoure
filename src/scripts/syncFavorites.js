/**
 * Script one-shot : synchronise product.favorites avec les likes existants
 * Usage : node src/scripts/syncFavorites.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb+srv://abdoulrazak9323:qrru0xfJGmJG0TSc@cluster0.mvrgous.mongodb.net/?retryWrites=true&w=majority";
  await mongoose.connect(uri);
  console.log('✅ Connecté à MongoDB');

  const db = mongoose.connection.db;

  // Compte les likes par produit via aggregation
  const likeCounts = await db.collection('likes').aggregate([
    { $group: { _id: '$produit', count: { $sum: 1 } } }
  ]).toArray();

  console.log(`📊 ${likeCounts.length} produits ont des likes existants`);

  if (likeCounts.length === 0) {
    console.log('Rien à migrer.');
    await mongoose.disconnect();
    return;
  }

  // Mise à jour en bulk
  const bulkOps = likeCounts.map(({ _id, count }) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(String(_id)) },
      update: { $set: { favorites: count } },
    }
  }));

  const result = await db.collection('produits').bulkWrite(bulkOps);

  console.log(`✅ ${result.modifiedCount} produits mis à jour`);
  console.log(`   (${result.matchedCount} matchés, ${result.upsertedCount} upsertés)`);

  await mongoose.disconnect();
  console.log('🔌 Déconnecté');
}

main().catch(err => {
  console.error('❌ Erreur :', err);
  process.exit(1);
});
