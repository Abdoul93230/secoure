const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const sellerController = require('../storeController');
const {createSellerWithSubscription, loginWithSubscriptionCheck} = require('../controllers/enhancedSellerController');
const middelware = require('../auth/middelware');
const { sellerOrAdmin } = require('../auth/ownership');

// SÉCURITÉ : toute modification d'une boutique exige son jeton (ou celui d'un admin)
const ownStore = (pick) => sellerOrAdmin(pick);
const ownStoreOrAgent = (pick) => sellerOrAdmin(pick, { allowAgent: true });

const sellerAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: "Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes." },
});

// Seller CRUD
router.post('/createSeller', 
  middelware.uploadsecond.fields([
    { name: 'ownerIdentity', maxCount: 1 },
    { name: 'logo', maxCount: 1 },
  ]),
createSellerWithSubscription
);

router.get('/getSeller/:Id', sellerController.getSeller);
router.get('/getSellerClients/:Id', sellerController.getSellerClients);
router.get('/getSellerByName/:name', sellerController.getSellerByName);
router.get('/getSellerByNameClients/:name', sellerController.getSellerByNameClients);
// Liste complète des vendeurs (y compris non validés) : réservée à l'admin
router.get('/getSellers/', middelware.authAdmin, sellerController.getSellers);
router.get('/getSellersClients/', sellerController.getSellersClients);
router.put('/updateSeller/:id',
  ownStore((req) => req.params.id),
  middelware.uploadsecond.fields([
    { name: 'ownerIdentity', maxCount: 1 },
    { name: 'logo', maxCount: 1 },
  ]),
  sellerController.updateSeller
);
router.delete('/deleteSeller/:id', middelware.authAdmin, sellerController.deleteSeller);

// Seller search
router.get('/findSellerByName/:name', sellerController.findSellerByName);

// Seller authentication and verification
router.post('/SellerLogin', sellerAuthLimiter, loginWithSubscriptionCheck);
router.get('/Sellerverify/:id', middelware.authSeller, sellerController.verifyToken);

// Seller validation
router.put('/validerDemandeVendeur/:id', middelware.authAdmin, sellerController.validerDemandeVendeur);

// Seller image management
router.put('/setImage/:id', ownStore((req) => req.params.id), middelware.upload.single('image'), sellerController.setImage);

// Seller orders
router.get('/seller-orders/:Id', ownStoreOrAgent((req) => req.params.Id), sellerController.seller_orders);
router.put('/seller-orders/:orderId/validate/:sellerId', ownStoreOrAgent((req) => req.params.sellerId), sellerController.validate_seller_products);
// 🔥 NOUVEAU: Validation individuelle par produit
router.put('/seller-orders/:orderId/validate-product/:sellerId/:productId', ownStoreOrAgent((req) => req.params.sellerId), sellerController.validate_individual_product);
router.put('/seller-orders/:orderId/toggle-product/:sellerId/:productId/:productIndex', ownStoreOrAgent((req) => req.params.sellerId), sellerController.toggle_product_validation);

// Pricing plans
router.post('/pricing-plans', middelware.authAdmin, sellerController.createPricingPlan);
router.get('/pricing-plans/:planId', sellerController.getPricingPlan);
router.get('/stores/:storeId/pricing-plan', sellerController.getStorePlan);
router.put('/pricing-plans/:planId', middelware.authAdmin, sellerController.updatePricingPlan);
router.delete('/pricing-plans/:planId', middelware.authAdmin, sellerController.deletePricingPlan);
router.get('/pricing-plans', sellerController.listPricingPlans);

// Routes pour le système de commission
router.get('/seller-info/:sellerId', ownStoreOrAgent((req) => req.params.sellerId), sellerController.getSellerInfo);
router.get('/pricing-plan/:planId', sellerController.getPricingPlanById);

// Push notifications — enregistrement du token Expo
router.post('/seller-push-token', middelware.authSeller, sellerController.saveSellerPushToken);

// Notifications vendeur — historique + mark-read
router.get('/seller-notifications/:sellerId',  middelware.authSeller, sellerController.getSellerNotifications);
router.put('/seller-notifications/:sellerId/read', middelware.authSeller, sellerController.markSellerNotificationsRead);

module.exports = router;