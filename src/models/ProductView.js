const mongoose = require("mongoose");

/**
 * Une vue d'article par visiteur et par jour (compte client, sinon appareil, sinon IP + navigateur).
 * Sert au compteur public « X personnes ont vu cet article cette semaine » et au compteur
 * Produit.views des vendeurs, sans être gonflé par les rechargements de page.
 * Effacé automatiquement après 30 jours.
 */
const productViewSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Produit", required: true },
  visitorKey: { type: String, required: true },
  day: { type: String, required: true }, // AAAA-MM-JJ (heure de Niamey)
  createdAt: { type: Date, default: Date.now },
});

productViewSchema.index({ productId: 1, visitorKey: 1, day: 1 }, { unique: true });
productViewSchema.index({ productId: 1, createdAt: -1 });
productViewSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

module.exports = mongoose.models.ProductView || mongoose.model("ProductView", productViewSchema);
