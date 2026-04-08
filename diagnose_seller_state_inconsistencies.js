require('dotenv').config();
const mongoose = require('mongoose');
const { SellerRequest, Produit, PricingPlan } = require('./src/Models');

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trial']);

const args = process.argv.slice(2);
const sellerArg = args.find((arg) => arg.startsWith('--seller='));
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const jsonMode = args.includes('--json');

const sellerId = sellerArg ? sellerArg.split('=')[1] : null;
const detailsLimit = Number.isFinite(Number(limitArg?.split('=')[1]))
  ? Math.max(1, Number(limitArg.split('=')[1]))
  : 80;

const toKey = (value) => String(value || '');
const normalizeStatus = (value) => String(value || '').toLowerCase();

function addIssue(issues, issue) {
  issues.push({
    severity: issue.severity || 'warning',
    type: issue.type,
    sellerId: issue.sellerId,
    storeName: issue.storeName || '-',
    productId: issue.productId || null,
    productName: issue.productName || null,
    message: issue.message,
    context: issue.context || {},
  });
}

function summarizeIssues(issues) {
  return issues.reduce((acc, issue) => {
    acc[issue.type] = (acc[issue.type] || 0) + 1;
    return acc;
  }, {});
}

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI manquant dans .env');
  }

  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const sellerFilter = sellerId ? { _id: sellerId } : {};
  const sellers = await SellerRequest.find(sellerFilter)
    .select('_id storeName isvalid subscriptionStatus subscriptionId suspensionReason')
    .lean();

  const now = new Date();
  const validPlans = await PricingPlan.find({
    status: { $in: Array.from(ACTIVE_SUBSCRIPTION_STATUSES) },
    endDate: { $gte: now },
  })
    .select('_id storeId status endDate')
    .lean();

  const validPlanBySeller = new Map();
  for (const plan of validPlans) {
    const key = toKey(plan.storeId);
    const previous = validPlanBySeller.get(key);
    if (!previous || new Date(plan.endDate) > new Date(previous.endDate)) {
      validPlanBySeller.set(key, plan);
    }
  }

  const sellerIds = sellers.map((s) => s._id);
  const products = await Produit.find({
    Clefournisseur: { $in: sellerIds },
  })
    .select('_id name Clefournisseur isDeleted isPublished isValidated subscriptionControl')
    .lean();

  const productsBySeller = new Map();
  for (const product of products) {
    const key = toKey(product.Clefournisseur);
    if (!productsBySeller.has(key)) productsBySeller.set(key, []);
    productsBySeller.get(key).push(product);
  }

  const issues = [];

  for (const seller of sellers) {
    const sid = toKey(seller._id);
    const storeName = seller.storeName || '(sans nom)';
    const sellerProducts = productsBySeller.get(sid) || [];

    const normalizedSubStatus = normalizeStatus(seller.subscriptionStatus);
    const hasValidPlan = validPlanBySeller.has(sid);
    const statusAllowsActive = !normalizedSubStatus || ACTIVE_SUBSCRIPTION_STATUSES.has(normalizedSubStatus);
    const sellerEligible = Boolean(seller.isvalid && hasValidPlan && statusAllowsActive);

    if (seller.isvalid && !hasValidPlan) {
      addIssue(issues, {
        severity: 'critical',
        type: 'seller_active_without_valid_plan',
        sellerId: sid,
        storeName,
        message: 'Seller actif sans abonnement valide (active/trial non expiré).',
        context: {
          isvalid: seller.isvalid,
          subscriptionStatus: seller.subscriptionStatus,
          subscriptionId: seller.subscriptionId || null,
        },
      });
    }

    if (ACTIVE_SUBSCRIPTION_STATUSES.has(normalizedSubStatus) && !hasValidPlan) {
      addIssue(issues, {
        severity: 'critical',
        type: 'seller_subscription_status_not_backed_by_plan',
        sellerId: sid,
        storeName,
        message: 'subscriptionStatus indique actif/essai sans plan valide en base.',
        context: {
          subscriptionStatus: seller.subscriptionStatus,
          subscriptionId: seller.subscriptionId || null,
        },
      });
    }

    let publishedCount = 0;
    let forcedHiddenCount = 0;

    for (const product of sellerProducts) {
      if (product.isDeleted) {
        if (product.isPublished === 'Published') {
          addIssue(issues, {
            severity: 'warning',
            type: 'deleted_product_still_published',
            sellerId: sid,
            storeName,
            productId: toKey(product._id),
            productName: product.name || '-',
            message: 'Produit supprimé mais encore publié.',
          });
        }
        continue;
      }

      const forcedHidden = Boolean(product.subscriptionControl?.forcedHidden);

      if (product.isPublished === 'Published') {
        publishedCount += 1;
      }
      if (forcedHidden) {
        forcedHiddenCount += 1;
      }

      if (forcedHidden && product.isPublished === 'Published') {
        addIssue(issues, {
          severity: 'critical',
          type: 'forced_hidden_but_published',
          sellerId: sid,
          storeName,
          productId: toKey(product._id),
          productName: product.name || '-',
          message: 'Produit marqué forcedHidden mais encore publié.',
        });
      }

      if (forcedHidden && product.isValidated === true) {
        addIssue(issues, {
          severity: 'warning',
          type: 'forced_hidden_but_validated',
          sellerId: sid,
          storeName,
          productId: toKey(product._id),
          productName: product.name || '-',
          message: 'Produit masqué par abonnement mais isValidated reste à true.',
        });
      }

      if (product.isPublished === 'Published' && product.isValidated !== true) {
        addIssue(issues, {
          severity: 'warning',
          type: 'published_product_not_validated',
          sellerId: sid,
          storeName,
          productId: toKey(product._id),
          productName: product.name || '-',
          message: 'Produit publié avec isValidated différent de true.',
          context: { isValidated: product.isValidated },
        });
      }
    }

    if (!sellerEligible && publishedCount > 0) {
      addIssue(issues, {
        severity: 'critical',
        type: 'blocked_seller_has_published_products',
        sellerId: sid,
        storeName,
        message: 'Seller non éligible mais possède des produits publiés.',
        context: {
          publishedCount,
          isvalid: seller.isvalid,
          subscriptionStatus: seller.subscriptionStatus,
          hasValidPlan,
        },
      });
    }

    if (sellerEligible && forcedHiddenCount > 0) {
      addIssue(issues, {
        severity: 'warning',
        type: 'eligible_seller_still_has_forced_hidden_products',
        sellerId: sid,
        storeName,
        message: 'Seller éligible mais certains produits restent forcés cachés.',
        context: { forcedHiddenCount },
      });
    }
  }

  const summary = summarizeIssues(issues);

  if (jsonMode) {
    console.log(JSON.stringify({
      scanned: {
        sellers: sellers.length,
        products: products.length,
      },
      summary,
      issues: issues.slice(0, detailsLimit),
      truncated: issues.length > detailsLimit,
      totalIssues: issues.length,
    }, null, 2));
    return;
  }

  console.log('\n=== Diagnostic Incoherences Seller/Abonnement/Produits ===');
  console.log(`Sellers analyses: ${sellers.length}`);
  console.log(`Produits analyses: ${products.length}`);
  console.log(`Incoherences: ${issues.length}`);

  if (issues.length === 0) {
    console.log('Aucune incoherence detectee.');
    return;
  }

  console.log('\n--- Resume par type ---');
  console.table(Object.entries(summary).map(([type, count]) => ({ type, count })));

  console.log(`\n--- Details (max ${detailsLimit}) ---`);
  console.table(
    issues.slice(0, detailsLimit).map((issue) => ({
      severity: issue.severity,
      type: issue.type,
      sellerId: issue.sellerId,
      storeName: issue.storeName,
      productId: issue.productId || '-',
      productName: issue.productName || '-',
      message: issue.message,
    }))
  );

  if (issues.length > detailsLimit) {
    console.log(`... ${issues.length - detailsLimit} incoherences supplementaires non affichees.`);
  }

  console.log('\nConseil: relancer cible sur un vendeur avec --seller=<sellerId>.');
}

run()
  .catch((error) => {
    console.error('Erreur diagnostic:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch (error) {
      // no-op
    }
  });
