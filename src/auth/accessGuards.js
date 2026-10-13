/**
 * SÉCURITÉ — contrôles d'accès qui dépendent de la ressource visée
 * (produit, code promo, vente en caisse) + limites anti-abus.
 * Voir aussi auth/ownership.js (client / boutique ou admin) et auth/guestAuth.js (commandes).
 */
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const USER_KEY = require("./clef");
const SELLER_KEY = require("./clefSeller");
const ADMIN_KEY = require("./clefAdmin");

const readToken = (req) => {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
};
const verifyWith = (token, key) => {
  try {
    return jwt.verify(token, key);
  } catch {
    return null;
  }
};
const agentKey = () => require("../middleware/auth").AGENT_PRIVATE_KEY;

/** Qui appelle : admin, vendeur (sa boutique) ou caissier (sa boutique) */
function storeActor(req) {
  const token = readToken(req);
  if (!token) return null;
  const admin = verifyWith(token, ADMIN_KEY);
  if (admin) return { kind: "admin", id: String(admin.userId || "") };
  const seller = verifyWith(token, SELLER_KEY);
  if (seller?.userId) return { kind: "seller", storeId: String(seller.userId) };
  const agent = verifyWith(token, agentKey());
  if (agent?.role === "agent" && agent.storeId) return { kind: "agent", storeId: String(agent.storeId), agentId: String(agent.agentId) };
  return null;
}

const deny = (res, status, message) => res.status(status).json({ success: false, message });

/** Produit (:productId) : la boutique propriétaire, son caissier (si allowAgent) ou un admin */
const productOwnerOrAdmin = ({ allowAgent = false } = {}) => async (req, res, next) => {
  const actor = storeActor(req);
  if (!actor) return deny(res, 401, "Authentification requise.");
  if (actor.kind === "admin") { req.isAdmin = true; return next(); }
  if (actor.kind === "agent" && !allowAgent) return deny(res, 403, "Action réservée à la boutique.");
  try {
    const { Produit } = require("../Models");
    const p = await Produit.findById(req.params.productId, { Clefournisseur: 1 }).lean();
    if (!p) return deny(res, 404, "Produit introuvable.");
    if (String(p.Clefournisseur) !== actor.storeId) return deny(res, 403, "Ce produit n'appartient pas à votre boutique.");
    req.userId = actor.storeId;
    req.storeActor = actor;
    return next();
  } catch {
    return deny(res, 400, "Produit invalide.");
  }
};

/** Boutique (:sellerId…) : la boutique, son caissier (si allowAgent) ou un admin */
const storeOwnerOrAdmin = (pick, { allowAgent = false } = {}) => (req, res, next) => {
  const actor = storeActor(req);
  if (!actor) return deny(res, 401, "Authentification requise.");
  if (actor.kind === "admin") { req.isAdmin = true; return next(); }
  if (actor.kind === "agent" && !allowAgent) return deny(res, 403, "Action réservée à la boutique.");
  if (actor.storeId !== String(pick(req) || "")) return deny(res, 403, "Action non autorisée sur cette boutique.");
  req.storeActor = actor;
  return next();
};

/** Vente en caisse (:reference) : la boutique de la vente, son caissier ou un admin */
const posSaleOwnerOrAdmin = async (req, res, next) => {
  const actor = storeActor(req);
  if (!actor) return deny(res, 401, "Authentification requise.");
  if (actor.kind === "admin") return next();
  try {
    const VenteDirecte = require("../models/VenteDirecte");
    const v = await VenteDirecte.findOne({ reference: req.params.reference }, { sellerId: 1 }).lean();
    if (!v) return deny(res, 404, "Vente introuvable.");
    if (String(v.sellerId) !== actor.storeId) return deny(res, 403, "Cette vente n'appartient pas à votre boutique.");
    req.storeActor = actor;
    return next();
  } catch {
    return deny(res, 400, "Référence invalide.");
  }
};

/** Ancien code promo client (body.codePromoId) : son titulaire ou un admin */
const promoCodeOwnerOrAdmin = async (req, res, next) => {
  const token = readToken(req);
  if (!token) return deny(res, 401, "Authentification requise.");
  if (verifyWith(token, ADMIN_KEY)) return next();
  const user = verifyWith(token, USER_KEY);
  if (!user?.userId) return deny(res, 401, "Session expirée, veuillez vous reconnecter.");
  try {
    const { PromoCode } = require("../Models");
    const code = await PromoCode.findById(req.body?.codePromoId, { clefUser: 1 }).lean();
    if (!code) return deny(res, 404, "Code promo non trouvé.");
    if (String(code.clefUser) !== String(user.userId)) return deny(res, 403, "Ce code ne vous appartient pas.");
    return next();
  } catch {
    return deny(res, 400, "Code promo invalide.");
  }
};

/** E-mails sortants (formulaire de contact, partage) : peu d'envois par IP */
const mailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Trop d'envois. Réessayez plus tard." },
});

module.exports = { storeActor, productOwnerOrAdmin, storeOwnerOrAdmin, posSaleOwnerOrAdmin, promoCodeOwnerOrAdmin, mailLimiter };
