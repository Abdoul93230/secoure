const GamificationConfig = require("../models/GamificationConfig");

let _cache = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

// Ensure all modules defined in the schema have entries in the stored config
const _patchMissingModules = async (cfg) => {
  const defaultModules = {
    POINTS_PURCHASE: { enabled: true, config: { ratePerThousand: 2, triggerStatus: "livré", multiplierArbre: 1.25, multiplierGrandBaobab: 1.5 } },
    DAILY_CHECKIN:   { enabled: true, config: { pointsPerDay: 1, bonus7d: 10, bonus30d: 30, resetHourUTC: 23 } },
    REVIEW_POINTS:   { enabled: true, config: { textOnly: 2, withPhoto: 5, minDaysAfterPurchase: 1 } },
    FIRST_ORDER_BONUS: { enabled: true, config: { points: 50 } },
    EVENT_POINTS:    { enabled: false, config: { events: [] } },
    REFERRAL:        { enabled: true, config: { pointsParrain: 25, pointsFilleul: 10, expiryDays: 30, tiers: [{ minReferrals: 1, maxReferrals: 4, bonusPerReferral: 0 }, { minReferrals: 5, maxReferrals: 19, bonusPerReferral: 10 }, { minReferrals: 20, maxReferrals: null, bonusPerReferral: 30 }] } },
    REFERRAL_ANTIABUSE: { enabled: true, config: { maxPerMonth: 10, deviceCheck: true, ipAlertOnly: true, minOrderAmount: 0 } },
    LEVELS:          { enabled: true, config: { thresholds: [{ name: "Graine", minPoints: 0, maxPoints: 499 }, { name: "Arbre", minPoints: 500, maxPoints: 2499 }, { name: "Grand Baobab", minPoints: 2500, maxPoints: null }] } },
  };
  let patched = false;
  for (const [key, defaults] of Object.entries(defaultModules)) {
    if (!cfg.modules[key]) {
      cfg.modules[key] = defaults;
      patched = true;
    }
  }
  if (patched) {
    cfg.markModified("modules");
    await cfg.save();
  }
  return cfg;
};

const getConfig = async () => {
  const now = Date.now();
  if (_cache && now < _cacheExpiry) return _cache;
  const cfg = await GamificationConfig.getConfig();
  await _patchMissingModules(cfg);
  _cache = cfg;
  _cacheExpiry = now + CACHE_TTL_MS;
  return _cache;
};

const invalidateCache = () => {
  _cache = null;
  _cacheExpiry = 0;
};

const isEnabled = async () => {
  const cfg = await getConfig();
  return cfg.enabled === true;
};

const isModuleEnabled = async (moduleName) => {
  const cfg = await getConfig();
  if (!cfg.enabled) return false;
  return cfg.modules?.[moduleName]?.enabled === true;
};

const getModuleConfig = async (moduleName) => {
  const cfg = await getConfig();
  return cfg.modules?.[moduleName]?.config || {};
};

const updateModule = async (moduleName, patch) => {
  const cfg = await GamificationConfig.getConfig();
  if (!cfg.modules[moduleName]) {
    throw new Error(`Module inconnu: ${moduleName}`);
  }
  if (patch.enabled !== undefined) {
    cfg.modules[moduleName].enabled = patch.enabled;
  }
  if (patch.config !== undefined) {
    cfg.modules[moduleName].config = { ...cfg.modules[moduleName].config, ...patch.config };
  }
  cfg.markModified("modules");
  await cfg.save();
  invalidateCache();
  return cfg;
};

const toggleSystem = async (enabled) => {
  const cfg = await GamificationConfig.getConfig();
  cfg.enabled = enabled;
  await cfg.save();
  invalidateCache();
  return cfg;
};

const updateRedemptionSettings = async (patch) => {
  const cfg = await GamificationConfig.getConfig();
  Object.assign(cfg.redemption, patch);
  cfg.markModified("redemption");
  await cfg.save();
  invalidateCache();
  return cfg;
};

const getLevelForPoints = async (totalEarned) => {
  const levelConfig = await getModuleConfig("LEVELS");
  const thresholds = levelConfig.thresholds || [];
  let currentLevel = "Graine";
  for (const tier of thresholds) {
    if (totalEarned >= tier.minPoints) {
      currentLevel = tier.name;
    }
  }
  return currentLevel;
};

const getPurchaseMultiplier = async (level) => {
  const moduleCfg = await getModuleConfig("POINTS_PURCHASE");
  if (level === "Grand Baobab") return moduleCfg.multiplierGrandBaobab || 1.5;
  if (level === "Arbre") return moduleCfg.multiplierArbre || 1.25;
  return 1;
};

module.exports = {
  getConfig,
  invalidateCache,
  isEnabled,
  isModuleEnabled,
  getModuleConfig,
  updateModule,
  toggleSystem,
  updateRedemptionSettings,
  getLevelForPoints,
  getPurchaseMultiplier
};
