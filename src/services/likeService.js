const { Like, Produit } = require('../Models');

class LikeService {
  async createLike(likeData) {
    const { userId, produitId } = likeData;
    const user    = userId;
    const produit = produitId;

    const existingLike = await Like.findOne({ user, produit });
    if (existingLike) {
      throw new Error('Like déjà existant');
    }

    const newLike = new Like({ user, produit });
    await newLike.save();

    // Incrémente le compteur favorites sur le produit
    await Produit.findByIdAndUpdate(produitId, { $inc: { favorites: 1 } });

    return newLike;
  }

  async deleteLike(userId, produitId) {
    const deleted = await Like.findOneAndDelete({
      user: userId,
      produit: produitId
    });

    if (deleted) {
      // Décrémente — ne descend pas en dessous de 0
      await Produit.findByIdAndUpdate(produitId, {
        $inc: { favorites: -1 },
      });
      await Produit.updateOne(
        { _id: produitId, favorites: { $lt: 0 } },
        { $set: { favorites: 0 } }
      );
    }

    return !!deleted;
  }

  async getLikesByUser(userId) {
    return await Like.find({ user: userId }).populate('produit');
  }
  async getLikesByUserClient(userId) {
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
    const existingLike = await Like.findOne({ user: userId, produit: produitId });

    if (existingLike) {
      await Like.findByIdAndDelete(existingLike._id);
      await Produit.findByIdAndUpdate(produitId, { $inc: { favorites: -1 } });
      await Produit.updateOne(
        { _id: produitId, favorites: { $lt: 0 } },
        { $set: { favorites: 0 } }
      );
      return { action: 'removed', liked: false };
    } else {
      await new Like({ user: userId, produit: produitId }).save();
      await Produit.findByIdAndUpdate(produitId, { $inc: { favorites: 1 } });
      return { action: 'added', liked: true };
    }
  }
}

module.exports = new LikeService();