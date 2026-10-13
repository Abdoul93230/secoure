/**
 * Commande sans compte — jetons « invité » et identification de l'auteur d'une commande.
 *
 * Jeton invité (clé distincte des comptes : il n'ouvre AUCUNE autre route du site) :
 *   { userId, phone, guest: true, verified }
 *   - verified=false (2 jours) : numéro non vérifié → paiement en ligne uniquement
 *   - verified=true (90 jours) : numéro vérifié par SMS → tous les paiements, suivi, création du compte
 */
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const USER_KEY = require("./clef");
const ADMIN_KEY = require("./clefAdmin");

const GUEST_KEY = process.env.GUEST_JWT_SECRET || `${USER_KEY}::guest-orders`;

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

function signGuestToken(user, { verified }) {
  return jwt.sign(
    { userId: String(user._id), phone: user.phoneNumber, guest: true, verified: !!verified },
    GUEST_KEY,
    { expiresIn: verified ? "90d" : "2d" }
  );
}

/** Lien de suivi : jeton aléatoire impossible à deviner */
const newTrackingToken = () => crypto.randomBytes(16).toString("hex");

/**
 * Identifie l'auteur : compte client, invité ou admin → req.actor = { kind, userId, verified }.
 * @param {{ required?: boolean, allowAdmin?: boolean }} opts
 */
const orderActor = ({ required = true, allowAdmin = true } = {}) => (req, res, next) => {
  const token = readToken(req);
  if (token) {
    const user = verifyWith(token, USER_KEY);
    if (user?.userId) {
      req.actor = { kind: "user", userId: String(user.userId), verified: true };
      return next();
    }
    const guest = verifyWith(token, GUEST_KEY);
    if (guest?.guest && guest.userId) {
      req.actor = { kind: "guest", userId: String(guest.userId), verified: !!guest.verified, phone: guest.phone };
      return next();
    }
    if (allowAdmin) {
      const admin = verifyWith(token, ADMIN_KEY);
      if (admin) {
        req.actor = { kind: "admin", userId: String(admin.userId || ""), verified: true };
        return next();
      }
    }
  }
  if (!required) return next();
  return res.status(401).json({ code: "AUTH_REQUIRED", message: "Connectez-vous ou continuez sans compte pour commander." });
};

module.exports = { GUEST_KEY, signGuestToken, newTrackingToken, orderActor, readToken, verifyWith };
