/**
 * Configuration Express pour supporter le nouveau système d'authentification automatique
 * Middleware pour traiter les tokens JWT automatiquement
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Seller = require('../models/Seller');

// Middleware d'authentification amélioré
const authMiddleware = async (req, res, next) => {
  try {
    // Récupérer le token depuis les headers
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token d\'authentification manquant',
        code: 'MISSING_TOKEN'
      });
    }

    const token = authHeader.substring(7); // Supprimer "Bearer "
    
    // Vérifier et décoder le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded || !decoded.userId) {
      return res.status(401).json({
        success: false,
        message: 'Token invalide',
        code: 'INVALID_TOKEN'
      });
    }

    // Récupérer l'utilisateur depuis la base de données
    let user = null;
    
    // Essayer en tant que vendeur d'abord
    if (decoded.userType === 'seller' || decoded.isSeller) {
      user = await Seller.findById(decoded.userId).select('-password');
      if (user) {
        req.userType = 'seller';
      }
    }
    
    // Si pas trouvé comme vendeur, essayer comme utilisateur normal
    if (!user) {
      user = await User.findById(decoded.userId).select('-password');
      if (user) {
        req.userType = decoded.userType || 'user';
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    // Vérifier si l'utilisateur est actif
    if (user.status === 'inactive' || user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Compte désactivé ou suspendu',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    // Ajouter les informations utilisateur à la requête
    req.user = user;
    req.userId = user._id;
    req.token = token;

    // Mettre à jour la dernière activité
    if (req.userType === 'seller') {
      await Seller.findByIdAndUpdate(decoded.userId, {
        lastActive: new Date()
      });
    } else {
      await User.findByIdAndUpdate(decoded.userId, {
        lastActive: new Date()
      });
    }

    next();
  } catch (error) {
    console.error('Erreur authentification:', error);
    
    // Gestion spécifique des erreurs JWT
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token invalide',
        code: 'INVALID_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expiré',
        code: 'TOKEN_EXPIRED'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'authentification',
      code: 'AUTH_ERROR'
    });
  }
};

// Middleware pour vérifier le type d'utilisateur
const requireUserType = (allowedTypes) => {
  return (req, res, next) => {
    if (!req.user || !req.userType) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise',
        code: 'AUTH_REQUIRED'
      });
    }

    const userTypes = Array.isArray(allowedTypes) ? allowedTypes : [allowedTypes];
    
    if (!userTypes.includes(req.userType)) {
      return res.status(403).json({
        success: false,
        message: `Accès réservé aux: ${userTypes.join(', ')}`,
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
};

// Middleware pour vérifier le statut de la boutique (vendeurs)
const requireValidStore = async (req, res, next) => {
  try {
    if (req.userType !== 'seller') {
      return res.status(403).json({
        success: false,
        message: 'Accès réservé aux vendeurs',
        code: 'SELLER_ONLY'
      });
    }

    const seller = req.user;
    
    // Vérifier si la boutique est validée
    if (!seller.isvalid) {
      return res.status(403).json({
        success: false,
        message: 'Boutique non validée. Contactez l\'administration.',
        code: 'STORE_NOT_VALIDATED',
        data: {
          storeValidated: false,
          contactAdmin: true
        }
      });
    }

    // Vérifier le statut de l'abonnement si nécessaire
    if (seller.subscriptionStatus && seller.subscriptionStatus !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Abonnement requis pour cette action',
        code: 'SUBSCRIPTION_REQUIRED',
        data: {
          subscriptionStatus: seller.subscriptionStatus,
          needsSubscription: true
        }
      });
    }

    next();
  } catch (error) {
    console.error('Erreur vérification boutique:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      code: 'SERVER_ERROR'
    });
  }
};

// Middleware optionnel (pour les routes publiques avec auth optionnelle)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Pas de token, continuer sans authentification
      req.user = null;
      req.userType = null;
      return next();
    }

    // Si token présent, essayer de l'authentifier
    await authMiddleware(req, res, next);
  } catch (error) {
    // En cas d'erreur, continuer sans authentification
    req.user = null;
    req.userType = null;
    next();
  }
};

// Utility function pour générer un token
const generateToken = (user, userType = 'user') => {
  return jwt.sign(
    {
      userId: user._id,
      userType: userType,
      email: user.email,
      name: user.name || user.nomBoutique,
      isSeller: userType === 'seller'
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
  );
};

// Utility function pour valider un token sans middleware
const validateToken = async (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return { valid: true, decoded };
  } catch (error) {
    return { valid: false, error: error.message };
  }
};

// Route de vérification du token
const verifyTokenRoute = async (req, res) => {
  try {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token invalide'
      });
    }

    // Retourner les informations utilisateur actualisées
    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name || user.nomBoutique,
          email: user.email,
          userType: req.userType,
          isvalid: user.isvalid || false,
          subscriptionStatus: user.subscriptionStatus || null,
          lastActive: user.lastActive
        },
        token: req.token
      }
    });
  } catch (error) {
    console.error('Erreur vérification token:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

module.exports = {
  authMiddleware,
  requireUserType,
  requireValidStore,
  optionalAuth,
  generateToken,
  validateToken,
  verifyTokenRoute
};

/**
 * UTILISATION DANS LES ROUTES:
 * 
 * // Route protégée pour vendeurs uniquement
 * app.get('/api/seller/products', 
 *   authMiddleware, 
 *   requireUserType('seller'), 
 *   getProducts
 * );
 * 
 * // Route protégée pour vendeurs avec boutique validée
 * app.post('/api/seller/products', 
 *   authMiddleware, 
 *   requireValidStore, 
 *   createProduct
 * );
 * 
 * // Route pour utilisateurs ou vendeurs
 * app.get('/api/profile', 
 *   authMiddleware, 
 *   requireUserType(['user', 'seller']), 
 *   getProfile
 * );
 * 
 * // Route publique avec auth optionnelle
 * app.get('/api/products', 
 *   optionalAuth, 
 *   getPublicProducts
 * );
 * 
 * // Route de vérification du token
 * app.get('/api/auth/verify', 
 *   authMiddleware, 
 *   verifyTokenRoute
 * );
 */
