const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: String,
    required: true,
    enum: [
      "Saisonnier",
      "Promotions",
      "Nouveautés",
      "Événements",
      "Personnalisé",
    ],
  },
  image: {
    type: String,
    required: true,
  },
  imagePublicId: {
    type: String,
  },
  displayLocation: {
    type: String,
    enum: ["boutique", "marketplace"],
    default: "boutique",
  },
  active: {
    type: Boolean,
    default: true,
  },
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  stats: {
    views: {
      type: Number,
      default: 0,
    },
    clicks: {
      type: Number,
      default: 0,
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});
bannerSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Banner", bannerSchema);
