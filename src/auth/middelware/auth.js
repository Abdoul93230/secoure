// middleware/auth.js
const jwt = require("jsonwebtoken");
const { SellerRequest } = require("../../Models");
const { User } = require("../../Models"); // Importe ton modèle d'utilisateur

// Même clé que les jetons clients (auth/clef.js, USER_JWT_SECRET) pour rester synchronisé
const JWT_SECRET = require("../clef");

exports.protect = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Non autorisé à accéder à cette ressource",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await SellerRequest.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Token invalide",
      });
    }

    req.user = user;
    req.role = decoded.role;
    next();
  } catch (error) {
    console.error(error);
    return res.status(401).json({
      success: false,
      message: "Non autorisé à accéder à cette ressource",
    });
  }
};

exports.isSeller = (req, res, next) => {
  // console.log(req.role);
  // if (req.user && req.user.role === "seller") {
  if (req.user && req.role === "seller") {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: "Accès réservé aux vendeurs",
    });
  }
};

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

    // console.log({ token, JWT_SECRET, us: "user" });
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
