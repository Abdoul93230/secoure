/**
 * MESSAGERIE BOUTIQUES — routes HTTP
 *
 *   /api/messaging/*  côté client (app mobile + site)      → requireClient
 *   /api/staff/*      côté équipe (admins + managers)      → requireStaff (périmètre de boutiques)
 *   /api/staff/managers/*  gestion des managers            → requireSuperAdmin
 */
const express = require("express");
const bcrypt = require("bcrypt");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

const { Manager, StoreConversation, QuickReply } = require("./models");
const {
  requireClient, requireStaff, requireSuperAdmin, canAccessSeller, sellerScope,
  staffFromToken, clientFromToken, readToken,
} = require("./staffAuth");
const svc = require("./service");
const push = require("./push");

const client = express.Router();
const staff = express.Router();

const asyncH = (fn) => (req, res) => fn(req, res).catch((e) => {
  if (e.status) return res.status(e.status).json({ success: false, message: e.message });
  console.error("[Messagerie]", e);
  res.status(500).json({ success: false, message: "Erreur serveur, réessayez." });
});
const page = (req, max = 50) => ({
  limit: Math.min(Math.max(parseInt(req.query.limit) || 20, 1), max),
  skip: Math.max((parseInt(req.query.page) || 1) - 1, 0) * Math.min(Math.max(parseInt(req.query.limit) || 20, 1), max),
});
const sendLimiter = rateLimit({ windowMs: 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: "Trop de messages envoyés, patientez une minute." } });

// ═══ Pièces jointes (photos) — client ou équipe ════════════════════════════════
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpe?g|png|webp|heic|heif)$/i.test(file.mimetype)),
});
const anyMember = async (req, res, next) => {
  const token = readToken(req);
  if (clientFromToken(token) || (await staffFromToken(token))) return next();
  res.status(401).json({ success: false, message: "Authentification requise." });
};
const uploadImage = asyncH(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "Image manquante (JPG, PNG ou WebP, 6 Mo max)." });
  const cloudinary = require("../cloudinary");
  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: "messagerie", resource_type: "image", transformation: [{ width: 1600, height: 1600, crop: "limit", quality: "auto" }] },
      (err, r) => (err ? reject(err) : resolve(r))
    ).end(req.file.buffer);
  });
  res.json({ success: true, url: result.secure_url });
});
client.post("/upload", anyMember, upload.single("image"), uploadImage);

// Messages vocaux : converti en MP3 par Cloudinary (lisible sur Android, iPhone et navigateurs)
const uploadAudioMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^(audio|video)\//i.test(file.mimetype) || /\.(m4a|aac|mp3|webm|ogg|opus|wav|3gp|caf)$/i.test(file.originalname || "")),
});
client.post("/upload-audio", anyMember, uploadAudioMw.single("audio"), asyncH(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "Enregistrement manquant ou trop long (12 Mo max)." });
  const cloudinary = require("../cloudinary");
  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: "messagerie/vocaux", resource_type: "video", format: "mp3", audio_codec: "mp3", bit_rate: "64k" },
      (err, r) => (err ? reject(err) : resolve(r))
    ).end(req.file.buffer);
  });
  res.json({ success: true, url: result.secure_url, durationMs: Math.round((result.duration || 0) * 1000) });
}));

// ═══ CLIENT ════════════════════════════════════════════════════════════════════
const loadClientConv = async (req) => {
  if (!svc.isId(req.params.id)) throw Object.assign(new Error("Conversation introuvable."), { status: 404 });
  const conv = await StoreConversation.findOne({ _id: req.params.id, clientId: req.client.id });
  if (!conv) throw Object.assign(new Error("Conversation introuvable."), { status: 404 });
  return conv;
};

/** Ouvre la conversation avec une boutique (depuis un produit, une boutique ou une commande) */
client.post("/conversations", requireClient, asyncH(async (req, res) => {
  const { sellerId, productId, orderId } = req.body || {};
  const { conversation, card } = await svc.openConversation({ clientId: req.client.id, sellerId, productId, orderId });
  res.json({
    success: true,
    conversation: await svc.conversationForClient(conversation.toObject()),
    context: card ? { ...card, id: String(card.id) } : null,
    storeOnline: await svc.isStoreOnline(sellerId),
  });
}));

client.get("/conversations", requireClient, asyncH(async (req, res) => {
  const { limit, skip } = page(req);
  const rows = await StoreConversation.find({ clientId: req.client.id, clientArchived: { $ne: true }, "lastMessage.at": { $ne: null } })
    .sort({ updatedAt: -1 }).skip(skip).limit(limit).lean();
  res.json({ success: true, data: await Promise.all(rows.map(svc.conversationForClient)) });
}));

client.get("/conversations/:id", requireClient, asyncH(async (req, res) => {
  const conv = await loadClientConv(req);
  res.json({ success: true, conversation: await svc.conversationForClient(conv.toObject()), storeOnline: await svc.isStoreOnline(conv.sellerId) });
}));

client.get("/conversations/:id/messages", requireClient, asyncH(async (req, res) => {
  const conv = await loadClientConv(req);
  res.json({ success: true, data: await svc.listMessages({ conversationId: conv._id, before: req.query.before, limit: req.query.limit }) });
}));

/** Envoi par HTTP (repli quand le socket n'est pas connecté) */
client.post("/conversations/:id/messages", requireClient, sendLimiter, asyncH(async (req, res) => {
  const conv = await loadClientConv(req);
  const { text, productId, orderId, attachments, audio, clientTempId } = req.body || {};
  const card = productId ? await svc.productCard(productId, conv.sellerId) : orderId ? await svc.orderCard(orderId, req.client.id) : null;
  const { message } = await svc.postMessage({ conversation: conv, actor: { kind: "client", id: req.client.id }, text, card, attachments, audio, clientTempId });
  res.json({ success: true, message: svc.messageForClient(message) });
}));

client.put("/conversations/:id/read", requireClient, asyncH(async (req, res) => {
  const conv = await loadClientConv(req);
  await svc.markRead({ conversation: conv, by: "client" });
  res.json({ success: true });
}));

/** Retire la conversation de la liste du client (elle réapparaît au prochain message) */
client.delete("/conversations/:id", requireClient, asyncH(async (req, res) => {
  const conv = await loadClientConv(req);
  await StoreConversation.updateOne({ _id: conv._id }, { $set: { clientArchived: true, "unread.client": 0 } }, { timestamps: false });
  res.json({ success: true });
}));

client.get("/unread", requireClient, asyncH(async (req, res) => {
  res.json({ success: true, count: await svc.clientUnreadTotal(req.client.id) });
}));

/** Jeton de notifications push de l'appareil */
client.post("/push-token", requireClient, asyncH(async (req, res) => {
  const token = String(req.body?.token || "");
  if (!push.isExpoPushToken(token)) return res.status(400).json({ success: false, message: "Jeton push invalide." });
  const { User } = require("../Models");
  // Un appareil = un compte : on retire le jeton des autres comptes (changement d'utilisateur)
  await User.updateMany({ _id: { $ne: req.client.id }, expoPushTokens: token }, { $pull: { expoPushTokens: token } });
  await User.updateOne({ _id: req.client.id }, { $addToSet: { expoPushTokens: token } });
  // 10 appareils max par compte
  const u = await User.findById(req.client.id).select("expoPushTokens").lean();
  if ((u?.expoPushTokens || []).length > 10) {
    await User.updateOne({ _id: req.client.id }, { $set: { expoPushTokens: u.expoPushTokens.slice(-10) } });
  }
  res.json({ success: true });
}));

client.delete("/push-token", requireClient, asyncH(async (req, res) => {
  const { User } = require("../Models");
  await User.updateOne({ _id: req.client.id }, { $pull: { expoPushTokens: String(req.body?.token || "") } });
  res.json({ success: true });
}));

// ═══ ÉQUIPE ════════════════════════════════════════════════════════════════════
const loadStaffConv = async (req) => {
  if (!svc.isId(req.params.id)) throw Object.assign(new Error("Conversation introuvable."), { status: 404 });
  const conv = await StoreConversation.findById(req.params.id);
  if (!conv || !canAccessSeller(req.staff, conv.sellerId)) throw Object.assign(new Error("Conversation introuvable."), { status: 404 });
  return conv;
};

/** Profil de la personne connectée + ses boutiques */
staff.get("/me", requireStaff(), asyncH(async (req, res) => {
  const { SellerRequest } = require("../Models");
  const q = req.staff.sellerIds === null ? {} : { _id: { $in: req.staff.sellerIds } };
  const sellers = await SellerRequest.find(q).select("storeName name logo isvalid").sort({ storeName: 1 }).limit(req.staff.sellerIds === null ? 0 : 500).lean();
  res.json({
    success: true,
    staff: { kind: req.staff.kind, id: req.staff.id, name: req.staff.name, displayName: req.staff.displayName, permissions: req.staff.permissions },
    sellers: sellers.map((s) => ({ id: String(s._id), name: s.storeName || s.name, logo: s.logo || null, active: s.isvalid !== false })),
  });
}));

staff.get("/conversations", requireStaff("messages"), asyncH(async (req, res) => {
  const { limit, skip } = page(req, 100);
  const q = { ...sellerScope(req.staff), "lastMessage.at": { $ne: null } };
  if (req.query.sellerId) {
    if (!canAccessSeller(req.staff, req.query.sellerId)) return res.json({ success: true, data: [], total: 0 });
    q.sellerId = req.query.sellerId;
  }
  if (["open", "pending", "resolved"].includes(req.query.status)) q.status = req.query.status;
  if (req.query.assigned === "me") q.assignedTo = svc.isId(req.staff.id) ? req.staff.id : null;
  if (req.query.assigned === "none") q.assignedTo = null;
  if (req.query.flagged === "1") q.flagged = true;
  if (req.query.escalated === "1") q.escalatedAt = { $ne: null };
  if (req.query.q) {
    const { User } = require("../Models");
    const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 60), "i");
    const users = await User.find({ name: rx }).select("_id").limit(200).lean();
    q.$or = [{ clientId: { $in: users.map((u) => u._id) } }, { "lastMessage.text": rx }];
  }
  const [rows, total] = await Promise.all([
    StoreConversation.find(q).sort({ status: 1, updatedAt: -1 }).skip(skip).limit(limit)
      .populate("clientId", "name").populate("assignedTo", "name").lean(),
    StoreConversation.countDocuments(q),
  ]);
  res.json({ success: true, total, data: await Promise.all(rows.map((c) => svc.conversationForStaff(c))) });
}));

/** Compteurs pour les badges de l'interface */
staff.get("/conversations/counts", requireStaff("messages"), asyncH(async (req, res) => {
  const scope = sellerScope(req.staff);
  const match = { ...scope, "lastMessage.at": { $ne: null } };
  if (match.sellerId) match.sellerId = { $in: req.staff.sellerIds.map((id) => new mongoose.Types.ObjectId(id)) };
  const [byStatus, unread] = await Promise.all([
    StoreConversation.aggregate([{ $match: match }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    StoreConversation.aggregate([{ $match: match }, { $group: { _id: null, n: { $sum: "$unread.staff" } } }]),
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.n]));
  res.json({ success: true, open: counts.open || 0, pending: counts.pending || 0, resolved: counts.resolved || 0, unread: unread[0]?.n || 0 });
}));

/** Détail : conversation + fiche client (sans coordonnées) + ses commandes chez cette boutique */
staff.get("/conversations/:id", requireStaff("messages"), asyncH(async (req, res) => {
  const conv = await loadStaffConv(req);
  const { User, Commande } = require("../Models");
  const [user, assigned, orders, product] = await Promise.all([
    User.findById(conv.clientId).select("name dateCreating createdAt").lean(),
    conv.assignedTo ? Manager.findById(conv.assignedTo).select("name").lean() : null,
    req.staff.permissions.orders !== false
      ? Commande.find({ clefUser: String(conv.clientId), "shippingByStore.storeId": String(conv.sellerId) })
        .select("reference prixTotal prix etatTraitement statusPayment date").sort({ date: -1 }).limit(5).lean()
      : [],
    conv.context?.productId ? svc.productCard(conv.context.productId) : null,
  ]);
  res.json({
    success: true,
    conversation: await svc.conversationForStaff(conv.toObject(), {
      client: { id: String(conv.clientId), name: user?.name || "Client", since: user?.dateCreating || user?.createdAt || null },
      assigned: assigned ? { id: String(assigned._id), name: assigned.name } : null,
    }),
    orders: orders.map((o) => ({ id: String(o._id), reference: o.reference, total: o.prixTotal || o.prix || 0, status: o.etatTraitement, payment: o.statusPayment, date: o.date })),
    product: product ? { ...product, id: String(product.id) } : null,
  });
}));

staff.get("/conversations/:id/messages", requireStaff("messages"), asyncH(async (req, res) => {
  const conv = await loadStaffConv(req);
  res.json({ success: true, data: await svc.listMessages({ conversationId: conv._id, before: req.query.before, limit: req.query.limit, staff: true }) });
}));

staff.post("/conversations/:id/messages", requireStaff("messages"), sendLimiter, asyncH(async (req, res) => {
  const conv = await loadStaffConv(req);
  const { text, internal, productId, orderId, attachments, audio, clientTempId } = req.body || {};
  const card = productId ? await svc.productCard(productId, conv.sellerId) : orderId ? await svc.orderCard(orderId, conv.clientId) : null;
  const { message } = await svc.postMessage({ conversation: conv, actor: req.staff, text, card, attachments, audio, internal: !!internal, clientTempId });
  res.json({ success: true, message: svc.messageForStaff(message) });
}));

staff.put("/conversations/:id/read", requireStaff("messages"), asyncH(async (req, res) => {
  const conv = await loadStaffConv(req);
  await svc.markRead({ conversation: conv, by: "store" });
  res.json({ success: true });
}));

/** Statut (open / pending / resolved) et responsable */
staff.patch("/conversations/:id", requireStaff("messages"), asyncH(async (req, res) => {
  const conv = await loadStaffConv(req);
  const set = {};
  const { status, assignedTo } = req.body || {};
  if (["open", "pending", "resolved"].includes(status)) {
    set.status = status;
    if (status === "resolved") { set.awaitingSince = null; set.escalatedAt = null; }
  }
  if (assignedTo !== undefined) {
    if (assignedTo === null || assignedTo === "") set.assignedTo = null;
    else {
      const m = svc.isId(assignedTo) ? await Manager.findOne({ _id: assignedTo, isActive: true, sellerIds: conv.sellerId }).select("_id").lean() : null;
      if (!m) return res.status(400).json({ success: false, message: "Ce manager ne gère pas cette boutique." });
      if (req.staff.kind === "manager" && String(m._id) !== req.staff.id && String(conv.assignedTo || "") !== req.staff.id) {
        return res.status(403).json({ success: false, message: "Seul le responsable ou un admin peut réaffecter." });
      }
      set.assignedTo = m._id;
    }
  }
  const updated = await StoreConversation.findByIdAndUpdate(conv._id, { $set: set }, { new: true, timestamps: false })
    .populate("clientId", "name").populate("assignedTo", "name").lean();
  const payload = await svc.conversationForStaff(updated);
  svc.getNamespace()?.to([svc.sellerRoom(conv.sellerId), svc.STAFF_ALL]).emit("conversation:updated", payload);
  res.json({ success: true, conversation: payload });
}));

// ─── Réponses rapides ──────────────────────────────────────────────────────────
staff.get("/quick-replies", requireStaff("messages"), asyncH(async (req, res) => {
  const owner = svc.isId(req.staff.id) ? req.staff.id : null;
  const rows = await QuickReply.find({ $or: [{ ownerId: null }, ...(owner ? [{ ownerId: owner }] : [])] }).sort({ ownerId: 1, title: 1 }).lean();
  res.json({ success: true, data: rows.map((r) => ({ id: String(r._id), title: r.title, text: r.text, shared: !r.ownerId })) });
}));

staff.post("/quick-replies", requireStaff("messages"), asyncH(async (req, res) => {
  const { title, text, shared } = req.body || {};
  if (!String(title || "").trim() || !String(text || "").trim()) return res.status(400).json({ success: false, message: "Titre et texte requis." });
  // Réponses communes : admins seulement
  const ownerId = shared && req.staff.kind === "admin" ? null : (svc.isId(req.staff.id) ? req.staff.id : null);
  const r = await QuickReply.create({ title, text, ownerId });
  res.json({ success: true, data: { id: String(r._id), title: r.title, text: r.text, shared: !r.ownerId } });
}));

staff.delete("/quick-replies/:id", requireStaff("messages"), asyncH(async (req, res) => {
  if (!svc.isId(req.params.id)) return res.status(404).json({ success: false });
  const q = { _id: req.params.id };
  if (req.staff.kind !== "admin") q.ownerId = req.staff.id;
  await QuickReply.deleteOne(q);
  res.json({ success: true });
}));

// ─── Boutiques du périmètre : tableau de bord ──────────────────────────────────
staff.get("/sellers", requireStaff(), asyncH(async (req, res) => {
  const { SellerRequest, Produit } = require("../Models");
  const ids = req.staff.sellerIds;
  const sellers = await SellerRequest.find(ids === null ? {} : { _id: { $in: ids } })
    .select("storeName name logo isvalid city").sort({ storeName: 1 }).lean();
  const oids = sellers.map((s) => s._id);
  const [pending, open] = await Promise.all([
    Produit.aggregate([{ $match: { Clefournisseur: { $in: oids }, isPublished: "Attente", isDeleted: { $ne: true } } }, { $group: { _id: "$Clefournisseur", n: { $sum: 1 } } }]),
    StoreConversation.aggregate([{ $match: { sellerId: { $in: oids }, status: "open" } }, { $group: { _id: "$sellerId", n: { $sum: 1 } } }]),
  ]);
  const p = new Map(pending.map((x) => [String(x._id), x.n]));
  const o = new Map(open.map((x) => [String(x._id), x.n]));
  res.json({
    success: true,
    data: sellers.map((s) => ({
      id: String(s._id), name: s.storeName || s.name, logo: s.logo || null, city: s.city || "", active: s.isvalid !== false,
      pendingProducts: p.get(String(s._id)) || 0, openConversations: o.get(String(s._id)) || 0,
    })),
  });
}));

// ─── Modération des produits des boutiques du périmètre ────────────────────────
const productScope = (req) => {
  if (req.staff.sellerIds === null) return {};
  return { Clefournisseur: { $in: req.staff.sellerIds } };
};

staff.get("/products", requireStaff("products"), asyncH(async (req, res) => {
  const { Produit } = require("../Models");
  const { limit, skip } = page(req, 100);
  const q = { ...productScope(req), isDeleted: { $ne: true } };
  if (req.query.sellerId) {
    if (!canAccessSeller(req.staff, req.query.sellerId)) return res.json({ success: true, data: [], total: 0 });
    q.Clefournisseur = req.query.sellerId;
  }
  if (["Published", "UnPublished", "Attente", "Refuser"].includes(req.query.status)) q.isPublished = req.query.status;
  if (req.query.search) q.name = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 60), "i");
  const [rows, total] = await Promise.all([
    Produit.find(q).select("name image1 image2 image3 prix prixPromo quantite isPublished comments createdAt Clefournisseur ClefType description")
      .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Produit.countDocuments(q),
  ]);
  const names = new Map();
  for (const id of [...new Set(rows.map((r) => String(r.Clefournisseur)))]) names.set(id, (await svc.storeInfo(id))?.name || "");
  res.json({
    success: true, total,
    data: rows.map((p) => ({
      id: String(p._id), name: p.name, images: [p.image1, p.image2, p.image3].filter(Boolean), price: p.prix, promoPrice: p.prixPromo || 0,
      stock: p.quantite, status: p.isPublished, comments: p.comments, createdAt: p.createdAt, description: p.description || "",
      seller: { id: String(p.Clefournisseur), name: names.get(String(p.Clefournisseur)) },
    })),
  });
}));

staff.put("/products/:id/moderation", requireStaff("products"), asyncH(async (req, res) => {
  const { Produit } = require("../Models");
  if (!svc.isId(req.params.id)) return res.status(404).json({ success: false, message: "Produit introuvable." });
  const p = await Produit.findById(req.params.id).select("Clefournisseur").lean();
  if (!p || !canAccessSeller(req.staff, p.Clefournisseur)) return res.status(404).json({ success: false, message: "Produit introuvable." });
  const { published, comments } = req.body || {};
  if (!["Published", "UnPublished", "Attente", "Refuser"].includes(published)) return res.status(400).json({ success: false, message: "Statut invalide." });
  if (published === "Refuser" && !String(comments || "").trim()) return res.status(400).json({ success: false, message: "Indiquez au vendeur la raison du refus." });
  const updated = await Produit.findByIdAndUpdate(req.params.id, {
    isPublished: published,
    comments: String(comments || "").trim() || "Aucun commentaire",
    validatedBy: svc.isId(req.staff.id) ? req.staff.id : undefined,
    validatedByKind: req.staff.kind,
    isValidated: published === "Published",
    updatedAt: new Date(),
  }, { new: true }).select("isPublished comments").lean();
  res.json({ success: true, data: { id: req.params.id, status: updated.isPublished, comments: updated.comments } });
}));

// ─── Commandes des boutiques du périmètre (lecture) ────────────────────────────
staff.get("/orders", requireStaff("orders"), asyncH(async (req, res) => {
  const { Commande, User } = require("../Models");
  const { limit, skip } = page(req, 100);
  const ids = req.query.sellerId ? (canAccessSeller(req.staff, req.query.sellerId) ? [String(req.query.sellerId)] : []) : req.staff.sellerIds;
  if (ids !== null && !ids.length) return res.json({ success: true, data: [], total: 0 });
  const q = ids === null ? {} : { "shippingByStore.storeId": { $in: ids } };
  if (req.query.reference) q.reference = String(req.query.reference).trim();
  const [rows, total] = await Promise.all([
    Commande.find(q).select("reference prixTotal prix etatTraitement statusPayment date clefUser shippingByStore nbrProduits")
      .sort({ date: -1 }).skip(skip).limit(limit).lean(),
    Commande.countDocuments(q),
  ]);
  const users = await User.find({ _id: { $in: rows.map((r) => r.clefUser).filter(svc.isId) } }).select("name").lean();
  const uname = new Map(users.map((u) => [String(u._id), u.name]));
  res.json({
    success: true, total,
    data: rows.map((o) => ({
      id: String(o._id), reference: o.reference, total: o.prixTotal || o.prix || 0, status: o.etatTraitement, payment: o.statusPayment, date: o.date,
      client: uname.get(String(o.clefUser)) || "Client",
      stores: (o.shippingByStore || []).filter((s) => ids === null || ids.includes(String(s.storeId))).map((s) => s.storeName),
      items: (o.nbrProduits || []).reduce((s, x) => s + (x.quantite || 0), 0),
    })),
  });
}));

// ─── Statistiques de l'équipe ──────────────────────────────────────────────────
staff.get("/stats", requireStaff("messages"), asyncH(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 90);
  const since = new Date(Date.now() - days * 864e5);
  const match = { updatedAt: { $gte: since } };
  if (req.staff.sellerIds !== null) match.sellerId = { $in: req.staff.sellerIds.map((id) => new mongoose.Types.ObjectId(id)) };
  const rows = await StoreConversation.aggregate([
    { $match: match },
    { $group: {
      _id: "$assignedTo",
      conversations: { $sum: 1 },
      resolved: { $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] } },
      open: { $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] } },
      avgFirstResponseMs: { $avg: "$firstResponseMs" },
      escalated: { $sum: { $cond: [{ $ne: ["$escalatedAt", null] }, 1, 0] } },
    } },
  ]);
  const managers = await Manager.find({ _id: { $in: rows.map((r) => r._id).filter(Boolean) } }).select("name").lean();
  const mname = new Map(managers.map((m) => [String(m._id), m.name]));
  res.json({
    success: true, days,
    data: rows.map((r) => ({ managerId: r._id ? String(r._id) : null, name: r._id ? mname.get(String(r._id)) || "—" : "Sans responsable", ...r, _id: undefined }))
      .filter((r) => req.staff.kind === "admin" || r.managerId === req.staff.id),
  });
}));

// ═══ GESTION DES MANAGERS (super-admin) ═══════════════════════════════════════
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const managerJSON = async (m) => {
  const { SellerRequest } = require("../Models");
  const sellers = await SellerRequest.find({ _id: { $in: m.sellerIds || [] } }).select("storeName name").lean();
  return {
    id: String(m._id), name: m.name, email: m.email, phone: m.phone, displayName: m.displayName, isActive: m.isActive,
    permissions: m.permissions, lastLoginAt: m.lastLoginAt, lastSeenAt: m.lastSeenAt, createdAt: m.createdAt,
    sellers: sellers.map((s) => ({ id: String(s._id), name: s.storeName || s.name })),
  };
};
const cleanSellerIds = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(svc.isId))];

/** Après un changement de droits : ses connexions temps réel repartent avec le nouveau périmètre */
const refreshManagerSockets = async (managerId) => {
  const n = svc.getNamespace();
  if (!n) return;
  const sockets = await n.fetchSockets();
  sockets.filter((s) => s.data.actor?.kind === "manager" && s.data.actor.id === String(managerId)).forEach((s) => s.disconnect(true));
};

staff.get("/managers", requireSuperAdmin, asyncH(async (_req, res) => {
  const rows = await Manager.find().sort({ isActive: -1, name: 1 }).lean();
  res.json({ success: true, data: await Promise.all(rows.map(managerJSON)) });
}));

staff.post("/managers", requireSuperAdmin, asyncH(async (req, res) => {
  const { name, email, password, phone, displayName, sellerIds, permissions } = req.body || {};
  if (!String(name || "").trim() || !/^\S+@\S+\.\S+$/.test(String(email || ""))) return res.status(400).json({ success: false, message: "Nom et e-mail valides requis." });
  if (!PASSWORD_RULE.test(String(password || ""))) return res.status(400).json({ success: false, message: "Mot de passe : 8 caractères min., avec majuscule, minuscule et chiffre." });
  const { Admin } = require("../Models");
  const mail = String(email).toLowerCase().trim();
  if (await Admin.exists({ email: mail })) return res.status(409).json({ success: false, message: "Cet e-mail est déjà celui d'un administrateur." });
  if (await Manager.exists({ email: mail })) return res.status(409).json({ success: false, message: "Un manager utilise déjà cet e-mail." });
  const m = await Manager.create({
    name: String(name).trim(), email: mail, password: await bcrypt.hash(String(password), 10), phone: String(phone || ""),
    displayName: String(displayName || "").trim(), sellerIds: cleanSellerIds(sellerIds),
    permissions: { messages: permissions?.messages !== false, products: permissions?.products !== false, orders: permissions?.orders !== false },
    createdBy: svc.isId(req.staff.id) ? req.staff.id : null,
  });
  res.status(201).json({ success: true, data: await managerJSON(m.toObject()) });
}));

staff.put("/managers/:id", requireSuperAdmin, asyncH(async (req, res) => {
  if (!svc.isId(req.params.id)) return res.status(404).json({ success: false });
  const { name, phone, displayName, sellerIds, permissions, isActive, password } = req.body || {};
  const set = {};
  if (name !== undefined) set.name = String(name).trim();
  if (phone !== undefined) set.phone = String(phone);
  if (displayName !== undefined) set.displayName = String(displayName).trim();
  if (sellerIds !== undefined) set.sellerIds = cleanSellerIds(sellerIds);
  if (permissions) Object.entries(permissions).forEach(([k, v]) => { if (["messages", "products", "orders"].includes(k)) set[`permissions.${k}`] = !!v; });
  if (isActive !== undefined) set.isActive = !!isActive;
  if (password) {
    if (!PASSWORD_RULE.test(String(password))) return res.status(400).json({ success: false, message: "Mot de passe : 8 caractères min., avec majuscule, minuscule et chiffre." });
    set.password = await bcrypt.hash(String(password), 10);
  }
  const m = await Manager.findByIdAndUpdate(req.params.id, { $set: set }, { new: true }).lean();
  if (!m) return res.status(404).json({ success: false, message: "Manager introuvable." });
  // Boutiques retirées : ses conversations repassent « sans responsable »
  if (set.sellerIds || set.isActive === false) {
    await StoreConversation.updateMany(
      { assignedTo: m._id, ...(set.isActive === false ? {} : { sellerId: { $nin: m.sellerIds } }) },
      { $set: { assignedTo: null } }, { timestamps: false });
  }
  await refreshManagerSockets(m._id);
  res.json({ success: true, data: await managerJSON(m) });
}));

staff.delete("/managers/:id", requireSuperAdmin, asyncH(async (req, res) => {
  if (!svc.isId(req.params.id)) return res.status(404).json({ success: false });
  await Manager.deleteOne({ _id: req.params.id });
  await StoreConversation.updateMany({ assignedTo: req.params.id }, { $set: { assignedTo: null } }, { timestamps: false });
  await refreshManagerSockets(req.params.id);
  res.json({ success: true });
}));

module.exports = { clientRouter: client, staffRouter: staff };
