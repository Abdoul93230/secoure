const { Produit, SellerRequest } = require('../Models');

const SUBSCRIPTION_REASON_REGEX = /(abonnement|subscription|grace|expire|expiration|paiement|reactivation)/i;

const suspendSellerProducts = async (sellerId, reason = 'account_suspension') => {
  if (!sellerId) return { matchedCount: 0, modifiedCount: 0 };

  const result = await Produit.updateMany(
    {
      Clefournisseur: sellerId,
      isDeleted: false,
      isPublished: 'Published'
    },
    {
      $set: {
        isPublished: 'UnPublished',
        'subscriptionControl.forcedHidden': true,
        'subscriptionControl.reason': reason,
        'subscriptionControl.hiddenAt': new Date()
      }
    }
  );

  return {
    matchedCount: result.matchedCount || 0,
    modifiedCount: result.modifiedCount || 0
  };
};

const canRestoreBySellerState = (seller) => {
  if (!seller || !seller.isvalid) return false;

  if (seller.subscriptionStatus && !['active', 'trial'].includes(seller.subscriptionStatus)) {
    return false;
  }

  if (seller.suspensionReason && !SUBSCRIPTION_REASON_REGEX.test(seller.suspensionReason)) {
    return false;
  }

  return true;
};

const restoreSellerProductsIfEligible = async (sellerId) => {
  if (!sellerId) return { restored: false, reason: 'missing_seller_id', modifiedCount: 0 };

  const seller = await SellerRequest.findById(sellerId).lean();
  if (!canRestoreBySellerState(seller)) {
    return { restored: false, reason: 'seller_not_eligible', modifiedCount: 0 };
  }

  const result = await Produit.updateMany(
    {
      Clefournisseur: sellerId,
      isDeleted: false,
      isPublished: 'UnPublished',
      'subscriptionControl.forcedHidden': true
    },
    {
      $set: {
        isPublished: 'Published',
        'subscriptionControl.restoredAt': new Date()
      },
      $unset: {
        'subscriptionControl.forcedHidden': 1,
        'subscriptionControl.reason': 1,
        'subscriptionControl.hiddenAt': 1
      }
    }
  );

  return {
    restored: true,
    modifiedCount: result.modifiedCount || 0
  };
};

module.exports = {
  suspendSellerProducts,
  restoreSellerProductsIfEligible
};
