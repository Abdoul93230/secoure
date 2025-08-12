const mongoose = require('mongoose');

// Remplacez par votre URL de connexion MongoDB
const MONGODB_URI = 'mongodb+srv://abdoulrazak9323:qrru0xfJGmJG0TSc@cluster0.mvrgous.mongodb.net/?retryWrites=true&w=majority';

// Fonction principale pour mettre à jour les produits
async function updateAllProducts() {
  try {
    // Connexion à MongoDB
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connexion à MongoDB réussie');

    // Mise à jour de tous les produits
    const result = await mongoose.connection.db.collection('produits').updateMany(
      {}, // Filtre vide pour sélectionner tous les documents
      {
        $set: {
          isDeleted: false,
          isPublished: "Published"
        }
      }
    );

    console.log(`✅ Mise à jour terminée:`);
    console.log(`   - Documents correspondants: ${result.matchedCount}`);
    console.log(`   - Documents modifiés: ${result.modifiedCount}`);

    // Vérification des résultats
    const updatedProducts = await mongoose.connection.db.collection('produits').find({
      isDeleted: false,
      isPublished: "Published"
    }).count();

    console.log(`✅ Nombre total de produits avec isDeleted: false et isPublished: "Published": ${updatedProducts}`);

  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour:', error);
  } finally {
    // Fermeture de la connexion
    await mongoose.connection.close();
    console.log('🔒 Connexion fermée');
  }
}

// Alternative avec le modèle Mongoose (si vous avez votre modèle défini)
async function updateWithModel() {
  try {
    // Assurez-vous d'importer votre modèle Produit ici
    // const Produit = require('./chemin/vers/votre/modele');
    
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connexion à MongoDB réussie');

    // Utilisation du modèle Mongoose
    const result = await Produit.updateMany(
      {}, // Tous les produits
      {
        $set: {
          isDeleted: false,
          isPublished: "Published"
        }
      }
    );

    console.log(`✅ Mise à jour avec modèle terminée:`);
    console.log(`   - Documents correspondants: ${result.matchedCount}`);
    console.log(`   - Documents modifiés: ${result.modifiedCount}`);

  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔒 Connexion fermée');
  }
}

// Script de vérification avant mise à jour
async function checkProductsStatus() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('🔍 Vérification du statut actuel des produits...');
    
    const stats = await mongoose.connection.db.collection('produits').aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          deleted: { $sum: { $cond: [{ $eq: ["$isDeleted", true] }, 1, 0] } },
          notDeleted: { $sum: { $cond: [{ $eq: ["$isDeleted", false] }, 1, 0] } },
          published: { $sum: { $cond: [{ $eq: ["$isPublished", "Published"] }, 1, 0] } },
          unpublished: { $sum: { $cond: [{ $eq: ["$isPublished", "UnPublished"] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ["$isPublished", "Attente"] }, 1, 0] } },
          refused: { $sum: { $cond: [{ $eq: ["$isPublished", "Refuser"] }, 1, 0] } }
        }
      }
    ]).toArray();
    
    if (stats.length > 0) {
      const stat = stats[0];
      console.log('📊 Statistiques actuelles:');
      console.log(`   - Total produits: ${stat.total}`);
      console.log(`   - Supprimés (isDeleted: true): ${stat.deleted}`);
      console.log(`   - Non supprimés (isDeleted: false): ${stat.notDeleted}`);
      console.log(`   - Publiés: ${stat.published}`);
      console.log(`   - Non publiés: ${stat.unpublished}`);
      console.log(`   - En attente: ${stat.pending}`);
      console.log(`   - Refusés: ${stat.refused}`);
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error);
  } finally {
    await mongoose.connection.close();
  }
}

// Script de mise à jour ciblée
async function updateProductsComplete() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connexion à MongoDB réussie');
    console.log('🔄 Mise à jour de tous les produits...');

    // Mise à jour de TOUS les produits, même ceux sans ces champs
    const result = await mongoose.connection.db.collection('produits').updateMany(
      {}, // Tous les produits
      {
        $set: {
          isDeleted: false,
          isPublished: "Published"
        }
      },
      { upsert: false } // Ne pas créer de nouveaux documents
    );

    console.log(`✅ Mise à jour terminée:`);
    console.log(`   - Documents trouvés: ${result.matchedCount}`);
    console.log(`   - Documents modifiés: ${result.modifiedCount}`);

    // Vérification après mise à jour
    const finalStats = await mongoose.connection.db.collection('produits').aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          deleted: { $sum: { $cond: [{ $eq: ["$isDeleted", true] }, 1, 0] } },
          notDeleted: { $sum: { $cond: [{ $eq: ["$isDeleted", false] }, 1, 0] } },
          published: { $sum: { $cond: [{ $eq: ["$isPublished", "Published"] }, 1, 0] } },
          unpublished: { $sum: { $cond: [{ $eq: ["$isPublished", "UnPublished"] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ["$isPublished", "Attente"] }, 1, 0] } },
          refused: { $sum: { $cond: [{ $eq: ["$isPublished", "Refuser"] }, 1, 0] } }
        }
      }
    ]).toArray();

    if (finalStats.length > 0) {
      const stat = finalStats[0];
      console.log('\n📊 Statistiques APRÈS mise à jour:');
      console.log(`   - Total produits: ${stat.total}`);
      console.log(`   - Non supprimés (isDeleted: false): ${stat.notDeleted}`);
      console.log(`   - Publiés (isPublished: "Published"): ${stat.published}`);
      console.log(`   - En attente: ${stat.pending}`);
      console.log(`   - Non publiés: ${stat.unpublished}`);
      console.log(`   - Refusés: ${stat.refused}`);
    }

  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔒 Connexion fermée');
  }
}

// Exécution du script
console.log('🚀 Début du script de mise à jour des produits...');

// Exécuter la mise à jour complète
updateProductsComplete();