const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Charger les variables d'environnement
dotenv.config({ path: path.join(__dirname, '.env') }); // Correction: .env est dans le même dossier

// Importer les cron jobs
const CronJobs = require('./src/utils/cronJobs');
const SubscriptionCronJobs = require('./src/utils/subscriptionCronJobs');
const { SellerRequest, PricingPlan } = require('./src/Models');
const SubscriptionQueue = require('./src/models/Abonnements/SubscriptionQueue');
const SubscriptionHistory = require('./src/models/Abonnements/SubscriptionHistory');
const SubscriptionRequest = require('./src/models/Abonnements/SubscriptionRequest');

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { // Correction: utiliser MONGODB_URI
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connexion à MongoDB réussie');
  } catch (error) {
    console.error('❌ Erreur de connexion MongoDB:', error);
    process.exit(1);
  }
}

async function testCronJobFunctions() {
  console.log('\n🧪 === TEST DES FONCTIONS DE CRON JOBS ===\n');

  try {
    // 1. Test de la fonction de traitement des abonnements expirants
    console.log('1️⃣  Test des abonnements expirants...');
    await SubscriptionCronJobs.processExpiringSubscriptions();
    console.log('✅ Test processExpiringSubscriptions terminé\n');

    // 2. Test de la fonction d'activation des abonnements vérifiés
    console.log('2️⃣  Test de l\'activation des abonnements vérifiés...');
    await SubscriptionCronJobs.activateVerifiedSubscriptions();
    console.log('✅ Test activateVerifiedSubscriptions terminé\n');

    // 3. Test de la fonction de nettoyage
    console.log('3️⃣  Test du nettoyage des anciennes données...');
    await SubscriptionCronJobs.cleanupOldData();
    console.log('✅ Test cleanupOldData terminé\n');

  } catch (error) {
    console.error('❌ Erreur lors des tests:', error);
  }
}

async function checkSubscriptionStats() {
  console.log('\n📊 === STATISTIQUES ACTUELLES ===\n');

  try {
    // Statistiques des abonnements
    const totalSubscriptions = await PricingPlan.countDocuments();
    const activeSubscriptions = await PricingPlan.countDocuments({ status: 'active' });
    const expiredSubscriptions = await PricingPlan.countDocuments({ status: 'expired' });
    
    // Statistiques de la queue
    const totalQueue = await SubscriptionQueue.countDocuments();
    const activeQueue = await SubscriptionQueue.countDocuments({ accountStatus: 'active' });
    const gracePeriodQueue = await SubscriptionQueue.countDocuments({ accountStatus: 'grace_period' });
    const suspendedQueue = await SubscriptionQueue.countDocuments({ accountStatus: 'suspended' });
    
    // Statistiques des demandes
    const totalRequests = await SubscriptionRequest.countDocuments();
    const pendingRequests = await SubscriptionRequest.countDocuments({ status: 'pending' });
    const approvedRequests = await SubscriptionRequest.countDocuments({ status: 'approved' });
    const rejectedRequests = await SubscriptionRequest.countDocuments({ status: 'rejected' });

    console.log('📋 ABONNEMENTS:');
    console.log(`   - Total: ${totalSubscriptions}`);
    console.log(`   - Actifs: ${activeSubscriptions}`);
    console.log(`   - Expirés: ${expiredSubscriptions}`);
    
    console.log('\n📋 QUEUE D\'ABONNEMENTS:');
    console.log(`   - Total: ${totalQueue}`);
    console.log(`   - Actifs: ${activeQueue}`);
    console.log(`   - Période de grâce: ${gracePeriodQueue}`);
    console.log(`   - Suspendus: ${suspendedQueue}`);
    
    console.log('\n📋 DEMANDES D\'ABONNEMENTS:');
    console.log(`   - Total: ${totalRequests}`);
    console.log(`   - En attente: ${pendingRequests}`);
    console.log(`   - Approuvées: ${approvedRequests}`);
    console.log(`   - Rejetées: ${rejectedRequests}`);

    // Vérifier les abonnements expirants
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const in1Day = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

    const expiringSoon7Days = await PricingPlan.countDocuments({
      status: 'active',
      endDate: { $gte: now, $lte: in7Days }
    });

    const expiringSoon1Day = await PricingPlan.countDocuments({
      status: 'active',
      endDate: { $gte: now, $lte: in1Day }
    });

    const alreadyExpired = await PricingPlan.countDocuments({
      status: 'active',
      endDate: { $lt: now }
    });

    console.log('\n⚠️  ABONNEMENTS À SURVEILLER:');
    console.log(`   - Expirent dans 7 jours: ${expiringSoon7Days}`);
    console.log(`   - Expirent dans 1 jour: ${expiringSoon1Day}`);
    console.log(`   - Déjà expirés (à traiter): ${alreadyExpired}`);

  } catch (error) {
    console.error('❌ Erreur lors de la récupération des statistiques:', error);
  }
}

async function simulateCronExecution() {
  console.log('\n🔄 === SIMULATION D\'EXÉCUTION CRON ===\n');

  // Simuler l'exécution des différents cron jobs
  console.log('⏰ Simulation: Cron job toutes les 6 heures (expirations)...');
  await SubscriptionCronJobs.processExpiringSubscriptions();
  
  console.log('\n⏰ Simulation: Cron job toutes les heures (activations)...');
  await SubscriptionCronJobs.activateVerifiedSubscriptions();
  
  console.log('\n⏰ Simulation: Cron job quotidien (nettoyage)...');
  await SubscriptionCronJobs.cleanupOldData();
  
  console.log('\n✅ Simulation terminée avec succès !');
}

async function main() {
  console.log('🧪 DÉMARRAGE DES TESTS DE CRON JOBS\n');
  
  // Connexion à la base de données
  await connectDB();
  
  // Afficher les statistiques actuelles
  await checkSubscriptionStats();
  
  // Tester les fonctions des cron jobs
  await testCronJobFunctions();
  
  // Simuler l'exécution des cron jobs
  await simulateCronExecution();
  
  // Afficher les statistiques après les tests
  console.log('\n📊 === STATISTIQUES APRÈS LES TESTS ===');
  await checkSubscriptionStats();
  
  console.log('\n✅ Tests terminés avec succès !');
  
  // Fermer la connexion
  await mongoose.connection.close();
  console.log('🔌 Connexion fermée');
}

// Gestion des erreurs non capturées
process.on('unhandledRejection', (err) => {
  console.error('❌ Erreur non gérée:', err);
  process.exit(1);
});

// Exécuter le script si appelé directement
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  testCronJobFunctions,
  checkSubscriptionStats,
  simulateCronExecution
};
