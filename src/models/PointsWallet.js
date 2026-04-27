const mongoose = require("mongoose");

const pointsWalletSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Available balance (can decrease when points are spent or expire)
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  // Total ever earned — never decreases, used for level calculation
  totalEarned: {
    type: Number,
    default: 0
  },
  // Total spent on orders
  totalSpent: {
    type: Number,
    default: 0
  },
  // Total expired
  totalExpired: {
    type: Number,
    default: 0
  },
  // Current level (derived from totalEarned, stored for fast reads)
  level: {
    type: String,
    enum: ["Graine", "Arbre", "Grand Baobab"],
    default: "Graine"
  },
  // Daily check-in streak
  checkinStreak: {
    type: Number,
    default: 0
  },
  lastCheckinDate: {
    type: Date,
    default: null
  },
  // Referral stats
  referralCode: {
    type: String,
    unique: true,
    sparse: true
  },
  totalValidatedReferrals: {
    type: Number,
    default: 0
  },
  referredBy: {
    type: String,  // userId of the person who referred this user
    default: null
  },
  // Anti-abuse: blacklisted from referral system
  referralBlacklisted: {
    type: Boolean,
    default: false
  },
  // First order bonus already given
  firstOrderBonusGiven: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

pointsWalletSchema.index({ userId: 1 });
pointsWalletSchema.index({ referralCode: 1 });
pointsWalletSchema.index({ referredBy: 1 });

// Generate unique referral code on first save
pointsWalletSchema.pre("save", function (next) {
  if (!this.referralCode) {
    const base = this.userId.toString().slice(-5).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    this.referralCode = `IHB-${base}-${rand}`;
  }
  next();
});

const PointsWallet = mongoose.model("PointsWallet", pointsWalletSchema);
module.exports = PointsWallet;
