/**
 * SUPPORT IHAMBAOBAB — conversation du client avec la plateforme.
 *
 * Le support est une « boutique » virtuelle (identifiant fixe SUPPORT_ID) de la messagerie :
 * mêmes écrans, temps réel, push, photos, vocaux et non-lus que les boutiques.
 * Un manager y a accès quand SUPPORT_ID figure dans ses sellerIds ; les admins y ont toujours accès.
 *
 * Ancien chat (UserMessage, routes /createUserMessage…) : gardé en miroir pour les anciennes
 * versions de l'app et l'ancienne page admin. Chaque message existe dans les deux systèmes,
 * reliés par UserMessage.storeMessageId.
 */
const mongoose = require("mongoose");

const SUPPORT_ID = "000000000000000000000001";
const SUPPORT_STORE = {
  id: SUPPORT_ID,
  name: "Support Ihambaobab",
  logo: "https://res.cloudinary.com/dkfddtykk/image/upload/v1730637067/images/djbqrcbhunhdoeucxbyb.png",
  active: true,
  support: true,
};

const isSupport = (id) => String(id || "") === SUPPORT_ID || id === "support";
const supportId = (id) => (isSupport(id) ? SUPPORT_ID : id);

const legacyText = (m) => {
  if (m.text) return m.text;
  if (m.audio?.url) return `🎤 Message vocal : ${m.audio.url}`;
  if (m.card?.kind) return `${m.card.kind === "product" ? "🛍️" : "📦"} ${m.card.title || ""}`.trim();
  if (m.attachments?.length) return `📷 Photo : ${m.attachments.join(" ")}`;
  return "";
};

/** Nouveau message du support → copie dans l'ancien chat (anciennes versions de l'app) */
async function mirrorToLegacy(conversation, message) {
  try {
    const { UserMessage } = require("../Models");
    const fromClient = message.from === "client";
    await UserMessage.create({
      date: message.createdAt || new Date(),
      message: legacyText(message),
      clefUser: String(conversation.clientId),
      provenance: fromClient,
      lusUser: fromClient,
      lusAdmin: !fromClient,
      storeMessageId: message._id,
    });
  } catch (e) {
    console.error("[Support] copie vers l'ancien chat impossible :", e.message);
  }
}

/** Message reçu par l'ancien chat → nouvelle messagerie (push, temps réel, équipe) */
async function fromLegacy(userMessage, { staff = null } = {}) {
  const svc = require("./service");
  const clientId = String(userMessage.clefUser || "");
  if (!svc.isId(clientId)) return;
  const { conversation } = await svc.openConversation({ clientId, sellerId: SUPPORT_ID });
  const actor = staff
    ? { kind: staff.kind || "admin", id: staff.id || null, name: staff.name || "Admin", displayName: "" }
    : { kind: "client", id: clientId };
  const { message } = await svc.postMessage({ conversation, actor, text: userMessage.message, legacy: true });
  const { UserMessage } = require("../Models");
  await UserMessage.updateOne({ _id: userMessage._id }, { $set: { storeMessageId: message._id } });
}

/**
 * Reprise de l'historique de l'ancien chat (au démarrage, idempotente) :
 * chaque UserMessage sans storeMessageId devient un message de la conversation support du client.
 */
async function migrateLegacySupport() {
  const { UserMessage, User } = require("../Models");
  const { StoreConversation, StoreMessage } = require("./models");
  const svc = require("./service");

  const clients = await UserMessage.distinct("clefUser", { storeMessageId: { $exists: false } });
  let moved = 0;
  for (const clientId of clients) {
    if (!svc.isId(clientId) || !(await User.exists({ _id: clientId }))) continue;
    const legacy = await UserMessage.find({ clefUser: clientId, storeMessageId: { $exists: false } }).sort({ date: 1, _id: 1 }).lean();
    if (!legacy.length) continue;

    const { conversation } = await svc.openConversation({ clientId, sellerId: SUPPORT_ID });
    const docs = legacy
      .filter((m) => String(m.message || "").trim())
      .map((m) => {
        const fromClient = m.provenance !== false;
        const at = m.date ? new Date(m.date) : m._id.getTimestamp();
        const read = fromClient ? m.lusAdmin === true : m.lusUser === true;
        return {
          _id: new mongoose.Types.ObjectId(),
          legacyId: m._id,
          conversationId: conversation._id,
          from: fromClient ? "client" : "store",
          author: { kind: fromClient ? "client" : "admin", id: null, name: fromClient ? "" : "Admin" },
          internal: false,
          text: String(m.message).slice(0, 2000),
          originalText: null,
          masked: false,
          attachments: [],
          signature: "",
          readAt: read ? at : null,
          clientTempId: `legacy:${m._id}`,
          createdAt: at,
          updatedAt: at,
        };
      });
    if (docs.length) {
      // Insertion brute : on garde les dates d'origine
      await StoreMessage.collection.insertMany(docs.map(({ legacyId, ...d }) => d));
      await Promise.all(docs.map((d) => UserMessage.updateOne({ _id: d.legacyId }, { $set: { storeMessageId: d._id } })));
      moved += docs.length;
    }
    // Messages vides : marqués pour ne pas être repris à chaque démarrage
    await UserMessage.updateMany({ clefUser: clientId, storeMessageId: { $exists: false } }, { $set: { storeMessageId: null } });

    // État de la conversation recalculé sur l'ensemble de ses messages
    const last = await StoreMessage.findOne({ conversationId: conversation._id, internal: { $ne: true } }).sort({ createdAt: -1 }).lean();
    if (!last) continue;
    const [unreadClient, unreadStaff] = await Promise.all([
      StoreMessage.countDocuments({ conversationId: conversation._id, from: "store", readAt: null }),
      StoreMessage.countDocuments({ conversationId: conversation._id, from: "client", readAt: null }),
    ]);
    // Question du client restée sans réponse : à traiter si elle a moins de 7 jours, sinon classée
    const waiting = last.from === "client" && Date.now() - new Date(last.createdAt) < 7 * 864e5;
    await StoreConversation.collection.updateOne({ _id: conversation._id }, {
      $set: {
        lastMessage: { text: legacyText(last).slice(0, 140), from: last.from, at: last.createdAt },
        "unread.client": unreadClient,
        "unread.staff": waiting ? unreadStaff : 0,
        status: waiting ? "open" : last.from === "client" ? "resolved" : "pending",
        awaitingSince: waiting ? last.createdAt : null,
        escalatedAt: waiting ? new Date() : null, // pas d'alerte d'escalade pour l'historique
        updatedAt: last.createdAt,
      },
    });
  }
  if (moved) console.log(`✅ Support : ${moved} message(s) de l'ancien chat repris dans la messagerie`);
  return moved;
}

module.exports = { SUPPORT_ID, SUPPORT_STORE, isSupport, supportId, mirrorToLegacy, fromLegacy, migrateLegacySupport };
