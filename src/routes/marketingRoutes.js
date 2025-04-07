// Dans routes/marketingRoutes.js, remplacez la configuration de multer:
const express = require("express");
const router = express.Router();
const { protect, isSeller } = require("../auth/middelware/auth");
const { check } = require("express-validator");
const multer = require("multer");
const cloudinary = require("../cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

// Configuration de Multer pour télécharger directement vers Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "banners",
    resource_type: "image",
  },
});

const fileFilter = (req, file, cb) => {
  // Accepter uniquement les images
  if (file.mimetype.startsWith("image")) {
    cb(null, true);
  } else {
    cb(new Error("Seuls les fichiers image sont autorisés"), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
  fileFilter: fileFilter,
});

// Import des contrôleurs
const {
  getBanners,
  getBanner,
  createBanner,
  updateBanner,
  deleteBanner,
  updateBannerStats,
  getBanners2,
} = require("../controllers/bannerController");

const {
  getEmailCampaigns,
  getEmailCampaign,
  createEmailCampaign,
  updateEmailCampaign,
  deleteEmailCampaign,
} = require("../controllers/emailCampaignController");

// Routes pour les bannières
router
  .route("/banners")
  .get(protect, isSeller, getBanners)
  .post(
    protect,
    isSeller,
    upload.single("image"),
    [
      check("name", "Le nom est requis").not().isEmpty(),
      check("category", "La catégorie est requise").not().isEmpty(),
      check("storeId", "L'ID du magasin est requis").not().isEmpty(),
    ],
    createBanner
  );

router
  .route("/banners/:id")
  .get(protect, isSeller, getBanner)

  .put(protect, isSeller, upload.single("image"), updateBanner)
  .delete(protect, isSeller, deleteBanner);

router.route("/Bannerss/:id").get(getBanners2);
router.route("/banners/:id/stats").put(updateBannerStats);

// Routes pour les campagnes email
router
  .route("/emails")
  .get(protect, isSeller, getEmailCampaigns)
  .post(
    protect,
    isSeller,
    [
      check("title", "Le titre est requis").not().isEmpty(),
      check("subject", "L'objet est requis").not().isEmpty(),
      check("content", "Le contenu est requis").not().isEmpty(),
      check("recipients", "Les destinataires sont requis").not().isEmpty(),
      check("storeId", "L'ID du magasin est requis").not().isEmpty(),
    ],
    createEmailCampaign
  );

router
  .route("/emails/:id")
  .get(protect, isSeller, getEmailCampaign)
  .put(protect, isSeller, updateEmailCampaign)
  .delete(protect, isSeller, deleteEmailCampaign);

module.exports = router;
