/**
 * Synchronisation automatique des commissions PricingPlan avec SUBSCRIPTION_CONFIG.
 * Appelé au démarrage du backend — corrige silencieusement tout écart.
 */

const SUBSCRIPTION_CONFIG = require('../config/subscriptionConfig');

const syncPlanCommissions = async () => {
  try {
    const { PricingPlan } = require('../Models');

    // Seulement les plans actifs/en attente — ne jamais écraser les plans expirés/annulés
    // car ils font partie de l'historique financier des sellers
    const plans = await PricingPlan.find({
      status: { $nin: ['expired', 'cancelled'] }
    }).lean();
    if (!plans.length) return;

    const bulkOps = [];
    for (const plan of plans) {
      const correctRate = SUBSCRIPTION_CONFIG.getPlanCommission(plan.planType);
      if (plan.commission !== correctRate) {
        bulkOps.push({
          updateOne: {
            filter: { _id: plan._id },
            update: { $set: { commission: correctRate } },
          },
        });
      }
    }

    if (bulkOps.length > 0) {
      await PricingPlan.bulkWrite(bulkOps);
      console.log(`🔄 syncPlanCommissions: ${bulkOps.length} plan(s) corrigé(s) (commission → valeur SUBSCRIPTION_CONFIG)`);
    }
  } catch (err) {
    console.error('⚠️  syncPlanCommissions: erreur silencieuse —', err.message);
  }
};

module.exports = syncPlanCommissions;
