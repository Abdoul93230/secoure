/**
 * TRAÇABILITÉ DES COMMANDES
 *
 * - history : journal en ajout seul ($push, jamais modifié) — qui a fait quoi et quand.
 * - handover : codes de remise.
 *     stores[].pickupCode : affiché au VENDEUR, saisi par le livreur au retrait du colis ;
 *     deliveryCode        : affiché au CLIENT, saisi par le livreur à la livraison.
 * - cancel : raison d'annulation (liste fermée), auteur, note — montrée au vendeur et au client.
 */
const crypto = require("crypto");

const CANCEL_REASONS = {
  client_injoignable: "Client injoignable",
  client_annule: "Annulée à la demande du client",
  rupture_stock: "Article en rupture de stock",
  hors_zone: "Adresse hors zone de livraison",
  paiement_non_abouti: "Paiement non abouti",
  doublon: "Commande en double",
  autre: "Autre raison",
};

const ACTOR_LABEL = {
  client: "Client",
  seller: "Boutique",
  admin: "Équipe Ihambaobab",
  courier: "Livreur",
  system: "Ihambaobab",
  ipay: "iPay",
};

const code4 = () => String(crypto.randomInt(0, 10000)).padStart(4, "0");

/** Ajoute une ligne au journal (ne lève jamais : la traçabilité ne bloque pas la commande) */
async function logEvent(orderId, { type, by = { kind: "system" }, note = "", storeId = null }) {
  try {
    const { Commande } = require("../Models");
    await Commande.updateOne({ _id: orderId }, {
      $push: {
        history: {
          at: new Date(),
          type,
          by: { kind: by.kind || "system", name: by.name || ACTOR_LABEL[by.kind] || "", id: by.id ? String(by.id) : null, phone: by.phone || null },
          note: String(note || "").slice(0, 300),
          storeId: storeId ? String(storeId) : null,
        },
      },
    });
  } catch (e) {
    console.error("⚠️ Journal de commande :", e.message);
  }
}

/** Boutiques d'une commande (répartition serveur, sinon produits) */
async function orderStores(order) {
  if (Array.isArray(order.shippingByStore) && order.shippingByStore.length) {
    return order.shippingByStore.filter((s) => s.storeId).map((s) => ({ storeId: String(s.storeId), storeName: s.storeName || "" }));
  }
  const { Produit, SellerRequest } = require("../Models");
  const prods = await Produit.find({ _id: { $in: (order.nbrProduits || []).map((p) => p.produit) } }, { Clefournisseur: 1 }).lean();
  const ids = [...new Set(prods.map((p) => String(p.Clefournisseur)).filter(Boolean))];
  const sellers = await SellerRequest.find({ _id: { $in: ids } }, { storeName: 1, name: 1 }).lean();
  return sellers.map((s) => ({ storeId: String(s._id), storeName: s.storeName || s.name || "" }));
}

/** Crée les codes de remise s'ils manquent (commandes passées avant cette fonctionnalité incluses) */
async function ensureHandover(order) {
  if (order?.handover?.deliveryCode && order.handover.stores?.length) return order.handover;
  const { Commande } = require("../Models");
  const stores = (await orderStores(order)).map((s) => ({ ...s, pickupCode: code4(), pickedUpAt: null, courier: null, attempts: 0 }));
  const handover = { deliveryCode: code4(), deliveryAttempts: 0, deliveredAt: null, deliveredBy: null, stores };
  // Seulement si personne ne les a créés entre-temps
  await Commande.updateOne({ _id: order._id, "handover.deliveryCode": { $exists: false } }, { $set: { handover } });
  const fresh = await Commande.findById(order._id, { handover: 1 }).lean();
  return fresh?.handover || handover;
}

const isClosed = (o) => ["annulé", "livré", "livraison reçu", "Traité"].includes(o.etatTraitement);

// ─── Vue VENDEUR ───────────────────────────────────────────────────────────────
const sellerEvent = (e, sellerId) => ({
  at: e.at,
  type: e.type,
  by: e.by?.kind === "client" ? "Client" : e.by?.kind === "seller" ? (e.storeId && e.storeId !== sellerId ? "Autre boutique" : "Vous") : e.by?.name || ACTOR_LABEL[e.by?.kind] || "",
  courier: e.by?.kind === "courier" ? { name: e.by.name, phone: e.by.phone } : null,
  note: e.note || "",
});

/** Ajoute à chaque commande de la liste vendeur : code de retrait, journal, raison d'annulation */
async function decorateForSeller(orders, sellerId) {
  if (!orders?.length) return orders;
  const { Commande } = require("../Models");
  const sid = String(sellerId);
  const docs = await Commande.find({ _id: { $in: orders.map((o) => o._id) } },
    { history: 1, handover: 1, cancel: 1, cancelReason: 1, etatTraitement: 1, shippingByStore: 1, nbrProduits: 1 }).lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  for (const o of orders) {
    const d = byId.get(String(o._id));
    if (!d) continue;
    let handover = d.handover;
    if (!handover?.deliveryCode && !isClosed(d)) handover = await ensureHandover(d);
    const mine = handover?.stores?.find((s) => s.storeId === sid) || null;
    o.trace = {
      pickupCode: mine && !mine.pickedUpAt && !isClosed(d) ? mine.pickupCode : null,
      pickedUpAt: mine?.pickedUpAt || null,
      courier: mine?.courier ? { name: mine.courier.name, phone: mine.courier.phone } : null,
      deliveredAt: handover?.deliveredAt || null,
      cancel: cancelInfo(d),
      history: (d.history || []).filter((e) => !e.storeId || e.storeId === sid || e.type !== "picked_up").map((e) => sellerEvent(e, sid)),
    };
  }
  return orders;
}

function cancelInfo(d) {
  if (d.etatTraitement !== "annulé") return null;
  const code = d.cancel?.reason || d.cancelReason || null;
  return {
    reason: code,
    label: CANCEL_REASONS[code] || "Annulée",
    by: d.cancel?.byLabel || (code === "paiement_non_abouti" ? "Ihambaobab (automatique)" : ACTOR_LABEL.admin),
    note: d.cancel?.note || "",
    at: d.cancel?.at || d.cancelledAt || null,
    restored: d.releasedOnExpiry || (d.stockRestored ? { stock: true } : null),
  };
}

// ─── Vue CLIENT ────────────────────────────────────────────────────────────────
const CLIENT_LABELS = {
  created: "Commande passée",
  paid: "Paiement confirmé",
  payment_failed: "Paiement non abouti",
  expired: "Annulée : paiement non abouti",
  accepted: "Acceptée par la boutique",
  picked_up: "Remise au livreur",
  in_delivery: "En cours de livraison",
  delivered: "Livrée",
  cancelled: "Annulée",
  reactivated: "Paiement reçu, commande rétablie",
};

/** Informations claires pour le client : montants, réservation, code de livraison, étapes */
async function clientTrace(order) {
  const { PAYMENT_WINDOW_MIN } = require("./orderPaymentLifecycle");
  const awaiting = !!order.awaitingPayment && order.etatTraitement !== "annulé";
  const startedAt = order.paymentStartedAt || order.date;
  let handover = order.handover;
  if (!awaiting && !isClosed(order) && !handover?.deliveryCode) handover = await ensureHandover(order);
  return {
    breakdown: {
      subtotal: order.prixTotal || 0,
      shipping: order.fraisLivraison || 0,
      promoCode: order.codePromo || null,
      promoDiscount: order.reduction || 0,
      points: order.pointsUsed || 0,
      pointsDiscount: order.pointsDiscount || 0,
      total: order.prix || 0,
    },
    payment: {
      awaiting,
      deadline: awaiting && startedAt ? new Date(new Date(startedAt).getTime() + PAYMENT_WINDOW_MIN * 60000) : null,
      paid: order.statusPayment === "payé",
    },
    // Code donné au livreur à la réception (seulement pour une commande en cours de livraison)
    deliveryCode: !awaiting && !isClosed(order) ? handover?.deliveryCode || null : null,
    cancel: cancelInfo(order),
    history: (order.history || [])
      .filter((e) => CLIENT_LABELS[e.type])
      .map((e) => ({ at: e.at, type: e.type, label: CLIENT_LABELS[e.type], note: e.type === "cancelled" || e.type === "expired" ? e.note : "" })),
  };
}

// ─── Notifications ─────────────────────────────────────────────────────────────
async function sellerIdsOf(order) {
  return (await orderStores(order)).map((s) => s.storeId);
}

async function notifySellers(order, { title, body, type }, io) {
  try {
    const { SellerRequest } = require("../Models");
    const { sendExpoPushToSellers } = require("../utils/expoNotifications");
    const ids = await sellerIdsOf(order);
    if (!ids.length) return;
    if (io) ids.forEach((sid) => io.to(`seller:${sid}`).emit("order_status_updated", { commandeId: order._id, reference: order.reference, etatTraitement: order.etatTraitement, type }));
    const sellers = await SellerRequest.find({ _id: { $in: ids } }, { expoPushTokens: 1 }).lean();
    await sendExpoPushToSellers(ids, sellers.flatMap((s) => s.expoPushTokens || []), {
      title, body, data: { type, orderId: String(order._id), reference: order.reference },
    });
  } catch (e) {
    console.error("⚠️ Notification vendeurs :", e.message);
  }
}

async function notifyClient(order, { title, body }) {
  try {
    if (!order.clefUser) return;
    await require("../messaging/push").sendToClient(order.clefUser, {
      title, body, data: { type: "order", orderId: String(order._id), reference: order.reference },
    });
  } catch (e) {
    console.error("⚠️ Notification client :", e.message);
  }
}

module.exports = {
  CANCEL_REASONS,
  ACTOR_LABEL,
  logEvent,
  ensureHandover,
  decorateForSeller,
  clientTrace,
  cancelInfo,
  notifySellers,
  notifyClient,
};
