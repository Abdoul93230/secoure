const mongoose = require('mongoose');
const { Commande } = require('./src/Models');
const Portefeuille = require('./src/models/portefeuilleSchema');
const Transaction = require('./src/models/transactionSchema');
const Retrait = require('./src/models/retraitSchema');

async function resetFinancialSystemCompletely() {
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
    console.log('\n🔥 === REMISE À ZÉRO COMPLÈTE DU SYSTÈME FINANCIER ===');
    console.log('⚠️  ATTENTION: Cette opération va supprimer TOUTES les données financières !');
    
    // Attendre 3 secondes pour permettre l'annulation si nécessaire
    console.log('⏳ Démarrage dans 3 secondes... (Ctrl+C pour annuler)');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    let deletedCounts = {
      commandes: 0,
      transactions: 0,
      portefeuilles: 0,
      retraits: 0
    };
    
    // 1. SUPPRIMER TOUTES LES COMMANDES
    console.log('\n1️⃣ Suppression de toutes les commandes...');
    const commandesResult = await Commande.deleteMany({});
    deletedCounts.commandes = commandesResult.deletedCount;
    console.log(`✅ ${deletedCounts.commandes} commandes supprimées`);
    
    // 2. SUPPRIMER TOUTES LES TRANSACTIONS
    console.log('\n2️⃣ Suppression de toutes les transactions...');
    const transactionsResult = await Transaction.deleteMany({});
    deletedCounts.transactions = transactionsResult.deletedCount;
    console.log(`✅ ${deletedCounts.transactions} transactions supprimées`);
    
    // 3. SUPPRIMER TOUS LES PORTEFEUILLES
    console.log('\n3️⃣ Suppression de tous les portefeuilles...');
    const portefeuillesResult = await Portefeuille.deleteMany({});
    deletedCounts.portefeuilles = portefeuillesResult.deletedCount;
    console.log(`✅ ${deletedCounts.portefeuilles} portefeuilles supprimés`);
    
    // 4. SUPPRIMER TOUTES LES DEMANDES DE RETRAIT
    console.log('\n4️⃣ Suppression de toutes les demandes de retrait...');
    const retraitsResult = await Retrait.deleteMany({});
    deletedCounts.retraits = retraitsResult.deletedCount;
    console.log(`✅ ${deletedCounts.retraits} retraits supprimés`);
    
    // 5. VÉRIFICATION DE LA SUPPRESSION COMPLÈTE
    console.log('\n🔍 Vérification de la suppression complète...');
    
    const commandesRestantes = await Commande.countDocuments();
    const transactionsRestantes = await Transaction.countDocuments();
    const portefeuillesRestants = await Portefeuille.countDocuments();
    const retraitsRestants = await Retrait.countDocuments();
    
    console.log(`📊 Vérification finale:`);
    console.log(`   Commandes restantes: ${commandesRestantes}`);
    console.log(`   Transactions restantes: ${transactionsRestantes}`);
    console.log(`   Portefeuilles restants: ${portefeuillesRestants}`);
    console.log(`   Retraits restants: ${retraitsRestants}`);
    
    if (commandesRestantes === 0 && transactionsRestantes === 0 && 
        portefeuillesRestants === 0 && retraitsRestants === 0) {
      console.log('\n🎉 === SUPPRESSION COMPLÈTE RÉUSSIE ===');
    } else {
      console.log('\n⚠️ === SUPPRESSION PARTIELLE ===');
    }
    
    // 6. RÉSUMÉ FINAL
    console.log('\n📊 === RÉSUMÉ DES SUPPRESSIONS ===');
    console.log(`🗑️  Commandes supprimées: ${deletedCounts.commandes}`);
    console.log(`💰 Transactions supprimées: ${deletedCounts.transactions}`);
    console.log(`💼 Portefeuilles supprimés: ${deletedCounts.portefeuilles}`);
    console.log(`💸 Retraits supprimés: ${deletedCounts.retraits}`);
    
    const totalSupprime = Object.values(deletedCounts).reduce((a, b) => a + b, 0);
    console.log(`\n🔥 TOTAL ÉLÉMENTS SUPPRIMÉS: ${totalSupprime}`);
    
    console.log('\n✅ === SYSTÈME PRÊT POUR LES NOUVEAUX TESTS ===');
    console.log('🎯 Le système financier est maintenant vierge et prêt pour validation');
    
    await mongoose.disconnect();
    console.log('\n🔌 Connexion fermée');
    
  } catch (error) {
    console.error('❌ Erreur lors de la suppression:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Fonction de confirmation interactive (optionnelle)
async function askForConfirmation() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('🔥 VOULEZ-VOUS VRAIMENT SUPPRIMER TOUTES LES DONNÉES FINANCIÈRES ? (tapez "OUI" pour confirmer): ', (answer) => {
      rl.close();
      resolve(answer.toUpperCase() === 'OUI');
    });
  });
}

// Exécution avec confirmation
async function main() {
  console.log('⚠️  === REMISE À ZÉRO DU SYSTÈME FINANCIER ===');
  console.log('Cette opération va supprimer:');
  console.log('- Toutes les commandes');
  console.log('- Toutes les transactions');
  console.log('- Tous les portefeuilles');
  console.log('- Toutes les demandes de retrait');
  console.log('');
  
  // Pour l'automatisation, commentez cette ligne et décommentez la suivante
  const confirmed = await askForConfirmation();
  // const confirmed = true; // Utiliser ceci pour bypasser la confirmation
  
  if (confirmed) {
    await resetFinancialSystemCompletely();
  } else {
    console.log('❌ Opération annulée par l\'utilisateur');
  }
}

// Exécuter si appelé directement
if (require.main === module) {
  main();
}

module.exports = resetFinancialSystemCompletely;