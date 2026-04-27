const mongoose = require("mongoose");

const moduleConfigSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: true },
  config: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const gamificationConfigSchema = new mongoose.Schema({
  // Singleton — always one document, fetched by key
  key: { type: String, default: "main", unique: true },
  enabled: { type: Boolean, default: true },
  modules: {
    POINTS_PURCHASE: {
      type: moduleConfigSchema,
      default: () => ({
        enabled: true,
        config: {
          ratePerThousand: 2,          // BP per 1000 FCFA spent
          triggerStatus: "livré",
          multiplierArbre: 1.25,
          multiplierGrandBaobab: 1.5
        }
      })
    },
    DAILY_CHECKIN: {
      type: moduleConfigSchema,
      default: () => ({
        enabled: true,
        config: {
          pointsPerDay: 1,
          bonus7d: 10,
          bonus30d: 30,
          resetHourUTC: 23  // Midnight Niamey (UTC+1)
        }
      })
    },
    REVIEW_POINTS: {
      type: moduleConfigSchema,
      default: () => ({
        enabled: true,
        config: {
          textOnly: 2,
          withPhoto: 5,
          minDaysAfterPurchase: 1
        }
      })
    },
    FIRST_ORDER_BONUS: {
      type: moduleConfigSchema,
      default: () => ({
        enabled: true,
        config: { points: 50 }
      })
    },
    EVENT_POINTS: {
      type: moduleConfigSchema,
      default: () => ({
        enabled: false,
        config: { events: [] }
      })
    },
    REFERRAL: {
      type: moduleConfigSchema,
      default: () => ({
        enabled: true,
        config: {
          pointsParrain: 25,
          pointsFilleul: 10,
          expiryDays: 30,
          // Tier bonuses for parrain (cumulative validated referrals)
          tiers: [
            { minReferrals: 1,  maxReferrals: 4,  bonusPerReferral: 0 },
            { minReferrals: 5,  maxReferrals: 19, bonusPerReferral: 10 },
            { minReferrals: 20, maxReferrals: null, bonusPerReferral: 30 }
          ]
        }
      })
    },
    REFERRAL_ANTIABUSE: {
      type: moduleConfigSchema,
      default: () => ({
        enabled: true,
        config: {
          maxPerMonth: 10,
          deviceCheck: true,
          ipAlertOnly: true,
          minOrderAmount: 0
        }
      })
    },
    LEVELS: {
      type: moduleConfigSchema,
      default: () => ({
        enabled: true,
        config: {
          thresholds: [
            { name: "Graine",      minPoints: 0,    maxPoints: 499  },
            { name: "Arbre",       minPoints: 500,  maxPoints: 2499 },
            { name: "Grand Baobab", minPoints: 2500, maxPoints: null }
          ]
        }
      })
    }
  },
  // Redemption settings
  redemption: {
    maxPercentPerOrder: { type: Number, default: 30 },
    maxPercentReferralPoints: { type: Number, default: 20 },
    pointsToFcfaRate: { type: Number, default: 20 }  // 1 BP = 20 FCFA
  },
  // Earning settings
  earning: {
    fcfaPerPoint: { type: Number, default: 500 },  // 500 FCFA = 1 BP
    pointsExpireMonths: { type: Number, default: 12 }
  }
}, {
  timestamps: true
});

// Singleton getter
gamificationConfigSchema.statics.getConfig = async function () {
  let config = await this.findOne({ key: "main" });
  if (!config) {
    config = await this.create({ key: "main" });
  }
  return config;
};

const GamificationConfig = mongoose.model("GamificationConfig", gamificationConfigSchema);
module.exports = GamificationConfig;
