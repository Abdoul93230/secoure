/**
 * Script de migration: corrige les valeurs commission dans les PricingPlan en DB
 * pour qu'elles correspondent aux valeurs de SUBSCRIPTION_CONFIG (source de vérité).
 *
 * Usage: node fix_plan_commissions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const SUBSCRIPTION_CONFIG = require('./src/config/subscriptionConfig');

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI non défini dans .env');
    process.exit(1);
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('✅ Connecté à MongoDB');

  const PricingPlan = mongoose.model('PricingPlan', new mongoose.Schema({}, { strict: false }));

  const plans = await PricingPlan.find({}).lean();
  console.log(`🔍 ${plans.length} plan(s) trouvé(s)\n`);

  let fixed = 0;
  let skipped = 0;

  for (const plan of plans) {
    const correctRate = SUBSCRIPTION_CONFIG.getPlanCommission(plan.planType);
    if (plan.commission !== correctRate) {
      await PricingPlan.updateOne(
        { _id: plan._id },
        { $set: { commission: correctRate } }
      );
      console.log(`  ✏️  Plan ${plan._id} (${plan.planType}, status=${plan.status}): ${plan.commission}% → ${correctRate}%`);
      fixed++;
    } else {
      skipped++;
    }
  }

  console.log(`\n✅ Terminé: ${fixed} corrigé(s), ${skipped} déjà correct(s)`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('❌ Erreur:', err.message);
  process.exit(1);
});
