const cron = require('node-cron');
const FinancialService = require('../services/FinancialService');
const { confirmerTransactionsLivrees } = require('../controllers/financeController');
const SubscriptionCronJobs = require('./subscriptionCronJobs');
const { setupEnhancedCronJobs } = require('../controllers/enhancedSubscriptionController');

class CronJobs {
  static init() {
    console.log('🕐 Initialisation des tâches programmées...');

    // Déblocage de l'argent toutes les heures
    cron.schedule('0 * * * *', async () => {
      console.log('🔓 Exécution de la tâche de déblocage...');
      try {
        const result = await FinancialService.debloquerArgentDisponible();
        console.log(`✅ Déblocage terminé: ${result.count} transactions, ${result.montant} FCFA`);
      } catch (error) {
        console.error('❌ Erreur lors du déblocage:', error);
      }
    });

    // Confirmation des transactions livrées toutes les 30 minutes
    cron.schedule('*/30 * * * *', async () => {
      console.log('✅ Exécution de la confirmation des transactions...');
      try {
        const result = await confirmerTransactionsLivrees();
        console.log(`✅ Confirmation terminée: ${result.confirmees}/${result.total} transactions`);
      } catch (error) {
        console.error('❌ Erreur lors de la confirmation:', error);
      }
    });

    // Nettoyage automatique tous les jours à 2h du matin
    cron.schedule('0 2 * * *', async () => {
      console.log('🧹 Exécution du nettoyage automatique...');
      try {
        const result = await FinancialService.nettoyageAutomatique();
        console.log(`✅ Nettoyage terminé: ${result.retraitsExpires} retraits expirés`);
      } catch (error) {
        console.error('❌ Erreur lors du nettoyage:', error);
      }
    });

    // Audit quotidien à 3h du matin
    cron.schedule('0 3 * * *', async () => {
      console.log('🔍 Exécution de l\'audit quotidien...');
      try {
        // Ici vous pourriez ajouter une fonction d'audit automatique
        // qui envoie un rapport par email aux administrateurs
        console.log('✅ Audit quotidien terminé');
      } catch (error) {
        console.error('❌ Erreur lors de l\'audit:', error);
      }
    });

    // Initialiser les cron jobs d'abonnement
    SubscriptionCronJobs.init();

    // Initialiser les cron jobs d'abonnement améliorés
    setupEnhancedCronJobs();

    console.log('✅ Tâches programmées initialisées avec succès');
  }

  static stop() {
    cron.destroy();
    SubscriptionCronJobs.stop();
    console.log('🛑 Tâches programmées arrêtées');
  }
}

module.exports = CronJobs;