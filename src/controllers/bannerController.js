const Banner = require("../Banner_Model");
const cloudinary = require("../cloudinary");
const { validationResult } = require("express-validator");

// @desc    Obtenir toutes les bannières du vendeur
// @route   GET /api/marketing/banners
// @access  Private (Sellers)
exports.getBanners = async (req, res) => {
  try {
    const banners = await Banner.find({ sellerId: req.user.id });

    res.status(200).json({
      success: true,
      count: banners.length,
      data: banners,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des bannières",
    });
  }
};
exports.getBanners2 = async (req, res) => {
  try {
    const banners = await Banner.find({ sellerId: req.params.id });

    res.status(200).json({
      success: true,
      count: banners.length,
      data: banners,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des bannières",
    });
  }
};

// @desc    Obtenir une bannière spécifique
// @route   GET /api/marketing/banners/:id
// @access  Private (Sellers)
exports.getBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Bannière non trouvée",
      });
    }

    // Vérification que le vendeur est propriétaire de la bannière
    // if (banner.sellerId.toString() !== req.user.id) {
    //   return res.status(403).json({
    //     success: false,
    //     message: "Non autorisé à accéder à cette bannière",
    //   });
    // }

    res.status(200).json({
      success: true,
      data: banner,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération de la bannière",
    });
  }
};

// @desc    Créer une nouvelle bannière
// @route   POST /api/marketing/banners
// @access  Private (Sellers)
exports.createBanner = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  try {
    const { name, category, displayLocation, storeId } = req.body;

    // Vérification que le fichier a été uploadé
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Veuillez fournir une image pour la bannière",
      });
    }

    // Avec multer-storage-cloudinary, req.file contient déjà les informations Cloudinary
    const newBanner = await Banner.create({
      name,
      category,
      image: req.file.path, // URL sécurisée fournie par Cloudinary
      imagePublicId: req.file.filename, // ID public généré par Cloudinary
      displayLocation,
      storeId,
      sellerId: req.user.id,
    });

    res.status(201).json({
      success: true,
      data: newBanner,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la création de la bannière",
    });
  }
};

// @desc    Mettre à jour une bannière
// @route   PUT /api/marketing/banners/:id
// @access  Private (Sellers)
exports.updateBanner = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  try {
    let banner = await Banner.findById(req.params.id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Bannière non trouvée",
      });
    }

    // Vérification que le vendeur est propriétaire de la bannière
    if (banner.sellerId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Non autorisé à modifier cette bannière",
      });
    }

    const { name, category, displayLocation, active } = req.body;

    // Mise à jour des champs
    if (name) banner.name = name;
    if (category) banner.category = category;
    if (displayLocation) banner.displayLocation = displayLocation;
    if (active !== undefined) banner.active = active;

    // Si une nouvelle image est fournie
    if (req.file) {
      // Supprimer l'ancienne image sur Cloudinary
      if (banner.imagePublicId) {
        await cloudinary.uploader.destroy(banner.imagePublicId);
      }

      // L'image est déjà uploadée avec multer-storage-cloudinary
      banner.image = req.file.path;
      banner.imagePublicId = req.file.filename;
    }

    await banner.save();

    res.status(200).json({
      success: true,
      data: banner,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la mise à jour de la bannière",
    });
  }
};

// @desc    Supprimer une bannière
// @route   DELETE /api/marketing/banners/:id
// @access  Private (Sellers)
exports.deleteBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Bannière non trouvée",
      });
    }

    // Vérification que le vendeur est propriétaire de la bannière
    if (banner.sellerId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Non autorisé à supprimer cette bannière",
      });
    }

    // Supprimer l'image sur Cloudinary
    if (banner.imagePublicId) {
      await cloudinary.uploader.destroy(banner.imagePublicId);
    }

    await banner.remove();

    res.status(200).json({
      success: true,
      message: "Bannière supprimée avec succès",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la suppression de la bannière",
    });
  }
};

// @desc    Mettre à jour les statistiques de la bannière
// @route   PUT /api/marketing/banners/:id/stats
// @access  Private
exports.updateBannerStats = async (req, res) => {
  try {
    const { type } = req.body; // 'view' ou 'click'
    const banner = await Banner.findById(req.params.id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Bannière non trouvée",
      });
    }

    if (type === "view") {
      banner.stats.views += 1;
    } else if (type === "click") {
      banner.stats.clicks += 1;
    }

    await banner.save();

    res.status(200).json({
      success: true,
      data: banner.stats,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la mise à jour des statistiques",
    });
  }
};
