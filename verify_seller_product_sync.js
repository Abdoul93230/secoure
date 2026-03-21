require('dotenv').config();
const mongoose = require('mongoose');
const { SellerRequest, Produit } = require('./src/Models');
const {
  suspendSellerProducts,
  restoreSellerProductsIfEligible
} = require('./src/utils/sellerProductSync');

const isApplyMode = process.argv.includes('--apply');
const sellerIdArg = process.argv.find((arg) => arg.startsWith('--seller='));
const singleSellerId = sellerIdArg ? sellerIdArg.split('=')[1] : null;

const ACTIVE_SELLER_STATUSES = new Set(['active', 'trial']);

const isSellerExpectedSuspended = (seller) => {
  if (!seller) return false;
  if (!seller.isvalid) return true;
  if (seller.subscriptionStatus && !ACTIVE_SELLER_STATUSES.has(seller.subscriptionStatus)) return true;
  return false;
};

const isSellerExpectedActive = (seller) => {
  if (!seller) return false;
  if (!seller.isvalid) return false;
  if (!seller.subscriptionStatus) return true;
  return ACTIVE_SELLER_STATUSES.has(seller.subscriptionStatus);
};

async function getProductStatsBySeller(sellerId) {
  const stats = await Produit.aggregate([
    { $match: { Clefournisseur: new mongoose.Types.ObjectId(sellerId), isDeleted: false } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        published: { $sum: { $cond: [{ $eq: ['$isPublished', 'Published'] }, 1, 0] } },
        unpublished: { $sum: { $cond: [{ $eq: ['$isPublished', 'UnPublished'] }, 1, 0] } },
        forcedHidden: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$isPublished', 'UnPublished'] },
                  { $eq: ['$subscriptionControl.forcedHidden', true] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    }
  ]);

  return stats[0] || { total: 0, published: 0, unpublished: 0, forcedHidden: 0 };
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI manquant dans les variables d\'environnement');
  }

  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const sellerQuery = singleSellerId ? { _id: singleSellerId } : {};
  const sellers = await SellerRequest.find(sellerQuery)
    .select('_id storeName isvalid subscriptionStatus suspensionReason')
    .lean();

  console.log(`Mode: ${isApplyMode ? 'APPLY (corrections reelles)' : 'DRY-RUN (audit uniquement)'}`);
  console.log(`Sellers analyses: ${sellers.length}`);

  const issues = [];
  const actions = [];

  for (const seller of sellers) {
    const stats = await getProductStatsBySeller(seller._id);
    const expectedSuspended = isSellerExpectedSuspended(seller);
    const expectedActive = isSellerExpectedActive(seller);

    if (expectedSuspended && stats.published > 0) {
      issues.push({
        sellerId: seller._id.toString(),
        storeName: seller.storeName,
        type: 'suspended_with_published_products',
        publishedCount: stats.published,
      });

      if (isApplyMode) {
        const result = await suspendSellerProducts(seller._id, 'consistency_audit_suspension');
        actions.push({
          sellerId: seller._id.toString(),
          action: 'suspend_products',
          modifiedCount: result.modifiedCount || 0
        });
      }
    }

    if (expectedActive && stats.forcedHidden > 0) {
      issues.push({
        sellerId: seller._id.toString(),
        storeName: seller.storeName,
        type: 'active_with_forced_hidden_products',
        forcedHiddenCount: stats.forcedHidden,
      });

      if (isApplyMode) {
        const result = await restoreSellerProductsIfEligible(seller._id);
        actions.push({
          sellerId: seller._id.toString(),
          action: 'restore_products',
          modifiedCount: result.modifiedCount || 0,
          restored: !!result.restored,
          reason: result.reason || null
        });
      }
    }

    if (seller.subscriptionStatus && ACTIVE_SELLER_STATUSES.has(seller.subscriptionStatus) && seller.suspensionReason) {
      issues.push({
        sellerId: seller._id.toString(),
        storeName: seller.storeName,
        type: 'active_status_with_suspension_reason',
        suspensionReason: seller.suspensionReason
      });

      if (isApplyMode) {
        await SellerRequest.findByIdAndUpdate(seller._id, {
          suspensionReason: null,
          suspensionDate: null
        });
        actions.push({
          sellerId: seller._id.toString(),
          action: 'clear_stale_suspension_reason',
          modifiedCount: 1
        });
      }
    }
  }

  const byType = issues.reduce((acc, issue) => {
    acc[issue.type] = (acc[issue.type] || 0) + 1;
    return acc;
  }, {});

  console.log('\n=== Resume incoherences ===');
  console.table(Object.entries(byType).map(([type, count]) => ({ type, count })));

  if (issues.length > 0) {
    console.log('\n=== Exemples (max 30) ===');
    console.table(issues.slice(0, 30));
    if (issues.length > 30) {
      console.log(`... ${issues.length - 30} autres incoherences non affichees`);
    }
  } else {
    console.log('Aucune incoherence detectee.');
  }

  if (isApplyMode) {
    console.log('\n=== Corrections appliquees ===');
    if (actions.length > 0) {
      console.table(actions.slice(0, 30));
      if (actions.length > 30) {
        console.log(`... ${actions.length - 30} autres actions non affichees`);
      }
    } else {
      console.log('Aucune correction necessaire.');
    }
  } else {
    console.log('\nRelancer avec --apply pour corriger automatiquement.');
  }
}

main()
  .catch((error) => {
    console.error('Erreur audit seller/produits:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch (error) {
      // no-op
    }
  });
