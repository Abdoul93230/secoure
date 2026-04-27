const configService = require("../services/gamificationConfigService");

const checkGamificationEnabled = async (req, res, next) => {
  const enabled = await configService.isEnabled();
  if (!enabled) {
    return res.status(503).json({
      success: false,
      message: "Le système de fidélité est temporairement désactivé"
    });
  }
  next();
};

const checkModuleEnabled = (moduleName) => async (req, res, next) => {
  const enabled = await configService.isModuleEnabled(moduleName);
  if (!enabled) {
    return res.status(503).json({
      success: false,
      message: `Le module ${moduleName} est désactivé`
    });
  }
  next();
};

module.exports = { checkGamificationEnabled, checkModuleEnabled };
