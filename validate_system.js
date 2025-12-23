const mongoose = require('mongoose');
const { Commande } = require('./src/Models');
const Transaction = require('./src/models/transactionSchema');
const Portefeuille = require('./src/models/portefeuilleSchema');
const FinancialService = require('./src/services/FinancialService');

async function runRigorousValidationTests() {
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
    console.log('\n🧪 === VALIDATION RIGOUREUSE DU SYSTÈME FINANCIER ===');
    
    const sellerId = '68515b0ae15d71a80356a5ea';
    let testResults = {
      passed: 0,
      failed: 0,
      tests: []
    };
    
    function addTest(name, passed, details) {
      testResults.tests.push({ name, passed, details });
      if (passed) {
        console.log(`✅ ${name}`);
        testResults.passed++;
      } else {
        console.log(`❌ ${name} - ${details}`);
        testResults.failed++;
      }
    }
    
    // TEST 1: Vérifier l'état initial (système vide)
    console.log('\n1️⃣ === TEST ÉTAT INITIAL ===');
    
    const initialTransactions = await Transaction.countDocuments({ sellerId });
    const initialPortefeuille = await Portefeuille.findOne({ sellerId });
    
    addTest(
      'Aucune transaction initiale',
      initialTransactions === 0,
      `${initialTransactions} transactions trouvées`
    );
    
    addTest(
      'Aucun portefeuille initial',
      !initialPortefeuille,
      initialPortefeuille ? 'Portefeuille existe' : 'Aucun portefeuille'
    );
    
    // TEST 2: Vérifier les commandes créées
    console.log('\n2️⃣ === TEST COMMANDES CRÉÉES ===');
    
    const commandes = await Commande.find({
      'prod.Clefournisseur': sellerId
    }).sort({ createdAt: -1 });
    
    addTest(
      'Commandes de test créées',
      commandes.length === 3,
      `${commandes.length} commandes trouvées`
    );
    
    const commandeEnTraitement = commandes.filter(c => c.etatTraitement === 'traitement');
    const commandeRecue = commandes.filter(c => c.etatTraitement === 'reçu par le livreur');
    
    addTest(
      'Commandes en traitement',
      commandeEnTraitement.length === 2,
      `${commandeEnTraitement.length} commandes en traitement`
    );
    
    addTest(
      'Commande reçue par livreur',
      commandeRecue.length === 1,
      `${commandeRecue.length} commande reçue`
    );
    
    // TEST 3: Vérifier la création automatique de transaction pour commande existante
    console.log('\n3️⃣ === TEST TRANSACTION AUTOMATIQUE ===');
    
    if (commandeRecue.length > 0) {
      const commande = commandeRecue[0];
      console.log(`   Traitement commande: ${commande.reference}`);
      
      // Cette commande devrait déjà avoir créé une transaction
      const transactionsCommande = await Transaction.find({
        commandeId: commande._id.toString(),
        sellerId
      });
      
      addTest(
        'Transaction automatique créée',
        transactionsCommande.length > 0,
        `${transactionsCommande.length} transactions trouvées`
      );
      
      if (transactionsCommande.length > 0) {
        const transaction = transactionsCommande[0];
        addTest(
          'Transaction EN_ATTENTE',
          transaction.statut === 'EN_ATTENTE',
          `Statut: ${transaction.statut}`
        );
        
        addTest(
          'Montant correct (7000 FCFA)',
          transaction.montant === 7000,
          `Montant: ${transaction.montant}`
        );
      }
    }
    
    // TEST 4: Simulation changement d'état
    console.log('\n4️⃣ === TEST CHANGEMENT ÉTAT MANUEL ===');
    
    if (commandeEnTraitement.length > 0) {
      const commandeAChanger = commandeEnTraitement[0];
      console.log(`   Changement d'état commande: ${commandeAChanger.reference}`);
      console.log(`   ${commandeAChanger.etatTraitement} → reçu par le livreur`);
      
      const ancienEtat = commandeAChanger.etatTraitement;
      const nouvelEtat = 'reçu par le livreur';
      
      // Simuler le changement d'état via FinancialService
      try {
        await FinancialService.gererChangementEtatCommande(
          commandeAChanger._id.toString(),
          ancienEtat,
          nouvelEtat,
          commandeAChanger.toObject(),
          commandeAChanger.reference
        );
        
        // Vérifier que la transaction a été créée
        const nouvellesTransactions = await Transaction.find({
          commandeId: commandeAChanger._id.toString(),
          sellerId
        });
        
        addTest(
          'Transaction créée par changement d\'état',
          nouvellesTransactions.length > 0,
          `${nouvellesTransactions.length} transactions trouvées`
        );
        
      } catch (error) {
        addTest(
          'Changement d\'état sans erreur',
          false,
          error.message
        );
      }
    }
    
    // TEST 5: Vérifier le portefeuille après transactions
    console.log('\n5️⃣ === TEST PORTEFEUILLE FINAL ===');
    
    const toutesTransactions = await Transaction.find({ sellerId });
    const portefeuilleFinal = await Portefeuille.findOne({ sellerId });
    
    addTest(
      'Transactions créées au total',
      toutesTransactions.length >= 1,
      `${toutesTransactions.length} transactions au total`
    );
    
    if (portefeuilleFinal) {
      addTest(
        'Portefeuille créé',
        true,
        `Solde en attente: ${portefeuilleFinal.soldeEnAttente}`
      );
      
      const soldeAttendu = toutesTransactions
        .filter(t => t.statut === 'EN_ATTENTE')
        .reduce((sum, t) => sum + (t.montantNet || t.montant), 0);
      
      addTest(
        'Solde en attente cohérent',
        portefeuilleFinal.soldeEnAttente === soldeAttendu,
        `Portefeuille: ${portefeuilleFinal.soldeEnAttente}, Calculé: ${soldeAttendu}`
      );
    }
    
    // TEST 6: Test de confirmation de transaction
    console.log('\n6️⃣ === TEST CONFIRMATION TRANSACTION ===');
    
    const transactionsEnAttente = toutesTransactions.filter(t => t.statut === 'EN_ATTENTE');
    if (transactionsEnAttente.length > 0) {
      const transaction = transactionsEnAttente[0];
      const commandeId = transaction.commandeId;
      
      // Simuler livraison confirmée
      console.log(`   Simulation confirmation livraison pour commande: ${commandeId}`);
      
      try {
        await FinancialService.confirmerTransactionsCommande(commandeId);
        
        const transactionConfirmee = await Transaction.findById(transaction._id);
        addTest(
          'Transaction confirmée',
          transactionConfirmee.statut === 'CONFIRME',
          `Statut final: ${transactionConfirmee.statut}`
        );
        
      } catch (error) {
        addTest(
          'Confirmation sans erreur',
          false,
          error.message
        );
      }
    }
    
    // RÉSUMÉ FINAL
    console.log('\n📊 === RÉSUMÉ DES TESTS ===');
    console.log(`✅ Tests réussis: ${testResults.passed}`);
    console.log(`❌ Tests échoués: ${testResults.failed}`);
    console.log(`📋 Total tests: ${testResults.tests.length}`);
    
    const successRate = (testResults.passed / testResults.tests.length * 100).toFixed(1);
    console.log(`📈 Taux de réussite: ${successRate}%`);
    
    if (testResults.failed === 0) {
      console.log('\n🎉 === VALIDATION COMPLÈTE RÉUSSIE ===');
      console.log('✅ Le système financier fonctionne parfaitement !');
    } else {
      console.log('\n⚠️ === VALIDATION PARTIELLE ===');
      console.log('❌ Certains tests ont échoué, voir détails ci-dessus');
    }
    
    // Détail des tests échoués
    const failedTests = testResults.tests.filter(t => !t.passed);
    if (failedTests.length > 0) {
      console.log('\n💥 TESTS ÉCHOUÉS:');
      failedTests.forEach(test => {
        console.log(`   ❌ ${test.name}: ${test.details}`);
      });
    }
    
    await mongoose.disconnect();
    console.log('\n🔌 Validation terminée');
    
    return testResults;
    
  } catch (error) {
    console.error('❌ Erreur validation:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Exécuter si appelé directement
if (require.main === module) {
  runRigorousValidationTests();
}

module.exports = runRigorousValidationTests;