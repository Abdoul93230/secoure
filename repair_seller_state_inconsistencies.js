require('dotenv').config();
const mongoose = require('mongoose');
const { SellerRequest, Produit, PricingPlan } = require('./src/Models');

mongoose.set('strictQuery', true);

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trial']);

const args = process.argv.slice(2);
const applyMode = args.includes('--apply');
const sellerArg = args.find((arg) => arg.startsWith('--seller='));
const sellerId = sellerArg ? sellerArg.split('=')[1] : null;

const toKey = (value) => String(value || '');
const normalizeStatus = (value) => String(value || '').toLowerCase();

async function getSellerEligibilityMap(sellerIds) {
  const now = new Date();
  const sellers = await SellerRequest.find({ _id: { $in: sellerIds } })
    .select('_id isvalid subscriptionStatus')
    .lean();

  const validPlans = await PricingPlan.find({
    storeId: { $in: sellerIds },
    status: { $in: Array.from(ACTIVE_SUBSCRIPTION_STATUSES) },
    endDate: { $gte: now },
  })
    .select('_id storeId status endDate')
    .lean();

  const hasValidPlan = new Set(validPlans.map((p) => toKey(p.storeId)));
  const eligibility = new Map();

  for (const seller of sellers) {
    const sid = toKey(seller._id);
    const subStatus = normalizeStatus(seller.subscriptionStatus);
    const statusAllows = !subStatus || ACTIVE_SUBSCRIPTION_STATUSES.has(subStatus);
    const eligible = Boolean(seller.isvalid && hasValidPlan.has(sid) && statusAllows);
    eligibility.set(sid, eligible);
  }

  return eligibility;
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI manquant dans .env');
  }

  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const sellerFilter = sellerId ? { _id: sellerId } : {};
  const sellers = await SellerRequest.find(sellerFilter).select('_id storeName').lean();
  const sellerIds = sellers.map((s) => s._id);

  if (!sellerIds.length) {
    console.log('Aucun seller trouvé avec ce filtre.');
    return;
  }

  const eligibleMap = await getSellerEligibilityMap(sellerIds);

  const allProducts = await Produit.find({
    Clefournisseur: { $in: sellerIds },
    isDeleted: false,
  })
    .select('_id name Clefournisseur isPublished isValidated subscriptionControl')
    .lean();

  const forcedHiddenButValidated = [];
  const publishedNotValidated = [];
  const blockedSellerPublished = [];
  const eligibleSellerForcedHidden = [];

  for (const product of allProducts) {
    const sid = toKey(product.Clefournisseur);
    const sellerEligible = Boolean(eligibleMap.get(sid));
    const forcedHidden = Boolean(product.subscriptionControl?.forcedHidden);

    if (forcedHidden && product.isValidated === true) {
      forcedHiddenButValidated.push(product._id);
    }

    if (product.isPublished === 'Published' && product.isValidated !== true) {
      publishedNotValidated.push(product._id);
    }

    if (!sellerEligible && product.isPublished === 'Published') {
      blockedSellerPublished.push(product._id);
    }

    if (sellerEligible && forcedHidden) {
      eligibleSellerForcedHidden.push(product._id);
    }
  }

  const plan = {
    forced_hidden_but_validated_fix: forcedHiddenButValidated.length,
    published_product_not_validated_fix: publishedNotValidated.length,
    blocked_seller_published_fix: blockedSellerPublished.length,
    eligible_seller_forced_hidden_fix: eligibleSellerForcedHidden.length,
  };

  console.log('\n=== Plan de correction ===');
  console.table(
    Object.entries(plan).map(([type, count]) => ({ type, count }))
  );

  if (!applyMode) {
    console.log('\nMode DRY-RUN: aucune modification appliquée.');
    console.log('Relancer avec --apply pour corriger réellement.');
    return;
  }

  const results = {
    forced_hidden_but_validated_fix: 0,
    published_product_not_validated_fix: 0,
    blocked_seller_published_fix: 0,
    eligible_seller_forced_hidden_fix: 0,
  };

  if (forcedHiddenButValidated.length) {
    const r = await Produit.updateMany(
      { _id: { $in: forcedHiddenButValidated } },
      { $set: { isValidated: false } }
    );
    results.forced_hidden_but_validated_fix = r.modifiedCount || 0;
  }

  if (publishedNotValidated.length) {
    const r = await Produit.updateMany(
      { _id: { $in: publishedNotValidated } },
      { $set: { isValidated: true } }
    );
    results.published_product_not_validated_fix = r.modifiedCount || 0;
  }

  if (blockedSellerPublished.length) {
    const r = await Produit.updateMany(
      { _id: { $in: blockedSellerPublished } },
      {
        $set: {
          isPublished: 'UnPublished',
          isValidated: false,
          'subscriptionControl.forcedHidden': true,
          'subscriptionControl.reason': 'consistency_repair_blocked_seller',
          'subscriptionControl.hiddenAt': new Date(),
        },
      }
    );
    results.blocked_seller_published_fix = r.modifiedCount || 0;
  }

  if (eligibleSellerForcedHidden.length) {
    const r = await Produit.updateMany(
      { _id: { $in: eligibleSellerForcedHidden } },
      {
        $set: {
          isPublished: 'Published',
          isValidated: true,
          'subscriptionControl.restoredAt': new Date(),
        },
        $unset: {
          'subscriptionControl.forcedHidden': 1,
          'subscriptionControl.reason': 1,
          'subscriptionControl.hiddenAt': 1,
        },
      }
    );
    results.eligible_seller_forced_hidden_fix = r.modifiedCount || 0;
  }

  console.log('\n=== Corrections appliquées ===');
  console.table(
    Object.entries(results).map(([type, modifiedCount]) => ({ type, modifiedCount }))
  );
}

main()
  .catch((error) => {
    console.error('Erreur réparation:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch (error) {
      // no-op
    }
  });
