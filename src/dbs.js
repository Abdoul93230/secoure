const mongoose = require("mongoose");
const cron = require("cron");
const models = require("./Models");
const FinancialService = require('./services/FinancialService');
const { confirmerTransactionsLivrees, tacheDeblocage, tacheNettoyage } = require("./controllers/financeController");
const financialLogger = require('./utils/financialLogger');
// PromoCode
// 'mongodb://127.0.0.1:27017/dbschagona'


mongoose
  .connect(
    "mongodb+srv://abdoulrazak9323:qrru0xfJGmJG0TSc@cluster0.mvrgous.mongodb.net/?retryWrites=true&w=majority",
    // "mongodb://127.0.0.1:27017/dbschagona",
    // "mongodb://127.0.0.1:27017/iham",

    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )

  .then(() => {
    console.log("Connexion à MongoDB établie");
    
    // Tâche principale: mise à jour des codes promo et gestion financière
    const job = new cron.CronJob("*/30 * * * *", async () => {
      try {
        // Mise à jour des codes promo
        await models.PromoCode.updateIsValideAsync();
        
        // Confirmation automatique des transactions
        const result = await confirmerTransactionsLivrees();
        console.log(`✅ Confirmation terminée: ${result.confirmees}/${result.total} transactions`);
        financialLogger.success('CONFIRMATION_AUTOMATIQUE', result);
        
        // Déblocage de l'argent
        const result2 = await FinancialService.debloquerArgentDisponible();
        console.log(`✅ Déblocage terminé: ${result2.count} transactions, ${result2.montant} FCFA`);
        financialLogger.success('DEBLOCAGE_AUTOMATIQUE', result2);

        console.log("✅ Mise à jour de l'attribut isValide effectuée.");
      } catch (error) {
        console.error("❌ Erreur lors des tâches automatiques:", error);
        financialLogger.error('TACHES_AUTOMATIQUES', { error: error.message });
      }
    });

    // Tâche de nettoyage quotidienne
    const cleanupJob = new cron.CronJob("0 2 * * *", async () => {
      try {
        const result3 = await FinancialService.nettoyageAutomatique();
        console.log(`✅ Nettoyage terminé: ${result3.retraitsExpires} retraits expirés`);
        financialLogger.success('NETTOYAGE_AUTOMATIQUE', result3);
        
        // Nettoyer aussi les anciens logs
        financialLogger.cleanOldLogs(30);
      } catch (error) {
        console.error("❌ Erreur lors du nettoyage:", error);
        financialLogger.error('NETTOYAGE_AUTOMATIQUE', { error: error.message });
      }
    });

    // Démarrer la tâche planifiée
    job.start();
    cleanupJob.start();
    
    console.log("✅ Tâches automatiques démarrées:");
    console.log("   - Confirmation/déblocage: toutes les 30 minutes");
    console.log("   - Nettoyage: tous les jours à 2h");
  })
  .catch((error) => console.error("Erreur de connexion à MongoDB", error));

module.exports = mongoose.connection;
