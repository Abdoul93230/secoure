const mongoose = require("mongoose");
const cron = require("cron");
const models = require("./Models");
const { confirmerTransactionsLivrees, tacheDeblocage } = require("./controllers/financeController");
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
    const job = new cron.CronJob("*/30 * * * *", async () => {
      try {
        await models.PromoCode.updateIsValideAsync();
        await confirmerTransactionsLivrees();
        await tacheDeblocage();

        console.log("Mise a jour de l'attribut isValide effectuée.");
      } catch (error) {
        console.error(
          "Erreur lors de la mise à jour de l'attribut isValide :",
          error
        );
      }
    });

    // Démarrer la tâche planifiée
    job.start();
  })
  .catch((error) => console.error("Erreur de connexion à MongoDB", error));

module.exports = mongoose.connection;
