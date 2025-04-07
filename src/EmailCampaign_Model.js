const mongoose = require("mongoose");

const emailCampaignSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  subject: {
    type: String,
    required: true,
    trim: true,
  },
  content: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["brouillon", "programmé", "actif", "terminé"],
    default: "brouillon",
  },
  sendDate: {
    type: Date,
  },
  recipients: {
    type: String,
    required: true,
    enum: ["all", "premium", "new", "inactive"],
  },
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Store",
    required: true,
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  stats: {
    sent: {
      type: Number,
      default: 0,
    },
    opened: {
      type: Number,
      default: 0,
    },
    clicked: {
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

emailCampaignSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("EmailCampaign", emailCampaignSchema);
