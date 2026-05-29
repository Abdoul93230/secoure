/**
 * One-time fix script: correct planType in PricingPlan for a specific seller.
 * Usage: node fix-plan-type.js --email="seller@example.com" --plan="Pro"
 *        node fix-plan-type.js --storeName="Ma Boutique"  --plan="Business"
 */

require('dotenv').config();
const mongoose = require('mongoose');

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace(/^--/, '').split('=');
  acc[key] = val;
  return acc;
}, {});

const { email, storeName, plan } = args;

if (!plan || !['Starter', 'Pro', 'Business'].includes(plan)) {
  console.error('Usage: node fix-plan-type.js --email="..." --plan="Pro|Starter|Business"');
  process.exit(1);
}
if (!email && !storeName) {
  console.error('Provide --email or --storeName to identify the seller.');
  process.exit(1);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const SellerRequest = mongoose.model(
    'SellerRequest',
    new mongoose.Schema({}, { strict: false, collection: 'sellerrequests' })
  );
  const PricingPlan = mongoose.model(
    'PricingPlan',
    new mongoose.Schema({}, { strict: false, collection: 'pricingplans' })
  );

  const query = email ? { email } : { storeName };
  const seller = await SellerRequest.findOne(query).lean();

  if (!seller) {
    console.error(`No seller found with ${JSON.stringify(query)}`);
    process.exit(1);
  }

  console.log(`Found seller: ${seller.storeName} (${seller.email}) — id: ${seller._id}`);

  const plan_doc = await PricingPlan.findOne({
    storeId: seller._id,
    status: { $in: ['trial', 'active'] }
  }).lean();

  if (!plan_doc) {
    console.error('No active/trial PricingPlan found for this seller.');
    process.exit(1);
  }

  console.log(`Current PricingPlan planType: "${plan_doc.planType}" (id: ${plan_doc._id})`);

  if (plan_doc.planType === plan) {
    console.log(`Already set to "${plan}" — nothing to do.`);
    process.exit(0);
  }

  const result = await PricingPlan.updateOne(
    { _id: plan_doc._id },
    { $set: { planType: plan } }
  );

  console.log(`Updated: ${result.modifiedCount} document(s). planType is now "${plan}".`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
