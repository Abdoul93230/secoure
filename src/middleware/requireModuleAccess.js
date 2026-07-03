const { SellerRequest } = require('../Models');

/**
 * Middleware factory : vérifie que le vendeur authentifié a accès au module.
 * Usage : router.use(requireModuleAccess('carnetCreances'))
 */
function requireModuleAccess(moduleKey) {
  return async (req, res, next) => {
    try {
      const sellerId = req.seller?._id || req.seller?.id || req.user?.id;
      if (!sellerId) {
        return res.status(401).json({ status: 'error', message: 'Non authentifié' });
      }

      const seller = await SellerRequest.findById(sellerId).select('modules').lean();
      if (!seller) {
        return res.status(404).json({ status: 'error', message: 'Vendeur introuvable' });
      }

      if (!seller.modules?.[moduleKey]) {
        return res.status(403).json({
          status: 'module_locked',
          message: `Le module "${moduleKey}" n'est pas activé sur votre compte. Contactez l'administrateur.`,
        });
      }

      next();
    } catch (err) {
      return res.status(500).json({ status: 'error', message: err.message });
    }
  };
}

module.exports = requireModuleAccess;
