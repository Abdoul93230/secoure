require('dotenv').config();
const mongoose = require('mongoose');

// Configuration de la base de données
const DB_URL = process.env.MONGODB_URI; // Remplace par ton URL de DB

// Schéma du produit (simplifié pour la mise à jour)
const produitSchema = new mongoose.Schema({}, { strict: false });
const Produit = mongoose.model('Produit', produitSchema);

async function updateClefournisseur() {
  try {
    // Connexion à la base de données
    console.log('Connexion à la base de données...');
    await mongoose.connect(DB_URL);
    console.log('Connexion réussie !');

    // Ancienne et nouvelle valeur de Clefournisseur
    const ancienneClef = '64b166092fc5ec9687107b92';
    const nouvelleClef = '68515b0ae15d71a80356a5ea';

    // Compter les documents à mettre à jour
    const countAvant = await Produit.countDocuments({ 
      Clefournisseur: ancienneClef 
    });
    
    console.log(`Nombre de produits trouvés avec l'ancienne clef: ${countAvant}`);

    if (countAvant === 0) {
      console.log('Aucun produit trouvé avec cette Clefournisseur.');
      return;
    }

    // Mise à jour des documents
    console.log('Début de la mise à jour...');
    const resultat = await Produit.updateMany(
      { Clefournisseur: ancienneClef },
      { 
        $set: { 
          Clefournisseur: nouvelleClef,
          createdBy: new mongoose.Types.ObjectId(nouvelleClef),
          userRole: "seller"
        } 
      }
    );

    console.log(`Mise à jour terminée !`);
    console.log(`Nombre de documents modifiés: ${resultat.modifiedCount}`);
    console.log(`Nombre de documents correspondants: ${resultat.matchedCount}`);

    // Vérification après mise à jour
    const countApres = await Produit.countDocuments({ 
      Clefournisseur: nouvelleClef 
    });
    
    console.log(`Vérification - Produits avec la nouvelle clef: ${countApres}`);

    // Vérifier qu'il ne reste plus d'ancienne clef
    const resteAncienne = await Produit.countDocuments({ 
      Clefournisseur: ancienneClef 
    });
    
    console.log(`Vérification - Produits restants avec l'ancienne clef: ${resteAncienne}`);

  } catch (error) {
    console.error('Erreur lors de la mise à jour:', error);
  } finally {
    // Fermeture de la connexion
    console.log('Fermeture de la connexion...');
    await mongoose.connection.close();
    console.log('Connexion fermée.');
  }
}

// Version avec transaction pour plus de sécurité
async function updateClefournisseurAvecTransaction() {
  const session = await mongoose.startSession();
  
  try {
    console.log('Connexion à la base de données...');
    await mongoose.connect(DB_URL);
    console.log('Connexion réussie !');

    const ancienneClef = '64f1c1c278222822d3688103';
    const nouvelleClef = '68b1c52875377353f2032de7';

    // Démarrer la transaction
    await session.startTransaction();

    // Compter les documents à mettre à jour
    const countAvant = await Produit.countDocuments({ 
      Clefournisseur: ancienneClef 
    }).session(session);
    
    console.log(`Nombre de produits trouvés: ${countAvant}`);

    if (countAvant === 0) {
      console.log('Aucun produit trouvé avec cette Clefournisseur.');
      await session.abortTransaction();
      return;
    }

    // Mise à jour avec transaction
    const resultat = await Produit.updateMany(
      { Clefournisseur: ancienneClef },
      { 
        $set: { 
          Clefournisseur: nouvelleClef,
          createdBy: new mongoose.Types.ObjectId(nouvelleClef),
          userRole: "seller"
        } 
      },
      { session }
    );

    console.log(`Documents modifiés: ${resultat.modifiedCount}`);

    // Valider la transaction
    await session.commitTransaction();
    console.log('Transaction validée avec succès !');

  } catch (error) {
    console.error('Erreur:', error);
    await session.abortTransaction();
    console.log('Transaction annulée.');
  } finally {
    await session.endSession();
    await mongoose.connection.close();
  }
}

// Lancement du script
console.log('=== Script de mise à jour Clefournisseur ===');
console.log('Ancienne clef: 64f1c1c278222822d3688103');
console.log('Nouvelle clef: 68b1c52875377353f2032de7');
console.log('Modifications:');
console.log('- Clefournisseur → 68b1c52875377353f2032de7');
console.log('- createdBy → ObjectId("68b1c52875377353f2032de7")');
console.log('- userRole → "seller"');
console.log('==========================================');

// Choisis la version que tu préfères :
// Version simple
updateClefournisseur();

// Version avec transaction (plus sûre)
// updateClefournisseurAvecTransaction();











//////////////////////////////////////////////////////////////
// Ancien schéma (pour la migration)
// const oldProduitSchema = new mongoose.Schema({}, { strict: false });
// const OldProduit = mongoose.model('OldProduit', oldProduitSchema, 'produits'); // Force le nom de collection

// // Nouveau schéma avec ObjectId
// const newProduitSchema = new mongoose.Schema({
//   // ... autres champs
//   Clefournisseur: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'SellerRequest',
//     required: [true, "Un produit doit comporter la clef de son fournisseur."],
//   },
//   // ... autres champs
// }, { strict: false });

// const NewProduit = mongoose.model('NewProduit', newProduitSchema, 'produits');

// async function migrateClefournisseurToObjectId() {
//   try {
//     console.log('=== Migration Clefournisseur vers ObjectId ===');
//     await mongoose.connect(DB_URL);
//     console.log('Connexion réussie !');

//     // 1. Trouver tous les produits avec Clefournisseur de type String
//     console.log('\n1. Analyse des données existantes...');
    
//     const produitsAvecStringClef = await OldProduit.find({
//       Clefournisseur: { $type: "string" }
//     });

//     console.log(`Produits trouvés avec Clefournisseur en String: ${produitsAvecStringClef.length}`);

//     if (produitsAvecStringClef.length === 0) {
//       console.log('Aucune migration nécessaire !');
//       return;
//     }

//     // 2. Afficher quelques exemples pour vérification
//     console.log('\nExemples de Clefournisseur trouvées:');
//     const uniqueClefs = [...new Set(produitsAvecStringClef.map(p => p.Clefournisseur))];
//     uniqueClefs.slice(0, 5).forEach(clef => {
//       console.log(`- "${clef}" (${mongoose.Types.ObjectId.isValid(clef) ? 'ObjectId valide' : 'INVALIDE'})`);
//     });

//     // 3. Vérifier que toutes les clefs sont des ObjectId valides
//     const clefsInvalides = uniqueClefs.filter(clef => !mongoose.Types.ObjectId.isValid(clef));
    
//     if (clefsInvalides.length > 0) {
//       console.error('\n❌ ERREUR: Clefs invalides détectées:');
//       clefsInvalides.forEach(clef => console.error(`- "${clef}"`));
//       console.error('Veuillez corriger ces valeurs avant de continuer.');
//       return;
//     }

//     console.log('\n✅ Toutes les clefs sont des ObjectId valides !');

//     // 4. Migration des données
//     console.log('\n2. Début de la migration...');
    
//     let migratedCount = 0;
//     let errorCount = 0;

//     for (const produit of produitsAvecStringClef) {
//       try {
//         // Convertir la string en ObjectId
//         const objectIdClef = new mongoose.Types.ObjectId(produit.Clefournisseur);
        
//         // Mettre à jour le document
//         await OldProduit.updateOne(
//           { _id: produit._id },
//           { $set: { Clefournisseur: objectIdClef } }
//         );
        
//         migratedCount++;
        
//         // Afficher le progrès tous les 100 documents
//         if (migratedCount % 100 === 0) {
//           console.log(`Migré: ${migratedCount}/${produitsAvecStringClef.length}`);
//         }
        
//       } catch (error) {
//         console.error(`Erreur pour le produit ${produit._id}:`, error.message);
//         errorCount++;
//       }
//     }

//     console.log(`\n3. Migration terminée !`);
//     console.log(`✅ Produits migrés avec succès: ${migratedCount}`);
//     console.log(`❌ Erreurs: ${errorCount}`);

//     // 5. Vérification post-migration
//     console.log('\n4. Vérification post-migration...');
    
//     const produitsAvecObjectIdClef = await OldProduit.find({
//       Clefournisseur: { $type: "objectId" }
//     }).countDocuments();

//     const produitsRestantsAvecString = await OldProduit.find({
//       Clefournisseur: { $type: "string" }
//     }).countDocuments();

//     console.log(`Produits avec ObjectId: ${produitsAvecObjectIdClef}`);
//     console.log(`Produits restants avec String: ${produitsRestantsAvecString}`);

//     if (produitsRestantsAvecString === 0) {
//       console.log('\n🎉 Migration réussie ! Tous les Clefournisseur sont maintenant des ObjectId.');
//       console.log('Tu peux maintenant mettre à jour ton schéma Mongoose en toute sécurité.');
//     } else {
//       console.log('\n⚠️  Il reste des produits avec des Clefournisseur en String.');
//     }

//   } catch (error) {
//     console.error('Erreur lors de la migration:', error);
//   } finally {
//     await mongoose.connection.close();
//     console.log('\nConnexion fermée.');
//   }
// }

// // Script de rollback (au cas où)
// async function rollbackToString() {
//   try {
//     console.log('=== Rollback vers String ===');
//     await mongoose.connect(DB_URL);

//     const result = await OldProduit.updateMany(
//       { Clefournisseur: { $type: "objectId" } },
//       [
//         {
//           $set: {
//             Clefournisseur: { $toString: "$Clefournisseur" }
//           }
//         }
//       ]
//     );

//     console.log(`Rollback effectué sur ${result.modifiedCount} documents`);

//   } catch (error) {
//     console.error('Erreur lors du rollback:', error);
//   } finally {
//     await mongoose.connection.close();
//   }
// }

// // Lancement de la migration
// migrateClefournisseurToObjectId();

// // Pour rollback si nécessaire (décommenter):
// // rollbackToString();