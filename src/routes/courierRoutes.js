/**
 * LIVREURS — page web /livreur (site) : connexion numéro + code PIN, puis
 *   1. Retrait : référence + code de retrait donné par la boutique
 *   2. Livraison : référence + code de livraison donné par le client
 * Chaque saisie est inscrite au journal de la commande avec le nom et le numéro du livreur.
 *
 * Admin : création des comptes livreurs, et journal complet d'une commande (sans les codes).
 */
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const middelware = require("../auth/middelware");
const ADMIN_KEY = require("../auth/clefAdmin");
const trace = require("../services/orderTrace");

const COURIER_KEY = process.env.COURIER_JWT_SECRET || `${ADMIN_KEY}::courier`;
const MAX_CODE_ATTEMPTS = 5;

// ─── Modèle ────────────────────────────────────────────────────────────────────
const courierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    phone: { type: String, required: true, unique: true, trim: true }, // E.164 sans espace
    pinHash: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    lastSeenAt: { type: Date, default: null },
    deliveries: { type: Number, default: 0 },
    pickups: { type: Number, default: 0 },
  },
  { timestamps: true }
);
const Courier = mongoose.models.Courier || mongoose.model("Courier", courierSchema);

/** Numéro saisi → E.164 sans espace (8 chiffres = Niger) */
const normPhone = (v) => {
  const raw = String(v || "").replace(/[\s.()-]/g, "");
  if (/^\+\d{8,15}$/.test(raw)) return raw;
  if (/^00\d{8,15}$/.test(raw)) return `+${raw.slice(2)}`;
  if (/^\d{8}$/.test(raw)) return `+227${raw}`;
  if (/^227\d{8}$/.test(raw)) return `+${raw}`;
  return null;
};
const PIN_RULE = /^\d{4}$/;

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 8, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: "Trop d'essais. Réessayez dans 15 minutes." },
});
const codeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: "Trop d'essais. Patientez quelques minutes." },
});

const requireCourier = async (req, res, next) => {
  const h = req.headers.authorization || "";
  try {
    const d = jwt.verify(h.startsWith("Bearer ") ? h.slice(7) : "", COURIER_KEY);
    const c = await Courier.findById(d.courierId).lean();
    if (!c || !c.isActive) return fail(res, 401, "Compte livreur désactivé. Contactez Ihambaobab.");
    req.courier = c;
    Courier.updateOne({ _id: c._id }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
    next();
  } catch {
    fail(res, 401, "Connectez-vous avec votre numéro et votre code.");
  }
};

const courierJSON = (c) => ({ id: String(c._id), name: c.name, phone: c.phone, isActive: c.isActive, lastSeenAt: c.lastSeenAt, deliveries: c.deliveries || 0, pickups: c.pickups || 0, createdAt: c.createdAt });

/** Change l'état de la commande par le même chemin que l'admin (finances, points, notifications) */
async function setEtat(app, commandeId, nouvelEtat, by) {
  const { updateEtatTraitement } = require("../userControler");
  let out = null;
  const res = { status() { return res; }, json(b) { out = b; return res; } };
  await updateEtatTraitement({ params: { commandeId: String(commandeId) }, body: { nouvelEtat }, app, traceBy: by, skipTraceLog: true }, res);
  return out;
}

async function findOrder(reference) {
  const { Commande } = require("../Models");
  const ref = String(reference || "").trim().slice(0, 64);
  if (!ref) return null;
  return Commande.findOne({ reference: ref });
}

/** Résumé montré au livreur (rien de sensible) */
function orderSummary(o) {
  const ld = o.livraisonDetails || {};
  const stores = o.handover?.stores || [];
  return {
    reference: o.reference,
    items: (o.nbrProduits || []).reduce((s, p) => s + (p.quantite || 1), 0),
    total: o.prix || 0,
    cashToCollect: o.statusPayment === "payé à la livraison" ? o.prix || 0 : 0,
    customer: (ld.customerName || "").split(" ")[0] || "Client",
    zone: [ld.quartier, ld.region].filter(Boolean).join(", "),
    stores: stores.map((s) => ({ storeId: s.storeId, storeName: s.storeName, pickedUp: !!s.pickedUpAt, pickedUpAt: s.pickedUpAt })),
    delivered: !!o.handover?.deliveredAt,
    status: o.etatTraitement,
  };
}

/** Commande prête pour un livreur ? sinon message clair */
function blocker(o) {
  if (!o) return "Aucune commande avec cette référence.";
  if (o.etatTraitement === "annulé") return "Cette commande est annulée : ne la livrez pas.";
  if (["livré", "livraison reçu", "Traité"].includes(o.etatTraitement)) return "Cette commande est déjà livrée.";
  if (o.awaitingPayment) return "Cette commande n'est pas encore payée : ne la récupérez pas.";
  if (o.phoneConfirmation === "pending") return "Commande pas encore confirmée par téléphone : attendez la confirmation d'Ihambaobab.";
  return null;
}

const tooManyAttempts = (n) => n >= MAX_CODE_ATTEMPTS;

// ═══ LIVREUR ═══════════════════════════════════════════════════════════════════
const courier = express.Router();

courier.post("/login", loginLimiter, async (req, res) => {
  const phone = normPhone(req.body?.phone);
  const pin = String(req.body?.pin || "");
  if (!phone || !PIN_RULE.test(pin)) return fail(res, 400, "Numéro ou code invalide.");
  const c = await Courier.findOne({ phone });
  if (!c || !(await bcrypt.compare(pin, c.pinHash))) return fail(res, 401, "Numéro ou code incorrect.");
  if (!c.isActive) return fail(res, 403, "Compte livreur désactivé. Contactez Ihambaobab.");
  const token = jwt.sign({ courierId: String(c._id), role: "courier" }, COURIER_KEY, { expiresIn: "30d" });
  res.json({ success: true, token, courier: courierJSON(c) });
});

courier.get("/me", requireCourier, (req, res) => res.json({ success: true, courier: courierJSON(req.courier) }));

/** Étape 1 : la référence → ce qu'il faut faire (retrait chez quelle boutique, ou livraison) */
courier.post("/lookup", requireCourier, codeLimiter, async (req, res) => {
  const o = await findOrder(req.body?.reference);
  const block = blocker(o);
  if (block) return fail(res, o ? 409 : 404, block);
  await trace.ensureHandover(o);
  const fresh = await findOrder(o.reference);
  res.json({ success: true, order: orderSummary(fresh) });
});

/** Retrait chez la boutique : code donné par le vendeur */
courier.post("/pickup", requireCourier, codeLimiter, async (req, res) => {
  const { Commande } = require("../Models");
  let o = await findOrder(req.body?.reference);
  const block = blocker(o);
  if (block) return fail(res, o ? 409 : 404, block);
  await trace.ensureHandover(o);
  o = await findOrder(o.reference);
  const code = String(req.body?.code || "").trim();
  const stores = o.handover.stores || [];
  const pending = stores.filter((s) => !s.pickedUpAt);
  if (!pending.length) return fail(res, 409, "Tous les colis de cette commande sont déjà récupérés.");
  if (pending.every((s) => tooManyAttempts(s.attempts || 0))) {
    return fail(res, 429, "Trop de codes faux pour cette commande. Appelez Ihambaobab.");
  }
  const store = pending.find((s) => s.pickupCode === code && !tooManyAttempts(s.attempts || 0));
  if (!store) {
    await Commande.updateOne({ _id: o._id }, { $inc: Object.fromEntries(stores.map((s, i) => [`handover.stores.${i}.attempts`, s.pickedUpAt ? 0 : 1])) });
    return fail(res, 400, "Code incorrect. Demandez à la boutique le code affiché sur sa commande.");
  }
  const who = { id: String(req.courier._id), name: req.courier.name, phone: req.courier.phone };
  const at = new Date();
  await Commande.updateOne({ _id: o._id, "handover.stores.storeId": store.storeId }, {
    $set: { "handover.stores.$.pickedUpAt": at, "handover.stores.$.courier": who },
  });
  await Courier.updateOne({ _id: req.courier._id }, { $inc: { pickups: 1 } });
  await trace.logEvent(o._id, { type: "picked_up", by: { kind: "courier", ...who }, storeId: store.storeId, note: store.storeName ? `Chez ${store.storeName}` : "" });
  await trace.notifySellers({ ...o.toObject(), shippingByStore: [{ storeId: store.storeId }] }, {
    type: "order_picked_up", title: "Colis remis au livreur",
    body: `Réf ${o.reference} · ${req.courier.name} (${req.courier.phone}) a récupéré le colis à ${at.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Niamey" })}.`,
  }, req.app.get("io"));

  const allPicked = pending.length === 1;
  if (allPicked && !["reçu par le livreur", "en cours de livraison"].includes(o.etatTraitement)) {
    await setEtat(req.app, o._id, "reçu par le livreur", { kind: "courier", ...who });
    await trace.notifyClient(o, { title: "Votre commande est en route 🚚", body: `${req.courier.name} vous livre la commande ${o.reference}. Gardez votre code de livraison à portée de main.` });
  }
  const after = await findOrder(o.reference);
  res.json({ success: true, message: `Colis de ${store.storeName || "la boutique"} récupéré.`, order: orderSummary(after) });
});

/** Livraison au client : code donné par le client */
courier.post("/deliver", requireCourier, codeLimiter, async (req, res) => {
  const { Commande } = require("../Models");
  let o = await findOrder(req.body?.reference);
  const block = blocker(o);
  if (block) return fail(res, o ? 409 : 404, block);
  await trace.ensureHandover(o);
  o = await findOrder(o.reference);
  if (o.handover.deliveredAt) return fail(res, 409, "Cette commande est déjà livrée.");
  const missing = (o.handover.stores || []).filter((s) => !s.pickedUpAt);
  if (missing.length) return fail(res, 409, `Récupérez d'abord le colis chez : ${missing.map((s) => s.storeName || "la boutique").join(", ")}.`);
  if (tooManyAttempts(o.handover.deliveryAttempts || 0)) return fail(res, 429, "Trop de codes faux. Appelez Ihambaobab.");
  if (String(req.body?.code || "").trim() !== o.handover.deliveryCode) {
    await Commande.updateOne({ _id: o._id }, { $inc: { "handover.deliveryAttempts": 1 } });
    return fail(res, 400, "Code incorrect. Demandez au client le code affiché dans sa commande.");
  }
  const who = { id: String(req.courier._id), name: req.courier.name, phone: req.courier.phone };
  await Commande.updateOne({ _id: o._id }, { $set: { "handover.deliveredAt": new Date(), "handover.deliveredBy": who, statusLivraison: "livré" } });
  await Courier.updateOne({ _id: req.courier._id }, { $inc: { deliveries: 1 } });
  await trace.logEvent(o._id, { type: "delivered", by: { kind: "courier", ...who }, note: "Code client vérifié" });
  await setEtat(req.app, o._id, "livré", { kind: "courier", ...who });
  await trace.notifySellers(o, { type: "order_delivered", title: "Commande livrée ✅", body: `Réf ${o.reference} · livrée au client par ${req.courier.name}, code client vérifié.` }, req.app.get("io"));
  await trace.notifyClient(o, { title: "Commande livrée", body: `Merci ! Votre commande ${o.reference} vous a été remise.` });
  const after = await findOrder(o.reference);
  res.json({ success: true, message: "Livraison confirmée.", order: orderSummary(after) });
});

// ═══ ADMIN ═════════════════════════════════════════════════════════════════════
const admin = express.Router();

admin.get("/couriers", middelware.authAdmin, async (_req, res) => {
  const rows = await Courier.find().sort({ isActive: -1, name: 1 }).lean();
  res.json({ success: true, data: rows.map(courierJSON) });
});

admin.post("/couriers", middelware.authAdmin, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const phone = normPhone(req.body?.phone);
  const pin = String(req.body?.pin || "");
  if (name.length < 2) return fail(res, 400, "Indiquez le nom du livreur.");
  if (!phone) return fail(res, 400, "Numéro invalide (ex. +22790123456).");
  if (!PIN_RULE.test(pin)) return fail(res, 400, "Le code doit faire 4 chiffres.");
  if (await Courier.exists({ phone })) return fail(res, 409, "Un livreur utilise déjà ce numéro.");
  const c = await Courier.create({ name, phone, pinHash: await bcrypt.hash(pin, 10) });
  res.status(201).json({ success: true, data: courierJSON(c) });
});

admin.put("/couriers/:id", middelware.authAdmin, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return fail(res, 404, "Livreur introuvable.");
  const set = {};
  if (req.body?.name !== undefined) set.name = String(req.body.name).trim();
  if (req.body?.isActive !== undefined) set.isActive = !!req.body.isActive;
  if (req.body?.pin) {
    if (!PIN_RULE.test(String(req.body.pin))) return fail(res, 400, "Le code doit faire 4 chiffres.");
    set.pinHash = await bcrypt.hash(String(req.body.pin), 10);
  }
  const c = await Courier.findByIdAndUpdate(req.params.id, { $set: set }, { new: true }).lean();
  if (!c) return fail(res, 404, "Livreur introuvable.");
  res.json({ success: true, data: courierJSON(c) });
});

admin.delete("/couriers/:id", middelware.authAdmin, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return fail(res, 404, "Livreur introuvable.");
  // Désactivé plutôt que supprimé : son nom reste lisible dans le journal des commandes
  await Courier.updateOne({ _id: req.params.id }, { $set: { isActive: false } });
  res.json({ success: true });
});

/** Journal complet d'une commande pour l'équipe (les codes ne sont jamais montrés) */
admin.get("/orders/:id/trace", middelware.authAdmin, async (req, res) => {
  const { Commande } = require("../Models");
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return fail(res, 404, "Commande introuvable.");
  const o = await Commande.findById(req.params.id, { history: 1, handover: 1, cancel: 1, cancelReason: 1, cancelledAt: 1, etatTraitement: 1, releasedOnExpiry: 1, stockRestored: 1, needsReview: 1, reviewReason: 1 }).lean();
  if (!o) return fail(res, 404, "Commande introuvable.");
  res.json({
    success: true,
    history: (o.history || []).map((e) => ({ at: e.at, type: e.type, by: e.by, note: e.note, storeId: e.storeId })),
    handover: {
      stores: (o.handover?.stores || []).map((s) => ({ storeId: s.storeId, storeName: s.storeName, pickedUpAt: s.pickedUpAt, courier: s.courier, attempts: s.attempts || 0 })),
      deliveredAt: o.handover?.deliveredAt || null,
      deliveredBy: o.handover?.deliveredBy || null,
      deliveryAttempts: o.handover?.deliveryAttempts || 0,
    },
    cancel: trace.cancelInfo(o),
    needsReview: !!o.needsReview,
    reviewReason: o.reviewReason || "",
  });
});

/** Raisons d'annulation (liste fermée, partagée par l'admin) */
admin.get("/cancel-reasons", (_req, res) => {
  res.json({ success: true, data: Object.entries(trace.CANCEL_REASONS).filter(([k]) => k !== "paiement_non_abouti").map(([value, label]) => ({ value, label })) });
});

module.exports = { courierRouter: courier, courierAdminRouter: admin, Courier, normPhone };
