/**
 * MESSAGERIE BOUTIQUES — temps réel (namespace Socket.IO « /messaging »)
 *
 * Connexion authentifiée : socket.handshake.auth.token = jeton client, admin ou manager.
 * Le namespace par défaut (paiements, notifications vendeurs, ancien support) n'est pas touché.
 *
 * Client → serveur : conversation:view, conversation:leave, message:send (ack), message:read,
 *                    typing:start, typing:stop
 * Serveur → client : message:new, message:read, conversation:updated, conversation:read,
 *                    conversation:escalated, typing, unread:count, store:presence
 */
const { StoreConversation } = require("./models");
const { staffFromToken, clientFromToken, canAccessSeller } = require("./staffAuth");
const svc = require("./service");

const SEND_WINDOW_MS = 10_000;
const SEND_MAX = 20; // messages par fenêtre et par connexion

function setupMessagingSocket(io) {
  const nsp = io.of("/messaging");
  svc.setNamespace(nsp);

  nsp.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const client = clientFromToken(token);
      if (client) {
        socket.data.actor = { kind: "client", id: client.id };
        return next();
      }
      const staff = await staffFromToken(token);
      if (staff && staff.permissions.messages !== false) {
        socket.data.actor = staff;
        return next();
      }
      next(new Error("unauthorized"));
    } catch {
      next(new Error("unauthorized"));
    }
  });

  nsp.on("connection", (socket) => {
    const actor = socket.data.actor;
    socket.data.sent = [];
    socket.on("error", () => {});

    if (actor.kind === "client") {
      socket.join(svc.clientRoom(actor.id));
      svc.clientUnreadTotal(actor.id).then((count) => socket.emit("unread:count", { count })).catch(() => {});
    } else if (actor.kind === "admin") {
      socket.join(svc.STAFF_ALL);
    } else {
      actor.sellerIds.forEach((id) => socket.join(svc.sellerRoom(id)));
      // La boutique passe « en ligne » pour ses clients
      notifyPresence(nsp, actor.sellerIds, true);
    }

    // Charge et vérifie l'accès à une conversation
    const load = async (conversationId) => {
      if (!svc.isId(conversationId)) return null;
      const conv = await StoreConversation.findById(conversationId);
      if (!conv) return null;
      if (actor.kind === "client") return String(conv.clientId) === actor.id ? conv : null;
      return canAccessSeller(actor, conv.sellerId) ? conv : null;
    };

    // Le client a cette conversation à l'écran : pas de push, lecture immédiate
    socket.on("conversation:view", async ({ conversationId } = {}, ack) => {
      const conv = await load(conversationId).catch(() => null);
      if (!conv) return typeof ack === "function" && ack({ ok: false });
      socket.data.viewing = String(conv._id);
      await svc.markRead({ conversation: conv, by: actor.kind === "client" ? "client" : "store" }).catch(() => {});
      const online = actor.kind === "client" ? await svc.isStoreOnline(conv.sellerId) : undefined;
      typeof ack === "function" && ack({ ok: true, storeOnline: online });
    });

    socket.on("conversation:leave", () => { socket.data.viewing = null; });

    socket.on("message:send", async (data = {}, ack) => {
      const reply = (r) => typeof ack === "function" && ack(r);
      try {
        const now = Date.now();
        socket.data.sent = socket.data.sent.filter((t) => now - t < SEND_WINDOW_MS);
        if (socket.data.sent.length >= SEND_MAX) return reply({ ok: false, error: "Trop de messages, patientez quelques secondes." });
        socket.data.sent.push(now);

        const conv = await load(data.conversationId);
        if (!conv) return reply({ ok: false, error: "Conversation introuvable." });

        let card = null;
        if (data.productId) card = await svc.productCard(data.productId, conv.sellerId);
        else if (data.orderId) card = await svc.orderCard(data.orderId, conv.clientId);

        const { message } = await svc.postMessage({
          conversation: conv,
          actor,
          text: data.text,
          card,
          attachments: data.attachments,
          internal: actor.kind !== "client" && !!data.internal,
          clientTempId: data.clientTempId,
        });
        reply({ ok: true, message: actor.kind === "client" ? svc.messageForClient(message) : svc.messageForStaff(message) });
      } catch (e) {
        reply({ ok: false, error: e.status ? e.message : "Message non envoyé." });
      }
    });

    socket.on("message:read", async ({ conversationId } = {}) => {
      const conv = await load(conversationId).catch(() => null);
      if (conv) svc.markRead({ conversation: conv, by: actor.kind === "client" ? "client" : "store" }).catch(() => {});
    });

    const typing = (isTyping) => async ({ conversationId } = {}) => {
      const conv = await load(conversationId).catch(() => null);
      if (!conv) return;
      const payload = { conversationId: String(conv._id), typing: isTyping };
      if (actor.kind === "client") {
        nsp.to([svc.sellerRoom(conv.sellerId), svc.STAFF_ALL]).emit("typing", { ...payload, from: "client" });
      } else {
        nsp.to(svc.clientRoom(conv.clientId)).emit("typing", { ...payload, from: "store" });
        // Les collègues voient qui rédige (évite deux réponses en même temps)
        socket.to([svc.sellerRoom(conv.sellerId), svc.STAFF_ALL]).emit("typing", { ...payload, from: "staff", name: actor.name });
      }
    };
    socket.on("typing:start", typing(true));
    socket.on("typing:stop", typing(false));

    socket.on("disconnect", () => {
      if (actor.kind === "manager") notifyPresence(nsp, actor.sellerIds, false);
    });
  });

  // Escalade des conversations sans réponse (toutes les 2 minutes)
  const timer = setInterval(() => svc.escalateOverdue().catch((e) => console.error("[Messagerie] escalade :", e.message)), 2 * 60 * 1000);
  timer.unref?.();

  return nsp;
}

/** Prévient les clients des boutiques concernées quand leur équipe se connecte / déconnecte */
async function notifyPresence(nsp, sellerIds, connecting) {
  for (const sellerId of sellerIds) {
    try {
      const online = connecting ? true : await svc.isStoreOnline(sellerId);
      if (!connecting && online) continue;
      const convs = await StoreConversation.find({ sellerId, updatedAt: { $gte: new Date(Date.now() - 7 * 864e5) } }).select("clientId").lean();
      const rooms = [...new Set(convs.map((c) => svc.clientRoom(c.clientId)))];
      if (rooms.length) nsp.to(rooms).emit("store:presence", { sellerId: String(sellerId), online });
    } catch { /* indicatif */ }
  }
}

module.exports = setupMessagingSocket;
