const jwt = require("jsonwebtoken");
const User = require("../models/User"); // Importe ton modèle d'utilisateur

// Secret pour signer les tokens JWT - à stocker dans les variables d'environnement en production
const JWT_SECRET = process.env.JWT_SECRET || "ton_secret_jwt";

// Middleware pour vérifier si l'utilisateur est authentifié
exports.authenticate = async (req, res, next) => {
  try {
    // Récupérer le token depuis l'en-tête Authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Accès non autorisé. Token manquant.",
      });
    }

    // Extraire le token
    const token = authHeader.split(" ")[1];

    // Vérifier et décoder le token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Trouver l'utilisateur dans la base de données
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Utilisateur non trouvé ou token invalide.",
      });
    }

    // Ajouter l'utilisateur à l'objet requête pour pouvoir y accéder dans les autres middlewares/contrôleurs
    req.user = user;

    // Passer au middleware/contrôleur suivant
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Token invalide.",
      });
    } else if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expiré. Veuillez vous reconnecter.",
      });
    }
    res.status(500).json({
      success: false,
      message: "Erreur d'authentification.",
    });
  }
};

// Middleware pour vérifier si l'utilisateur est un administrateur
exports.isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Accès interdit. Droits d'administrateur requis.",
    });
  }
  next();
};

// Middleware pour vérifier si l'utilisateur est un vendeur
exports.isSeller = (req, res, next) => {
  if (!req.user || req.user.role !== "seller") {
    return res.status(403).json({
      success: false,
      message: "Accès interdit. Droits de vendeur requis.",
    });
  }
  next();
};

// Génération de token JWT pour l'utilisateur à l'authentification
exports.generateToken = (user) => {
  return jwt.sign(
    { userId: user._id, role: user.role },
    JWT_SECRET,
    { expiresIn: "24h" } // Token valide pendant 24 heures
  );
};

module.exports = exports;
