const mongoose = require("mongoose");
const cron = require("cron");
const models = require("./Models");
const PromoCodeV2 = require('./models/PromoCode');
const FinancialService = require('./services/FinancialService');
const { confirmerTransactionsLivrees, tacheDeblocage, tacheNettoyage } = require("./controllers/financeController");
const financialLogger = require('./utils/financialLogger');
const { setupUniversalCronJobs } = require("./controllers/subscriptionController");
const syncPlanCommissions = require('./utils/syncPlanCommissions');

const MONGODB_URI= process.env.MONGODB_URI
// PromoCode
// 'mongodb://127.0.0.1:27017/dbschagona'


const MONGO_URI = MONGODB_URI || "mongodb+srv://abdoulrazak9323:qrru0xfJGmJG0TSc@cluster0.mvrgous.mongodb.net/?retryWrites=true&w=majority";

// Reconnexion automatique sur déconnexion
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB déconnecté — reconnexion dans 5s...');
  setTimeout(() => {
    mongoose.connect(MONGO_URI, mongoOptions).catch(err =>
      console.error('❌ Reconnexion échouée:', err.message)
    );
  }, 5000);
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Erreur MongoDB connection:', err.message);
});

const mongoOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  // Keepalive : envoie un ping toutes les 10s pour éviter la fermeture par Atlas
  heartbeatFrequencyMS: 10000,
  // Délai max pour trouver un serveur disponible
  serverSelectionTimeoutMS: 10000,
  // Délai max pour établir une connexion TCP
  connectTimeoutMS: 10000,
  // Délai max d'inactivité d'un socket avant fermeture
  socketTimeoutMS: 45000,
  // Ferme les connexions du pool inactives depuis plus de 30s (< timeout Atlas)
  maxIdleTimeMS: 30000,
  // Pool de connexions
  maxPoolSize: 10,
  minPoolSize: 2,
};

mongoose
  .connect(MONGO_URI, mongoOptions)

  .then(async () => {
    console.log("Connexion à MongoDB établie");

    // Synchroniser les commissions PricingPlan avec SUBSCRIPTION_CONFIG au démarrage
    await syncPlanCommissions();

    // Tâche principale: mise à jour des codes promo et gestion financière
    const job = new cron.CronJob("*/30 * * * *", async () => {
      if (mongoose.connection.readyState !== 1) {
        console.warn('⚠️  Cron ignoré — MongoDB non connecté (state:', mongoose.connection.readyState, ')');
        return;
      }
      try {
        // Mise à jour des codes promo (legacy)
        await models.PromoCode.updateIsValideAsync();
        // Désactivation des codes promo V2 expirés
        await PromoCodeV2.deactivateExpiredCodes();
        
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
      if (mongoose.connection.readyState !== 1) return;
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
    setupUniversalCronJobs()
    
    console.log("✅ Tâches automatiques démarrées:");
    console.log("   - Confirmation/déblocage: toutes les 30 minutes");
    console.log("   - Nettoyage: tous les jours à 2h");
  })
  .catch((error) => console.error("Erreur de connexion à MongoDB", error));

module.exports = mongoose.connection;
