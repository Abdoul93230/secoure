/**
 * SÉCURITÉ — Équipe (admins + managers) et clients de la messagerie.
 *
 * Les managers ont leur PROPRE clé de signature : un jeton manager n'est jamais
 * accepté par requireAdmin / authAdmin / storeActor (qui vérifient la clé admin).
 * Un manager n'accède qu'aux routes qui l'autorisent explicitement, et seulement
 * pour les boutiques qui lui sont affectées.
 */
const jwt = require("jsonwebtoken");
const ADMIN_KEY = require("../auth/clefAdmin");
const USER_KEY = require("../auth/clef");
const { Manager } = require("./models");

const MANAGER_KEY = process.env.MANAGER_JWT_SECRET || `${ADMIN_KEY}::manager`;

const readToken = (req) => {
  const h = req.headers?.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
};
const verify = (token, key) => {
  try { return jwt.verify(token, key); } catch { return null; }
};

const signManagerToken = (manager) =>
  jwt.sign({ managerId: String(manager._id), role: "manager" }, MANAGER_KEY, { expiresIn: "1d" });

/**
 * Identifie un membre de l'équipe à partir d'un jeton.
 * → { kind: 'admin', id, name, sellerIds: null }  (null = toutes les boutiques)
 * → { kind: 'manager', id, name, displayName, sellerIds: [..], permissions }
 */
async function staffFromToken(token) {
  if (!token) return null;
  const admin = verify(token, ADMIN_KEY);
  if (admin) {
    if (admin.role && admin.role !== "admin") return null;
    return { kind: "admin", id: String(admin.userId || ""), name: "Admin", displayName: "", sellerIds: null, permissions: { messages: true, products: true, orders: true } };
  }
  const m = verify(token, MANAGER_KEY);
  if (m?.role === "manager" && m.managerId) {
    const manager = await Manager.findById(m.managerId).select("name displayName sellerIds permissions isActive").lean();
    if (!manager || !manager.isActive) return null;
    return {
      kind: "manager",
      id: String(manager._id),
      name: manager.name,
      displayName: manager.displayName || "",
      sellerIds: (manager.sellerIds || []).map(String),
      permissions: { messages: true, products: true, orders: true, ...(manager.permissions || {}) },
    };
  }
  return null;
}

/** Client connecté (jeton utilisateur) → { id } */
function clientFromToken(token) {
  const d = verify(token, USER_KEY);
  if (!d?.userId || (d.role && d.role !== "user")) return null;
  return { id: String(d.userId) };
}

const deny = (res, status, message) => res.status(status).json({ success: false, message });

/** Admin ou manager actif ; `permission` : messages | products | orders */
const requireStaff = (permission) => async (req, res, next) => {
  const staff = await staffFromToken(readToken(req));
  if (!staff) return deny(res, 401, "Session de l'équipe requise.");
  if (permission && staff.permissions[permission] === false) return deny(res, 403, "Accès non autorisé pour votre profil.");
  req.staff = staff;
  if (staff.kind === "manager") Manager.updateOne({ _id: staff.id }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
  next();
};

/** Super-admin uniquement */
const requireSuperAdmin = async (req, res, next) => {
  const staff = await staffFromToken(readToken(req));
  if (!staff || staff.kind !== "admin") return deny(res, 403, "Réservé aux administrateurs.");
  req.staff = staff;
  next();
};

const requireClient = (req, res, next) => {
  const client = clientFromToken(readToken(req));
  if (!client) return deny(res, 401, "Connectez-vous pour écrire à une boutique.");
  req.client = client;
  next();
};

/** La boutique fait-elle partie du périmètre de ce membre de l'équipe ? */
const canAccessSeller = (staff, sellerId) =>
  !!staff && (staff.sellerIds === null || staff.sellerIds.includes(String(sellerId)));

/** Filtre Mongo sur les boutiques du périmètre (champ `field`) */
const sellerScope = (staff, field = "sellerId") =>
  staff.sellerIds === null ? {} : { [field]: { $in: staff.sellerIds } };

module.exports = {
  MANAGER_KEY,
  signManagerToken,
  staffFromToken,
  clientFromToken,
  requireStaff,
  requireSuperAdmin,
  requireClient,
  canAccessSeller,
  sellerScope,
  readToken,
};
