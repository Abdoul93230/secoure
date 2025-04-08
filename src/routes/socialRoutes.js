const express = require("express");
const router = express.Router();
const socialController = require("../controllers/socialController");
const { authenticate } = require("../auth/middelware/auth"); // Middleware d'authentification

// Routes pour suivre/ne plus suivre un vendeur
router.post(
  "/sellers/:sellerId/follow",
  authenticate,
  socialController.followSeller
);
router.delete(
  "/sellers/:sellerId/follow",
  authenticate,
  socialController.unfollowSeller
);
router.get("/sellers/:sellerId/followers", socialController.getSellerFollowers);

// Routes pour les avis
router.post(
  "/sellers/:sellerId/reviews",
  authenticate,
  socialController.createReview
);
router.put("/reviews/:reviewId", authenticate, socialController.updateReview);
router.delete(
  "/reviews/:reviewId",
  authenticate,
  socialController.deleteReview
);
router.get("/sellers/:sellerId/reviews", socialController.getSellerReviews);

// Routes pour les likes d'avis
router.post(
  "/reviews/:reviewId/like",
  authenticate,
  socialController.likeReview
);
router.delete(
  "/reviews/:reviewId/like",
  authenticate,
  socialController.unlikeReview
);

// Routes pour les likes de boutique
router.post(
  "/sellers/:sellerId/like",
  authenticate,
  socialController.likeStore
);
router.delete(
  "/sellers/:sellerId/like",
  authenticate,
  socialController.unlikeStore
);
router.get(
  "/sellers/:sellerId/like",
  authenticate,
  socialController.checkStoreLike
);

// Stats sociales
router.get("/sellers/:sellerId/stats", socialController.getSellerSocialStats);

module.exports = router;
