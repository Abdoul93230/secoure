const { SellerRequest } = require("../Models");
const Review = require("../models/Review");
const StoreLike = require("../models/StoreLike");
const mongoose = require("mongoose");

// Middleware pour vérifier si le vendeur existe
const sellerExists = async (req, res, next) => {
  try {
    const seller = await SellerRequest.findById(req.params.sellerId);
    if (!seller) {
      return res
        .status(404)
        .json({ success: false, message: "Vendeur non trouvé" });
    }
    req.seller = seller;
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Suivre un vendeur
exports.followSeller = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const userId = req.user._id; // Suppose que l'utilisateur est identifié par middleware d'authentification

    const seller = await SellerRequest.findById(sellerId);
    if (!seller) {
      return res
        .status(404)
        .json({ success: false, message: "Vendeur non trouvé" });
    }

    // Vérifier si l'utilisateur suit déjà ce vendeur
    if (seller.followers.includes(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Vous suivez déjà ce vendeur" });
    }

    // Ajouter l'utilisateur aux followers
    seller.followers.push(userId);
    seller.followersCount += 1;
    await seller.save();

    res
      .status(200)
      .json({ success: true, message: "Vous suivez maintenant ce vendeur" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Ne plus suivre un vendeur
exports.unfollowSeller = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const userId = req.user._id;

    const seller = await SellerRequest.findById(sellerId);
    if (!seller) {
      return res
        .status(404)
        .json({ success: false, message: "Vendeur non trouvé" });
    }

    // Vérifier si l'utilisateur suit ce vendeur
    if (!seller.followers.includes(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Vous ne suivez pas ce vendeur" });
    }

    // Retirer l'utilisateur des followers
    seller.followers = seller.followers.filter((id) => !id.equals(userId));
    seller.followersCount -= 1;
    await seller.save();

    res
      .status(200)
      .json({ success: true, message: "Vous ne suivez plus ce vendeur" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Obtenir la liste des followers d'un vendeur
exports.getSellerFollowers = async (req, res) => {
  try {
    const { sellerId } = req.params;

    const seller = await SellerRequest.findById(sellerId).populate(
      "followers",
      "name email"
    ); // Ajuste les champs selon ton modèle User

    if (!seller) {
      return res
        .status(404)
        .json({ success: false, message: "Vendeur non trouvé" });
    }

    res.status(200).json({
      success: true,
      followersCount: seller.followersCount,
      followers: seller.followers,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Créer un avis/review
exports.createReview = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user._id;

    // Vérifier si l'utilisateur a déjà laissé un avis
    const existingReview = await Review.findOne({
      seller: sellerId,
      user: userId,
    });
    // if (existingReview) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Vous avez déjà laissé un avis pour ce vendeur",
    //   });
    // }

    // Créer le nouvel avis
    const newReview = new Review({
      seller: sellerId,
      user: userId,
      rating,
      comment,
    });

    await newReview.save();

    // Mettre à jour la note moyenne du vendeur
    const seller = await SellerRequest.findById(sellerId);
    const allReviews = await Review.find({ seller: sellerId });

    const totalRating = allReviews.reduce(
      (sum, review) => sum + review.rating,
      0
    );
    seller.rating = totalRating / allReviews.length;
    seller.reviewsCount = allReviews.length;

    await seller.save();

    res.status(201).json({ success: true, review: newReview });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Mettre à jour un avis
exports.updateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user._id;

    // Trouver l'avis et vérifier qu'il appartient à l'utilisateur
    const review = await Review.findById(reviewId);
    if (!review) {
      return res
        .status(404)
        .json({ success: false, message: "Avis non trouvé" });
    }

    if (!review.user.equals(userId)) {
      return res.status(403).json({
        success: false,
        message: "Vous n'êtes pas autorisé à modifier cet avis",
      });
    }

    // Mettre à jour l'avis
    review.rating = rating || review.rating;
    review.comment = comment || review.comment;

    await review.save();

    // Recalculer la note moyenne du vendeur
    const seller = await SellerRequest.findById(review.seller);
    const allReviews = await Review.find({ seller: review.seller });

    const totalRating = allReviews.reduce((sum, rev) => sum + rev.rating, 0);
    seller.rating = totalRating / allReviews.length;

    await seller.save();

    res.status(200).json({ success: true, review });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Supprimer un avis
exports.deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user._id;

    // Trouver l'avis et vérifier qu'il appartient à l'utilisateur
    const review = await Review.findById(reviewId);
    if (!review) {
      return res
        .status(404)
        .json({ success: false, message: "Avis non trouvé" });
    }

    if (!review.user.equals(userId)) {
      return res.status(403).json({
        success: false,
        message: "Vous n'êtes pas autorisé à supprimer cet avis",
      });
    }

    const sellerId = review.seller;

    // Supprimer l'avis
    await Review.findByIdAndDelete(reviewId);

    // Recalculer la note moyenne du vendeur
    const seller = await SellerRequest.findById(sellerId);
    const allReviews = await Review.find({ seller: sellerId });

    if (allReviews.length === 0) {
      seller.rating = 0;
      seller.reviewsCount = 0;
    } else {
      const totalRating = allReviews.reduce((sum, rev) => sum + rev.rating, 0);
      seller.rating = totalRating / allReviews.length;
      seller.reviewsCount = allReviews.length;
    }

    await seller.save();

    res
      .status(200)
      .json({ success: true, message: "Avis supprimé avec succès" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Obtenir tous les avis d'un vendeur
exports.getSellerReviews = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;

    const reviews = await Review.find({ seller: sellerId })
      .populate("user", "name userName2") // Ajuste les champs selon ton modèle User
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalReviews = await Review.countDocuments({ seller: sellerId });

    res.status(200).json({
      success: true,
      totalReviews,
      totalPages: Math.ceil(totalReviews / limit),
      currentPage: page,
      reviews,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Liker un avis
exports.likeReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user._id;

    const review = await Review.findById(reviewId);
    if (!review) {
      return res
        .status(404)
        .json({ success: false, message: "Avis non trouvé" });
    }

    // Vérifier si l'utilisateur a déjà liké cet avis
    if (review.likes.includes(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Vous avez déjà liké cet avis" });
    }

    // Ajouter le like
    review.likes.push(userId);
    review.likesCount += 1;
    await review.save();

    res.status(200).json({ success: true, message: "Like ajouté avec succès" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Enlever un like d'un avis
exports.unlikeReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user._id;

    const review = await Review.findById(reviewId);
    if (!review) {
      return res
        .status(404)
        .json({ success: false, message: "Avis non trouvé" });
    }

    // Vérifier si l'utilisateur a liké cet avis
    if (!review.likes.includes(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Vous n'avez pas liké cet avis" });
    }

    // Enlever le like
    review.likes = review.likes.filter((id) => !id.equals(userId));
    review.likesCount -= 1;
    await review.save();

    res.status(200).json({ success: true, message: "Like retiré avec succès" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Liker une boutique
exports.likeStore = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const userId = req.user._id;

    // Vérifier si la boutique existe
    const seller = await SellerRequest.findById(sellerId);
    if (!seller) {
      return res
        .status(404)
        .json({ success: false, message: "Vendeur non trouvé" });
    }

    // Vérifier si l'utilisateur a déjà liké cette boutique
    const existingLike = await StoreLike.findOne({
      seller: sellerId,
      user: userId,
    });
    if (existingLike) {
      return res.status(400).json({
        success: false,
        message: "Vous avez déjà liké cette boutique",
      });
    }

    // Créer un nouveau like
    const newLike = new StoreLike({
      seller: sellerId,
      user: userId,
    });

    await newLike.save();

    // Incrémenter le compteur de likes du vendeur
    seller.likesCount += 1;
    await seller.save();

    res
      .status(201)
      .json({ success: true, message: "Boutique likée avec succès" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Enlever un like d'une boutique
exports.unlikeStore = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const userId = req.user._id;

    // Vérifier si le like existe
    const existingLike = await StoreLike.findOne({
      seller: sellerId,
      user: userId,
    });
    if (!existingLike) {
      return res.status(400).json({
        success: false,
        message: "Vous n'avez pas liké cette boutique",
      });
    }

    // Supprimer le like
    await StoreLike.findOneAndDelete({ seller: sellerId, user: userId });

    // Décrémenter le compteur de likes du vendeur
    const seller = await SellerRequest.findById(sellerId);
    seller.likesCount -= 1;
    await seller.save();

    res.status(200).json({ success: true, message: "Like retiré avec succès" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Vérifier si un utilisateur a liké une boutique
exports.checkStoreLike = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const userId = req.user._id;

    const like = await StoreLike.findOne({ seller: sellerId, user: userId });

    res.status(200).json({
      success: true,
      liked: !!like,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Obtenir les stats sociales d'un vendeur (followers, likes, reviews)
exports.getSellerSocialStats = async (req, res) => {
  try {
    const { sellerId } = req.params;

    const seller = await SellerRequest.findById(sellerId);
    if (!seller) {
      return res
        .status(404)
        .json({ success: false, message: "Vendeur non trouvé" });
    }

    const stats = {
      followersCount: seller.followersCount || 0,
      likesCount: seller.likesCount || 0,
      reviewsCount: seller.reviewsCount || 0,
      rating: seller.rating || 0,
    };

    res.status(200).json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = exports;
