const jwt = require('jsonwebtoken');
const { SellerRequest } = require('../Models');
const ADMIN_PRIVATe_KEY = require("../auth/clefAdmin");
const SELLER_PRIVATe_KEY = require("../auth/clefSeller");

// Configuration des secrets JWT
const JWT_SECRETS = {
  seller:SELLER_PRIVATe_KEY,
  admin: ADMIN_PRIVATe_KEY,
  default: process.env.JWT_SECRET || 'default_secret'
};

// Middleware de base pour extraire et vérifier le token
const extractToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Token d\'authentification requis'
    });
  }

  const token = authHeader.substring(7);
  
  
  try {
    let decoded;
    let user;
    
    // Essayer de décoder avec différents secrets selon le rôle
    try {
      // D'abord essayer avec le secret seller
      // console.log({token});
      decoded = jwt.verify(token, JWT_SECRETS.seller);
      // console.log({decoded});
      
      if (decoded.role === 'seller') {
        user = await SellerRequest.findById(decoded.userId).select('-password');
      }
    } catch (err) {
      // Si ça échoue, essayer avec le secret admin
      // console.log({err});
      
      try {
        decoded = jwt.verify(token, JWT_SECRETS.admin);
        if (decoded.role === 'admin') {
          // Ici tu peux ajouter ta logique pour récupérer l'admin
          // Par exemple : user = await AdminUser.findById(decoded.userId);
          user = { id: decoded.userId, role: 'admin', name: 'Admin User' };
        }
      } catch (adminErr) {
        // Dernière tentative avec le secret par défaut
        // console.log({adminErr});
        
        decoded = jwt.verify(token, JWT_SECRETS.default);
        user = await SellerRequest.findById(decoded.userId).select('-password');
      }
    }
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur introuvable ou compte supprimé'
      });
    }

    // Vérifier si le compte seller est valide (si c'est un seller)
    if (user.role === 'seller' || decoded.role === 'seller') {
      if (!user.isvalid) {
        return res.status(403).json({
          success: false,
          message: 'Compte en attente de validation ou suspendu',
          suspensionReason: user.suspensionReason || 'Compte en attente de validation'
        });
      }
    }

    // Ajouter les informations utilisateur à la requête
    req.user = {
      id: user._id || user.id,
      role: user.role || decoded.role,
      name: user.name,
      email: user.email,
      phone: user.phone,
      isvalid: user.isvalid,
      suspensionReason: user.suspensionReason
    };
    
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token invalide ou expiré'
    });
  }
};

// Middleware pour les admins uniquement
const requireAdmin = [extractToken, (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Accès réservé aux administrateurs'
    });
  }
  next();
}];

// Middleware pour les vendeurs uniquement
const requireSeller = [extractToken, (req, res, next) => {
  if (req.user.role !== 'seller') {
    return res.status(403).json({
      success: false,
      message: 'Accès réservé aux vendeurs'
    });
  }
  next();
}];

// Middleware pour vendeurs valides uniquement
const requireValidSeller = [extractToken, (req, res, next) => {
  if (req.user.role !== 'seller') {
    return res.status(403).json({
      success: false,
      message: 'Accès réservé aux vendeurs'
    });
  }
  
  if (!req.user.isvalid) {
    return res.status(403).json({
      success: false,
      message: 'Compte vendeur non validé ou suspendu',
      suspensionReason: req.user.suspensionReason
    });
  }
  
  next();
}];

// Middleware pour admins ET vendeurs
const requireAdminOrSeller = [extractToken, (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'seller') {
    return res.status(403).json({
      success: false,
      message: 'Accès réservé aux administrateurs et vendeurs'
    });
  }
  next();
}];

// Middleware optionnel (pour les routes publiques qui peuvent bénéficier de l'auth)
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      let decoded;
      let user;
      
      // Même logique que extractToken mais sans retourner d'erreur
      try {
        decoded = jwt.verify(token, JWT_SECRETS.seller);
        if (decoded.role === 'seller') {
          user = await SellerRequest.findById(decoded.userId).select('-password');
        }
      } catch (err) {
        try {
          decoded = jwt.verify(token, JWT_SECRETS.admin);
          if (decoded.role === 'admin') {
            user = { id: decoded.userId, role: 'admin', name: 'Admin User' };
          }
        } catch (adminErr) {
          decoded = jwt.verify(token, JWT_SECRETS.default);
          user = await SellerRequest.findById(decoded.userId).select('-password');
        }
      }
      
      if (user) {
        req.user = {
          id: user._id || user.id,
          role: user.role || decoded.role,
          name: user.name,
          email: user.email,
          phone: user.phone,
          isvalid: user.isvalid,
          suspensionReason: user.suspensionReason
        };
      }
    } catch (error) {
      // Ignore les erreurs pour l'auth optionnelle
    }
  }
  
  next();
};

// Middleware pour vérifier que l'utilisateur accède à ses propres données
const requireOwnership = [extractToken, (req, res, next) => {
  const resourceUserId = req.params.userId || req.params.id || req.body.userId;
  
  // Les admins peuvent accéder à tout
  if (req.user.role === 'admin') {
    return next();
  }
  
  // Les utilisateurs ne peuvent accéder qu'à leurs propres données
  if (req.user.id !== resourceUserId) {
    return res.status(403).json({
      success: false,
      message: 'Accès non autorisé à cette ressource'
    });
  }
  
  next();
}];

// Utilitaire pour générer un token selon le rôle
const generateToken = (userId, role = 'seller', expiresIn = '20d') => {
  const secret = JWT_SECRETS[role] || JWT_SECRETS.default;
  return jwt.sign({ userId, role }, secret, { expiresIn });
};

// Utilitaire pour vérifier si un token est valide
const verifyToken = (token, role = 'seller') => {
  try {
    const secret = JWT_SECRETS[role] || JWT_SECRETS.default;
    return jwt.verify(token, secret);
  } catch (error) {
    return null;
  }
};

// Middleware pour logger les tentatives d'authentification (optionnel)
const logAuth = (req, res, next) => {
  console.log(`[AUTH] ${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip} - User-Agent: ${req.get('User-Agent')}`);
  next();
};

module.exports = {
  extractToken,
  requireAdmin,
  requireSeller,
  requireValidSeller,
  requireAdminOrSeller,
  requireOwnership,
  optionalAuth,
  generateToken,
  verifyToken,
  logAuth,
  JWT_SECRETS // Export pour les tests si nécessaire
};