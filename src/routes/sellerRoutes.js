const express = require('express');
const router = express.Router();
const sellerController = require('../storeController');
const {createSellerWithSubscription, loginWithSubscriptionCheck} = require('../controllers/enhancedSellerController');
const middelware = require('../auth/middelware');

// Seller CRUD
router.post('/createSeller', 
  middelware.uploadsecond.fields([
    { name: 'ownerIdentity', maxCount: 1 },
    { name: 'logo', maxCount: 1 },
  ]),
createSellerWithSubscription
);

router.get('/getSeller/:Id', sellerController.getSeller);
router.get('/getSellers/', sellerController.getSellers);
router.put('/updateSeller/:id',
  middelware.uploadsecond.fields([
    { name: 'ownerIdentity', maxCount: 1 },
    { name: 'logo', maxCount: 1 },
  ]),
  sellerController.updateSeller
);
router.delete('/deleteSeller/:id', sellerController.deleteSeller);

// Seller search
router.get('/findSellerByName/:name', sellerController.findSellerByName);

// Seller authentication and verification
router.post('/SellerLogin', loginWithSubscriptionCheck);
router.get('/Sellerverify/:id', middelware.authSeller, sellerController.verifyToken);

// Seller validation
router.put('/validerDemandeVendeur/:id', sellerController.validerDemandeVendeur);

// Seller image management
router.put('/setImage/:id', middelware.upload.single('image'), sellerController.setImage);

// Seller orders
router.get('/seller-orders/:Id', sellerController.seller_orders);
router.put('/seller-orders/:orderId/validate/:sellerId', sellerController.validate_seller_products);
// 🔥 NOUVEAU: Validation individuelle par produit
router.put('/seller-orders/:orderId/validate-product/:sellerId/:productId', sellerController.validate_individual_product);
router.put('/seller-orders/:orderId/toggle-product/:sellerId/:productId/:productIndex', sellerController.toggle_product_validation);

// Pricing plans
router.post('/pricing-plans', sellerController.createPricingPlan);
router.get('/pricing-plans/:planId', sellerController.getPricingPlan);
router.get('/stores/:storeId/pricing-plan', sellerController.getStorePlan);
router.put('/pricing-plans/:planId', sellerController.updatePricingPlan);
router.delete('/pricing-plans/:planId', sellerController.deletePricingPlan);
router.get('/pricing-plans', sellerController.listPricingPlans);

module.exports = router;