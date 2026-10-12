/**
 * SÉCURITÉ — Accès « le client lui-même OU un administrateur ».
 * Vérifie le jeton (clé client puis clé admin) et compare l'identifiant ciblé
 * à celui du jeton. Pose req.isAdmin et req.userId.
 */
const jwt = require("jsonwebtoken");
const USER_KEY = require("./clef");
const ADMIN_KEY = require("./clefAdmin");

const readToken = (req) => {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
};

const verifyWith = (token, key) => {
  try {
    return jwt.verify(token, key);
  } catch {
    return null;
  }
};

/**
 * @param {(req) => string} pickUserId  identifiant du client concerné par la requête
 */
const ownerOrAdmin = (pickUserId) => (req, res, next) => {
  const token = readToken(req);
  if (!token) {
    return res.status(401).json({ message: "Authentification requise." });
  }

  const admin = verifyWith(token, ADMIN_KEY);
  if (admin) {
    req.isAdmin = true;
    req.userId = admin.userId;
    return next();
  }

  const user = verifyWith(token, USER_KEY);
  if (!user) {
    return res.status(401).json({ message: "Session expirée, veuillez vous reconnecter." });
  }
  req.isAdmin = false;
  req.userId = user.userId;

  if (String(user.userId) !== String(pickUserId(req))) {
    return res.status(403).json({ message: "Action non autorisée sur ce compte." });
  }
  return next();
};

module.exports = { ownerOrAdmin };
