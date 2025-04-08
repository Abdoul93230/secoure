const mongoose = require("mongoose");

const storeLikeSchema = new mongoose.Schema({
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SellerRequest",
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Empêcher un utilisateur de liker plusieurs fois la même boutique
storeLikeSchema.index({ seller: 1, user: 1 }, { unique: true });

const StoreLike = mongoose.model("StoreLike", storeLikeSchema);

module.exports = StoreLike;
