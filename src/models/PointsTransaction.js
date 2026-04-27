const mongoose = require("mongoose");

// Immutable audit log — records every point movement
const pointsTransactionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  // Idempotency key — prevents double credits from retries
  idempotencyKey: {
    type: String,
    unique: true,
    sparse: true
  },
  type: {
    type: String,
    enum: [
      "PURCHASE",          // Points earned on order delivery
      "CHECKIN",           // Daily check-in
      "CHECKIN_STREAK",    // 7-day or 30-day streak bonus
      "REVIEW",            // Product review
      "FIRST_ORDER",       // First order bonus
      "EVENT",             // Special event multiplier
      "REFERRAL_PARRAIN",  // Referral reward for referrer
      "REFERRAL_FILLEUL",  // Referral reward for referred user
      "REDEMPTION",        // Points spent on an order
      "EXPIRY",            // Points expired
      "ADMIN_CREDIT",      // Manual admin addition
      "ADMIN_DEBIT",       // Manual admin removal
      "CANCELLATION"       // Points revoked on order cancellation
    ],
    required: true
  },
  delta: {
    type: Number,
    required: true  // Positive = credit, negative = debit
  },
  balanceBefore: {
    type: Number,
    required: true
  },
  balanceAfter: {
    type: Number,
    required: true
  },
  // Contextual reference
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Commande",
    default: null
  },
  referralUserId: {
    type: String,
    default: null
  },
  reviewId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "GamificationConfig",
    default: null
  },
  // Human-readable reason
  reason: {
    type: String,
    required: true
  },
  // Expiry date for these points (if applicable)
  expiresAt: {
    type: Date,
    default: null,
    index: true
  },
  expired: {
    type: Boolean,
    default: false
  },
  // Admin audit
  adminId: {
    type: String,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  // Prevent any updates to this collection — it's append-only
});

pointsTransactionSchema.index({ userId: 1, createdAt: -1 });
pointsTransactionSchema.index({ type: 1 });
pointsTransactionSchema.index({ expiresAt: 1, expired: 1 });
pointsTransactionSchema.index({ orderId: 1 });
pointsTransactionSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

// Auto-generate idempotency key if not provided
pointsTransactionSchema.pre("save", function (next) {
  if (!this.idempotencyKey) {
    this.idempotencyKey = `PTXN_${this.type}_${this.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }
  next();
});

const PointsTransaction = mongoose.model("PointsTransaction", pointsTransactionSchema);
module.exports = PointsTransaction;
