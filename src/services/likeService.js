const { Like } = require('../Models');

class LikeService {
 async createLike(likeData) {
  const { userId, produitId } = likeData;

  // Adapter les champs à ceux attendus par ton schéma
  const user = userId;
  const produit = produitId;

  // Vérifier si le like existe déjà
  const existingLike = await Like.findOne({ user, produit });
  if (existingLike) {
    throw new Error('Like déjà existant');
  }

  const newLike = new Like({ user, produit });
  return await newLike.save();
}


  async deleteLike(userId, produitId) {
    const deleted = await Like.findOneAndDelete({
      user: userId,
      produit: produitId
    });
    return !!deleted;
  }

  async getLikesByUser(userId) {
    return await Like.find({ user: userId }).populate('produit');
  }

  async getLikesByProduct(produitId) {
    return await Like.find({ produit: produitId }).populate('user');
  }

  async checkLikeExists(userId, produitId) {
    const like = await Like.findOne({
      user: userId,
      produit: produitId
    });
    return !!like;
  }

  async getLikesCount(produitId) {
    return await Like.countDocuments({ produit: produitId });
  }

  async toggleLike(userId, produitId) {
    const existingLike = await Like.findOne({
      user: userId,
      produit: produitId
    });

    if (existingLike) {
      await Like.findByIdAndDelete(existingLike._id);
      return { action: 'removed', liked: false };
    } else {
      const newLike = new Like({
        user: userId,
        produit: produitId
      });
      await newLike.save();
      return { action: 'added', liked: true };
    }
  }
}

module.exports = new LikeService();