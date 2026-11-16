require('dotenv').config();
const mongoose = require('mongoose');
const { Commande } = require('./src/Models');
const FinancialService = require('./src/services/FinancialService');
const Transaction = require('./src/models/transactionSchema');

async function repairMissingTransactions() {
  try {
    console.log('🔗 Connexion à MongoDB Atlas...');
    
    await mongoose.connect(
      process.env.MONGODB_URI,
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );
    
    console.log('✅ Connexion réussie');
    
    const sellerId = '68515b0ae15d71a80356a5ea';
    const produitsIds = [
      '64b93fada02c45917d53f6f1', // Nik Air1
      '68515e2ce15d71a80356a638', // produi
      '687e528fcbbe9db97c65d0fe', // test d'ajout
      '6897d9bc1c0a5b04eea46415', // teste produi
      '689a432a351eaf8ceb22d582', // test2
      '689b411a1aec9901f19b9006'  // test final
    ];
    
    console.log('\n🔧 === RÉPARATION DES TRANSACTIONS MANQUANTES ===');
    
    // Chercher les commandes "reçu par le livreur" avec vos produits
    const commandesRecu = await Commande.find({
      etatTraitement: 'reçu par le livreur',
      'nbrProduits.produit': { $in: produitsIds }
    });
    
    console.log(`📦 Commandes "reçu par le livreur" avec vos produits: ${commandesRecu.length}`);
    
    for (const commande of commandesRecu) {
      console.log(`\n🔍 Analyse commande ${commande.reference} (${commande._id})`);
      
      // Vérifier si des transactions existent déjà
      const transactionsExistantes = await Transaction.find({
        commandeId: commande._id.toString(),
        sellerId: sellerId
      });
      
      if (transactionsExistantes.length > 0) {
        console.log(`   ✅ ${transactionsExistantes.length} transaction(s) déjà créée(s)`);
        continue;
      }
      
      console.log(`   ❌ Aucune transaction trouvée - RÉPARATION NÉCESSAIRE`);
      
      // Calculer le montant des produits du vendor
      let montantVendeur = 0;
      let produitsVendeur = [];
      
      if (commande.nbrProduits && Array.isArray(commande.nbrProduits)) {
        for (const item of commande.nbrProduits) {
          if (produitsIds.includes(item.produit)) {
            produitsVendeur.push(item);
            
            // Chercher le prix dans prod
            if (commande.prod && Array.isArray(commande.prod)) {
              const prodDetails = commande.prod.find(p => p._id === item.produit);
              if (prodDetails) {
                const prix = prodDetails.prixPromo > 0 ? prodDetails.prixPromo : prodDetails.prix;
                montantVendeur += prix * item.quantite;
                console.log(`      - ${prodDetails.name}: ${item.quantite}x ${prix} = ${prix * item.quantite} FCFA`);
              }
            }
          }
        }
      }
      
      if (produitsVendeur.length > 0 && montantVendeur > 0) {
        console.log(`   💰 Montant total vendeur: ${montantVendeur} FCFA`);
        console.log(`   🔧 Création de la transaction manquante...`);
        
        try {
          // Créer les transactions pour cette commande
          const resultat = await FinancialService.creerTransactionsCommande(
            commande._id.toString(),
            commande,
            commande.reference
          );
          
          console.log(`   ✅ Transaction créée avec succès:`, resultat);
          
        } catch (error) {
          console.error(`   ❌ Erreur lors de la création:`, error.message);
        }
        
      } else {
        console.log(`   ⚠️  Aucun produit du vendeur trouvé dans cette commande`);
      }
    }
    
    // Vérifier le portefeuille final
    const Portefeuille = require('./src/models/portefeuilleSchema');
    const portefeuille = await Portefeuille.findOne({ sellerId });
    
    if (portefeuille) {
      console.log(`\n💼 État final du portefeuille:`);
      console.log(`   Solde en attente: ${portefeuille.soldeEnAttente} FCFA`);
      console.log(`   Solde disponible: ${portefeuille.soldeDisponible} FCFA`);
      console.log(`   Dernière MAJ: ${portefeuille.dateMiseAJour}`);
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Réparation terminée');
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

repairMissingTransactions();