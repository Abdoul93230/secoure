const mongoose = require("mongoose");

/**
 * Mesure du tunnel d'achat (app et site) : vue d'article, ajout au panier, début de commande,
 * paiement lancé, achat. Aucune donnée personnelle : un identifiant de visiteur haché, et le compte
 * client s'il est connecté. Effacé automatiquement après 180 jours.
 */
const EVENT_NAMES = ["app_open", "product_view", "add_to_cart", "begin_checkout", "payment_start", "purchase", "search", "share", "signup"];

const appEventSchema = new mongoose.Schema({
  name: { type: String, enum: EVENT_NAMES, required: true },
  visitorKey: { type: String, required: true },
  userId: { type: String, default: null },
  platform: { type: String, enum: ["android", "ios", "web"], default: "web" },
  source: { type: String, default: null }, // d'où vient le visiteur (lien de parrainage, campagne…)
  productId: { type: String, default: null },
  orderRef: { type: String, default: null },
  value: { type: Number, default: null }, // montant en F CFA (panier, achat)
  day: { type: String, required: true }, // AAAA-MM-JJ (heure de Niamey)
  createdAt: { type: Date, default: Date.now },
});

appEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });
appEventSchema.index({ name: 1, createdAt: -1 });

const AppEvent = mongoose.models.AppEvent || mongoose.model("AppEvent", appEventSchema);
module.exports = { AppEvent, EVENT_NAMES };
