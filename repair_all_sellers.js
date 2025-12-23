const mongoose = require('mongoose');
const { Commande, Fournisseur } = require('./src/Models');
const Portefeuille = require('./src/models/portefeuilleSchema');
const Transaction = require('./src/models/transactionSchema');
const FinancialService = require('./src/services/FinancialService');

async function repairAllSellersFinancials() {
  try {
    console.log('🔗 Connexion à MongoDB Atlas...');
    
    await mongoose.connect(
      "mongodb+srv://abdoulrazak9323:qrru0xfJGmJG0TSc@cluster0.mvrgous.mongodb.net/?retryWrites=true&w=majority",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );
    
    console.log('✅ Connexion réussie');
    console.log('\n🔧 === RÉPARATION GLOBALE DES SYSTÈMES FINANCIERS ===');
    
    // 1. Obtenir tous les sellers (actifs et inactifs)
    const sellers = await Fournisseur.find({});
    console.log(`👥 Sellers trouvés: ${sellers.length}`);
    
    // Ajouter notre seller spécifique s'il n'est pas dans Fournisseur
    const ourSellerId = '68515b0ae15d71a80356a5ea';
    const ourSellerExists = sellers.find(s => s._id.toString() === ourSellerId);
    if (!ourSellerExists) {
      console.log(`� Ajout du seller spécifique: ${ourSellerId}`);
      sellers.push({ _id: ourSellerId, name: 'Seller spécifique', email: 'seller@example.com' });
    }
    
    let sellersProcessed = 0;
    let sellersWithTransactions = 0;
    let totalTransactionsCreated = 0;
    let totalCoherenceFixed = 0;
    
    for (const seller of sellers) {
      const sellerId = seller._id.toString();
      console.log(`\n👤 === SELLER: ${seller.name || seller.email} (${sellerId}) ===`);
      
      try {
        // 2. Vérifier/créer le portefeuille
        let portefeuille = await Portefeuille.findOne({ sellerId });
        if (!portefeuille) {
          console.log('   💼 Création du portefeuille manquant...');
          portefeuille = new Portefeuille({
            sellerId,
            soldeDisponible: 0,
            soldeEnAttente: 0,
            soldeBloqueTemporairement: 0,
            soldeReserveRetrait: 0,
            soldeTotal: 0,
            nombreTransactions: 0,
            nombreRetraits: 0,
            dateCreation: new Date(),
            dateMiseAJour: new Date()
          });
          await portefeuille.save();
          console.log('   ✅ Portefeuille créé');
        }
        
        // 3. Rechercher les commandes avec produits de ce seller
        const commandesWithSellerProducts = await Commande.find({
          $or: [
            { 'prod.Clefournisseur._id': sellerId },
            { 'prod.Clefournisseur': sellerId }
          ]
        });
        
        console.log(`   📦 Commandes avec produits du seller: ${commandesWithSellerProducts.length}`);
        
        let commandesRepaired = 0;
        let transactionsCreated = 0;
        
        // 4. Traiter chaque commande
        for (const commande of commandesWithSellerProducts) {
          let needsTransactionCreation = false;
          let sellerProductsInOrder = false;
          
          // Vérifier si la commande contient des produits du seller
          if (commande.prod && Array.isArray(commande.prod)) {
            for (const produit of commande.prod) {
              let fournisseurId = null;
              
              if (typeof produit.Clefournisseur === 'object' && produit.Clefournisseur !== null) {
                fournisseurId = produit.Clefournisseur._id || produit.Clefournisseur.toString();
              } else if (typeof produit.Clefournisseur === 'string') {
                fournisseurId = produit.Clefournisseur;
              }
              
              if (fournisseurId === sellerId) {
                sellerProductsInOrder = true;
                break;
              }
            }
          }
          
          if (!sellerProductsInOrder) continue;
          
          // 5. Corriger les nbrProduits si nécessaire (ajouter Clefournisseur manquant)
          let commandeModified = false;
          if (commande.nbrProduits && Array.isArray(commande.nbrProduits)) {
            for (let item of commande.nbrProduits) {
              const prodDetails = commande.prod?.find(p => 
                (p._id === item.produit || p._id.toString() === item.produit)
              );
              
              if (prodDetails) {
                let fournisseurId = null;
                if (typeof prodDetails.Clefournisseur === 'object' && prodDetails.Clefournisseur !== null) {
                  fournisseurId = prodDetails.Clefournisseur._id || prodDetails.Clefournisseur.toString();
                } else if (typeof prodDetails.Clefournisseur === 'string') {
                  fournisseurId = prodDetails.Clefournisseur;
                }
                
                if (fournisseurId === sellerId && !item.Clefournisseur) {
                  item.Clefournisseur = sellerId;
                  commandeModified = true;
                }
              }
            }
          }
          
          if (commandeModified) {
            await commande.save();
            commandesRepaired++;
          }
          
          // 6. Créer les transactions manquantes pour les commandes "reçu par le livreur"
          if (commande.etatTraitement === 'reçu par le livreur') {
            const existingTransactions = await Transaction.find({
              commandeId: commande._id.toString(),
              sellerId: sellerId
            });
            
            if (existingTransactions.length === 0) {
              try {
                await FinancialService.creerTransactionsCommande(
                  commande._id.toString(),
                  commande.toObject(),
                  commande.reference
                );
                transactionsCreated++;
                console.log(`     💰 Transaction créée pour commande ${commande.reference}`);
              } catch (error) {
                console.error(`     ❌ Erreur transaction commande ${commande.reference}:`, error.message);
              }
            }
          }
        }
        
        // 7. Recalculer et corriger les soldes du portefeuille
        const allTransactions = await Transaction.find({ sellerId });
        let soldeDisponible = 0;
        let soldeEnAttente = 0;
        
        allTransactions.forEach(t => {
          if (t.statut === 'CONFIRME') {
            soldeDisponible += (t.montantNet || t.montant);
          } else if (t.statut === 'EN_ATTENTE') {
            soldeEnAttente += (t.montantNet || t.montant);
          }
        });
        
        const oldSoldeTotal = portefeuille.soldeTotal;
        const newSoldeTotal = soldeDisponible + soldeEnAttente + portefeuille.soldeBloqueTemporairement + portefeuille.soldeReserveRetrait;
        
        // Mettre à jour le portefeuille si nécessaire
        if (
          portefeuille.soldeDisponible !== soldeDisponible ||
          portefeuille.soldeEnAttente !== soldeEnAttente ||
          portefeuille.soldeTotal !== newSoldeTotal
        ) {
          portefeuille.soldeDisponible = soldeDisponible;
          portefeuille.soldeEnAttente = soldeEnAttente;
          portefeuille.soldeTotal = newSoldeTotal;
          portefeuille.nombreTransactions = allTransactions.length;
          portefeuille.dateMiseAJour = new Date();
          
          await portefeuille.save();
          totalCoherenceFixed++;
          
          console.log(`   🔧 Portefeuille mis à jour:`);
          console.log(`      Disponible: ${soldeDisponible} FCFA`);
          console.log(`      En attente: ${soldeEnAttente} FCFA`);
          console.log(`      Total: ${oldSoldeTotal} → ${newSoldeTotal} FCFA`);
        }
        
        if (commandesRepaired > 0 || transactionsCreated > 0) {
          sellersWithTransactions++;
          totalTransactionsCreated += transactionsCreated;
          console.log(`   ✅ Réparé: ${commandesRepaired} commandes, ${transactionsCreated} transactions`);
        } else {
          console.log(`   ⚪ Aucune réparation nécessaire`);
        }
        
        sellersProcessed++;
        
      } catch (sellerError) {
        console.error(`   ❌ Erreur pour seller ${sellerId}:`, sellerError.message);
      }
    }
    
    console.log(`\n📊 === RÉSUMÉ GLOBAL ===`);
    console.log(`👥 Sellers traités: ${sellersProcessed}/${sellers.length}`);
    console.log(`💰 Sellers avec transactions créées: ${sellersWithTransactions}`);
    console.log(`🔧 Total transactions créées: ${totalTransactionsCreated}`);
    console.log(`💼 Portefeuilles corrigés: ${totalCoherenceFixed}`);
    
    await mongoose.disconnect();
    console.log('\n✅ Réparation globale terminée');
    
  } catch (error) {
    console.error('❌ Erreur globale:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Exécuter la réparation si le script est appelé directement
if (require.main === module) {
  repairAllSellersFinancials();
}

module.exports = repairAllSellersFinancials;