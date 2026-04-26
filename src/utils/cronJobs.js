const cron = require('node-cron');
const FinancialService = require('../services/FinancialService');
const { confirmerTransactionsLivrees } = require('../controllers/financeController');
const SubscriptionCronJobs = require('./subscriptionCronJobs');
const { setupEnhancedCronJobs } = require('../controllers/enhancedSubscriptionController');

// Recalcul immédiat de tous les portefeuilles (appelé au démarrage)
async function recalculerTousLesPortefeuilles() {
  try {
    const Portefeuille = require('../models/portefeuilleSchema');
    const portefeuilles = await Portefeuille.find({}, { sellerId: 1 }).lean();
    let corriges = 0;
    for (const p of portefeuilles) {
      try {
        const check = await FinancialService.verifierCoherencePortefeuille(p.sellerId);
        if (!check.coherent) {
          await FinancialService.corrigerIncoherences(p.sellerId);
          corriges++;
        }
      } catch (e) {
        console.error(`❌ Recalcul seller ${p.sellerId}:`, e.message);
      }
    }
    if (corriges > 0) {
      console.log(`🔧 Démarrage: ${corriges}/${portefeuilles.length} portefeuilles corrigés`);
    }
  } catch (e) {
    console.error('❌ Erreur recalcul initial:', e.message);
  }
}

class CronJobs {
  static init() {
    console.log('🕐 Initialisation des tâches programmées...');

    // Recalcul immédiat au démarrage (sans bloquer)
    recalculerTousLesPortefeuilles();

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

    // Recalcul et correction automatique de tous les portefeuilles à 3h du matin
    cron.schedule('0 3 * * *', async () => {
      console.log('🔧 Recalcul automatique des portefeuilles...');
      try {
        const Portefeuille = require('../models/portefeuilleSchema');
        const portefeuilles = await Portefeuille.find({}, { sellerId: 1 }).lean();
        let corriges = 0;
        for (const p of portefeuilles) {
          try {
            const check = await FinancialService.verifierCoherencePortefeuille(p.sellerId);
            if (!check.coherent) {
              await FinancialService.corrigerIncoherences(p.sellerId);
              corriges++;
            }
          } catch (e) {
            console.error(`❌ Erreur recalcul seller ${p.sellerId}:`, e.message);
          }
        }
        console.log(`✅ Recalcul terminé: ${corriges}/${portefeuilles.length} portefeuilles corrigés`);
      } catch (error) {
        console.error('❌ Erreur lors du recalcul automatique:', error);
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