/**
 * MESSAGERIE BOUTIQUES — logique métier (partagée par les routes HTTP et le socket)
 *
 * Rooms du namespace Socket.IO « /messaging » :
 *   client:<userId>    tous les appareils d'un client
 *   seller:<sellerId>  l'équipe (managers) d'une boutique
 *   staff:all          les administrateurs (voient toutes les boutiques)
 */
const mongoose = require("mongoose");
const { Manager, StoreConversation, StoreMessage } = require("./models");
const { filterContacts } = require("./contactFilter");
const push = require("./push");

let nsp = null; // namespace Socket.IO, branché par socket.js
const setNamespace = (n) => { nsp = n; };
const getNamespace = () => nsp;

const ESCALATE_AFTER_MS = Number(process.env.MESSAGING_ESCALATE_MIN || 15) * 60 * 1000;
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ""));

// ─── Rooms ─────────────────────────────────────────────────────────────────────
const clientRoom = (id) => `client:${id}`;
const sellerRoom = (id) => `seller:${id}`;
const STAFF_ALL = "staff:all";

const toStaff = (sellerId) => nsp?.to([sellerRoom(sellerId), STAFF_ALL]);
const toClient = (clientId) => nsp?.to(clientRoom(clientId));

// ─── Boutiques (nom + logo, cache court) ───────────────────────────────────────
const storeCache = new Map();
async function storeInfo(sellerId) {
  const key = String(sellerId);
  const hit = storeCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.v;
  const { SellerRequest } = require("../Models");
  const s = await SellerRequest.findById(key).select("storeName name logo isvalid").lean();
  const v = s ? { id: key, name: s.storeName || s.name || "Boutique", logo: s.logo || null, active: s.isvalid !== false } : null;
  storeCache.set(key, { v, exp: Date.now() + 5 * 60 * 1000 });
  return v;
}

/** La boutique a-t-elle un membre de l'équipe connecté en ce moment ? */
async function isStoreOnline(sellerId) {
  if (!nsp) return false;
  const sockets = await nsp.in(sellerRoom(sellerId)).fetchSockets();
  return sockets.length > 0;
}

// ─── Sérialisation ─────────────────────────────────────────────────────────────
const messageForClient = (m) => ({
  id: String(m._id),
  conversationId: String(m.conversationId),
  from: m.from, // client | store | system
  text: m.text,
  attachments: m.attachments || [],
  card: m.card?.kind ? { ...m.card, id: m.card.id ? String(m.card.id) : null } : null,
  signature: m.signature || "",
  createdAt: m.createdAt,
  readAt: m.readAt,
  clientTempId: m.clientTempId || null,
});

const messageForStaff = (m) => ({
  ...messageForClient(m),
  internal: !!m.internal,
  author: m.author ? { kind: m.author.kind, id: m.author.id ? String(m.author.id) : null, name: m.author.name } : null,
  masked: !!m.masked,
  originalText: m.originalText || null,
});

async function conversationForClient(c) {
  return {
    id: String(c._id),
    store: await storeInfo(c.sellerId),
    lastMessage: c.lastMessage,
    unread: c.unread?.client || 0,
    updatedAt: c.updatedAt,
    createdAt: c.createdAt,
  };
}

async function conversationForStaff(c, { client, assigned } = {}) {
  return {
    id: String(c._id),
    store: await storeInfo(c.sellerId),
    client: client || (c.clientId?.name !== undefined
      ? { id: String(c.clientId._id), name: c.clientId.name || "Client" }
      : { id: String(c.clientId), name: "Client" }),
    assignedTo: assigned !== undefined ? assigned : (c.assignedTo?.name !== undefined
      ? { id: String(c.assignedTo._id), name: c.assignedTo.name }
      : c.assignedTo ? { id: String(c.assignedTo), name: "" } : null),
    status: c.status,
    lastMessage: c.lastMessage,
    unread: c.unread?.staff || 0,
    awaitingSince: c.awaitingSince,
    escalatedAt: c.escalatedAt,
    firstResponseMs: c.firstResponseMs,
    flagged: !!c.flagged,
    context: {
      productId: c.context?.productId ? String(c.context.productId) : null,
      orderId: c.context?.orderId ? String(c.context.orderId) : null,
    },
    updatedAt: c.updatedAt,
    createdAt: c.createdAt,
  };
}

// ─── Cartes produit / commande ─────────────────────────────────────────────────
async function productCard(productId, sellerId) {
  if (!isId(productId)) return null;
  const { Produit } = require("../Models");
  const p = await Produit.findById(productId).select("name image1 prix prixPromo Clefournisseur").lean();
  if (!p || (sellerId && String(p.Clefournisseur) !== String(sellerId))) return null;
  const price = p.prixPromo > 0 && p.prixPromo < p.prix ? p.prixPromo : p.prix;
  return { kind: "product", id: p._id, title: p.name, image: p.image1 || null, price, subtitle: "" };
}

async function orderCard(orderId, clientId) {
  if (!isId(orderId)) return null;
  const { Commande } = require("../Models");
  const o = await Commande.findById(orderId).select("clefUser reference prixTotal prix etatTraitement nbrProduits").lean();
  if (!o || (clientId && String(o.clefUser) !== String(clientId))) return null;
  const n = (o.nbrProduits || []).reduce((s, x) => s + (x.quantite || 0), 0);
  return {
    kind: "order", id: o._id, title: `Commande ${o.reference || ""}`.trim(), image: null,
    price: o.prixTotal || o.prix || 0, subtitle: `${n} article${n > 1 ? "s" : ""} · ${o.etatTraitement || ""}`,
  };
}

// ─── Affectation automatique ───────────────────────────────────────────────────
async function pickManager(sellerId) {
  const managers = await Manager.find({ sellerIds: sellerId, isActive: true, "permissions.messages": { $ne: false } })
    .select("_id name lastSeenAt").lean();
  if (!managers.length) return null;
  if (managers.length === 1) return managers[0]._id;
  // Le moins chargé (conversations ouvertes), puis le plus récemment actif
  const loads = await StoreConversation.aggregate([
    { $match: { assignedTo: { $in: managers.map((m) => m._id) }, status: "open" } },
    { $group: { _id: "$assignedTo", n: { $sum: 1 } } },
  ]);
  const load = new Map(loads.map((l) => [String(l._id), l.n]));
  managers.sort((a, b) =>
    (load.get(String(a._id)) || 0) - (load.get(String(b._id)) || 0) ||
    new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0));
  return managers[0]._id;
}

// ─── Conversations ─────────────────────────────────────────────────────────────
/** Ouvre (ou retrouve) la conversation client ↔ boutique */
async function openConversation({ clientId, sellerId, productId, orderId }) {
  if (!isId(sellerId)) throw Object.assign(new Error("Boutique invalide."), { status: 400 });
  const store = await storeInfo(sellerId);
  if (!store) throw Object.assign(new Error("Boutique introuvable."), { status: 404 });

  let conv = await StoreConversation.findOne({ clientId, sellerId });
  let created = false;
  if (!conv) {
    try {
      conv = await StoreConversation.create({ clientId, sellerId, assignedTo: await pickManager(sellerId), status: "pending" });
      created = true;
    } catch (e) {
      if (e.code !== 11000) throw e;
      conv = await StoreConversation.findOne({ clientId, sellerId }); // création simultanée
    }
  }

  // Contexte : le produit / la commande depuis lequel le client écrit
  const card = productId ? await productCard(productId, sellerId) : orderId ? await orderCard(orderId, clientId) : null;
  if (card) {
    const field = card.kind === "product" ? "context.productId" : "context.orderId";
    await StoreConversation.updateOne({ _id: conv._id }, { $set: { [field]: card.id, clientArchived: false } }, { timestamps: false });
    conv = await StoreConversation.findById(conv._id);
  }
  return { conversation: conv, card, created };
}

/**
 * Enregistre un message et le diffuse.
 * actor : { kind: 'client', id } | staff (admin / manager)
 */
async function postMessage({ conversation, actor, text, card = null, attachments = [], internal = false, clientTempId = null }) {
  const isClient = actor.kind === "client";
  const raw = String(text || "").trim().slice(0, 2000);
  const files = (attachments || []).filter((u) => /^https:\/\/res\.cloudinary\.com\//.test(String(u))).slice(0, 4);
  if (!raw && !card && !files.length) throw Object.assign(new Error("Message vide."), { status: 400 });

  // Renvoi du même message (réseau instable) : on rend celui déjà enregistré
  if (clientTempId) {
    const dup = await StoreMessage.findOne({ conversationId: conversation._id, clientTempId: String(clientTempId) }).lean();
    if (dup) return { message: dup, duplicate: true };
  }

  const { text: safeText, masked } = internal ? { text: raw, masked: false } : filterContacts(raw);
  const store = await storeInfo(conversation.sellerId);
  const from = isClient ? "client" : "store";
  const signature = !isClient && !internal && actor.displayName ? `${actor.displayName} · équipe ${store?.name || ""}`.trim() : "";

  const message = await StoreMessage.create({
    conversationId: conversation._id,
    from,
    author: isClient ? { kind: "client", id: actor.id, name: "" } : { kind: actor.kind, id: isId(actor.id) ? actor.id : null, name: actor.name || "" },
    internal: !!internal && !isClient,
    text: safeText,
    originalText: masked ? raw : null,
    masked,
    attachments: files,
    card: card || undefined,
    signature,
    clientTempId: clientTempId ? String(clientTempId) : null,
  });
  const plain = message.toObject();

  // Note interne : seulement l'équipe, la conversation ne bouge pas côté client
  if (plain.internal) {
    toStaff(conversation.sellerId)?.emit("message:new", { conversationId: String(conversation._id), message: messageForStaff(plain) });
    return { message: plain };
  }

  const preview = safeText || (card ? (card.kind === "product" ? `🛍️ ${card.title}` : `📦 ${card.title}`) : "📷 Photo");
  const now = new Date();
  const update = { $set: { lastMessage: { text: preview.slice(0, 140), from, at: now }, clientArchived: false } };
  if (masked) update.$set.flagged = true;
  if (isClient) {
    update.$inc = { "unread.staff": 1 };
    update.$set.status = "open";
    if (!conversation.awaitingSince) update.$set.awaitingSince = now;
  } else {
    update.$inc = { "unread.client": 1 };
    update.$set.status = "pending"; // la balle est dans le camp du client
    update.$set.awaitingSince = null;
    update.$set.escalatedAt = null;
    if (conversation.firstResponseMs == null && conversation.awaitingSince) {
      update.$set.firstResponseMs = now - new Date(conversation.awaitingSince);
    }
    // Premier manager qui répond à une conversation sans responsable : il la prend
    if (!conversation.assignedTo && actor.kind === "manager") update.$set.assignedTo = actor.id;
  }
  const conv = await StoreConversation.findByIdAndUpdate(conversation._id, update, { new: true }).lean();

  // Diffusion temps réel
  const convId = String(conv._id);
  toClient(conv.clientId)?.emit("message:new", { conversationId: convId, message: messageForClient(plain) });
  toClient(conv.clientId)?.emit("conversation:updated", await conversationForClient(conv));
  toStaff(conv.sellerId)?.emit("message:new", { conversationId: convId, message: messageForStaff(plain) });
  toStaff(conv.sellerId)?.emit("conversation:updated", await conversationForStaff(conv));
  emitClientUnread(conv.clientId);

  // Push au client s'il n'a pas la conversation ouverte à l'écran
  if (!isClient) {
    const focused = await clientIsViewing(conv.clientId, convId);
    if (!focused) {
      push.sendToClient(conv.clientId, {
        title: store?.name || "Nouveau message",
        body: preview.length > 120 ? `${preview.slice(0, 117)}…` : preview,
        data: { type: "store_message", conversationId: convId, sellerId: String(conv.sellerId) },
      }).catch((e) => console.error("[Messagerie] push :", e.message));
    }
  }
  return { message: plain, conversation: conv };
}

async function clientIsViewing(clientId, conversationId) {
  if (!nsp) return false;
  const sockets = await nsp.in(clientRoom(clientId)).fetchSockets();
  return sockets.some((s) => s.data.viewing === conversationId);
}

/** Marque comme lus les messages de l'autre partie */
async function markRead({ conversation, by }) {
  const now = new Date();
  const otherFrom = by === "client" ? "store" : "client";
  const r = await StoreMessage.updateMany(
    { conversationId: conversation._id, from: otherFrom, readAt: null, internal: { $ne: true } },
    { $set: { readAt: now } }
  );
  await StoreConversation.updateOne(
    { _id: conversation._id },
    { $set: { [by === "client" ? "unread.client" : "unread.staff"]: 0 } },
    { timestamps: false }
  );
  const payload = { conversationId: String(conversation._id), by: by === "client" ? "client" : "store", at: now };
  if (r.modifiedCount > 0) {
    if (by === "client") toStaff(conversation.sellerId)?.emit("message:read", payload);
    else toClient(conversation.clientId)?.emit("message:read", payload);
  }
  if (by === "client") emitClientUnread(conversation.clientId);
  else toStaff(conversation.sellerId)?.emit("conversation:read", { conversationId: String(conversation._id) });
  return r.modifiedCount;
}

async function clientUnreadTotal(clientId) {
  const [r] = await StoreConversation.aggregate([
    { $match: { clientId: new mongoose.Types.ObjectId(String(clientId)) } },
    { $group: { _id: null, n: { $sum: "$unread.client" } } },
  ]);
  return r?.n || 0;
}

async function emitClientUnread(clientId) {
  try {
    toClient(clientId)?.emit("unread:count", { count: await clientUnreadTotal(clientId) });
  } catch { /* indicatif */ }
}

/** Historique paginé (du plus récent au plus ancien) */
async function listMessages({ conversationId, before, limit = 30, staff = false }) {
  const q = { conversationId };
  if (!staff) q.internal = { $ne: true };
  if (isId(before)) q._id = { $lt: before };
  const rows = await StoreMessage.find(q).sort({ _id: -1 }).limit(Math.min(Number(limit) || 30, 100)).lean();
  return rows.map(staff ? messageForStaff : messageForClient);
}

// ─── Escalade : conversation sans réponse depuis trop longtemps ────────────────
async function escalateOverdue() {
  const limit = new Date(Date.now() - ESCALATE_AFTER_MS);
  const overdue = await StoreConversation.find({ status: "open", awaitingSince: { $lte: limit }, escalatedAt: null }).limit(100).lean();
  for (const c of overdue) {
    await StoreConversation.updateOne({ _id: c._id }, { $set: { escalatedAt: new Date() } }, { timestamps: false });
    nsp?.to(STAFF_ALL).emit("conversation:escalated", await conversationForStaff({ ...c, escalatedAt: new Date() }));
  }
  return overdue.length;
}

module.exports = {
  setNamespace,
  getNamespace,
  clientRoom,
  sellerRoom,
  STAFF_ALL,
  storeInfo,
  isStoreOnline,
  messageForClient,
  messageForStaff,
  conversationForClient,
  conversationForStaff,
  productCard,
  orderCard,
  pickManager,
  openConversation,
  postMessage,
  markRead,
  clientUnreadTotal,
  listMessages,
  escalateOverdue,
  isId,
};
