/**
 * MESSAGERIE BOUTIQUES — modèles
 *
 * Le client écrit à une boutique ; la plateforme répond au nom de la boutique.
 * Les réponses sont rédigées par un manager (ou un admin) affecté à la boutique :
 * le client voit toujours la boutique (nom + logo), jamais l'identité interne du rédacteur.
 */
const mongoose = require("mongoose");
const { Schema } = mongoose;

// ─── Manager : membre de l'équipe, gère une ou plusieurs boutiques ─────────────
const managerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    phone: { type: String, default: "" },
    // Prénom affiché au client en signature (« Aïcha, de l'équipe Djabir'Store ») — optionnel
    displayName: { type: String, default: "", trim: true, maxlength: 40 },
    sellerIds: [{ type: Schema.Types.ObjectId, ref: "SellerRequest" }],
    permissions: {
      messages: { type: Boolean, default: true },
      products: { type: Boolean, default: true },
      orders: { type: Boolean, default: true },
    },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true }
);
managerSchema.index({ sellerIds: 1, isActive: 1 });
managerSchema.set("toJSON", {
  transform: (_d, ret) => { delete ret.password; return ret; },
});

// ─── Conversation : un client ↔ une boutique ───────────────────────────────────
const conversationSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "SellerRequest", required: true },
    // Manager qui suit la conversation (affecté automatiquement, réaffectable)
    assignedTo: { type: Schema.Types.ObjectId, ref: "Manager", default: null },
    // open : attend une réponse de la boutique · pending : attend le client · resolved : clôturée
    status: { type: String, enum: ["open", "pending", "resolved"], default: "open", index: true },
    lastMessage: {
      text: { type: String, default: "" },
      from: { type: String, enum: ["client", "store", "system"], default: "client" },
      at: { type: Date, default: null },
    },
    unread: {
      client: { type: Number, default: 0 },
      staff: { type: Number, default: 0 },
    },
    // Délais de réponse (pilotage de l'équipe)
    awaitingSince: { type: Date, default: null }, // premier message client resté sans réponse
    firstResponseMs: { type: Number, default: null },
    escalatedAt: { type: Date, default: null },
    // Dernier contexte joint (produit / commande) pour l'en-tête côté équipe
    context: {
      productId: { type: Schema.Types.ObjectId, ref: "Produit", default: null },
      orderId: { type: Schema.Types.ObjectId, ref: "Commande", default: null },
    },
    flagged: { type: Boolean, default: false }, // coordonnées détectées et masquées
    clientArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);
conversationSchema.index({ clientId: 1, sellerId: 1 }, { unique: true });
conversationSchema.index({ clientId: 1, updatedAt: -1 });
conversationSchema.index({ sellerId: 1, status: 1, updatedAt: -1 });
conversationSchema.index({ assignedTo: 1, status: 1, updatedAt: -1 });
conversationSchema.index({ status: 1, awaitingSince: 1 });

// ─── Message ───────────────────────────────────────────────────────────────────
const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "StoreConversation", required: true },
    from: { type: String, enum: ["client", "store", "system"], required: true },
    // Rédacteur interne (manager ou admin) — jamais renvoyé au client
    author: {
      kind: { type: String, enum: ["client", "manager", "admin", "system"], default: "client" },
      id: { type: Schema.Types.ObjectId, default: null },
      name: { type: String, default: "" },
    },
    // Note interne : visible uniquement par l'équipe
    internal: { type: Boolean, default: false },
    text: { type: String, default: "", maxlength: 2000 },
    // Texte d'origine quand des coordonnées ont été masquées (visible par l'équipe seulement)
    originalText: { type: String, default: null },
    masked: { type: Boolean, default: false },
    attachments: [{ type: String }],
    // Carte jointe : produit ou commande (instantané au moment de l'envoi)
    card: {
      kind: { type: String, enum: ["product", "order", null], default: null },
      id: { type: Schema.Types.ObjectId, default: null },
      title: String,
      image: String,
      price: Number,
      subtitle: String,
    },
    signature: { type: String, default: "" }, // « Aïcha · équipe Djabir'Store »
    readAt: { type: Date, default: null }, // lu par le destinataire
    clientTempId: { type: String, default: null }, // dédoublonnage des renvois (réseau instable)
  },
  { timestamps: true }
);
messageSchema.index({ conversationId: 1, _id: -1 });
messageSchema.index({ conversationId: 1, from: 1, readAt: 1 });
messageSchema.index({ conversationId: 1, clientTempId: 1 }, { sparse: true });

// ─── Réponses rapides de l'équipe ──────────────────────────────────────────────
const quickReplySchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 60 },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    // null : réponse commune à toute l'équipe ; sinon réponse personnelle d'un manager
    ownerId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

const Manager = mongoose.models.Manager || mongoose.model("Manager", managerSchema);
const StoreConversation = mongoose.models.StoreConversation || mongoose.model("StoreConversation", conversationSchema);
const StoreMessage = mongoose.models.StoreMessage || mongoose.model("StoreMessage", messageSchema);
const QuickReply = mongoose.models.QuickReply || mongoose.model("QuickReply", quickReplySchema);

module.exports = { Manager, StoreConversation, StoreMessage, QuickReply };
