const mongoose = require('mongoose');

const ligneVenteSchema = new mongoose.Schema({
  produitId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Produit', required: true },
  nom:          { type: String, required: true },
  image:        { type: String },
  prixUnitaire: { type: Number, required: true },
  quantite:     { type: Number, required: true, min: 1 },
  varianteLabel:{ type: String },       // ex: "Rouge / L"
  couleurs:     { type: [String], default: [] }, // pour cibler le stock variante
  tailles:      { type: [String], default: [] }, // pour cibler le stock variante
  sousTotal:    { type: Number, required: true },
}, { _id: false });

const venteDirecteSchema = new mongoose.Schema({
  sellerId: { type: String, required: true, index: true },

  reference: {
    type: String,
    unique: true,
    required: true,
  },

  lignes: [ligneVenteSchema],

  sousTotal:    { type: Number, required: true },
  remise:       { type: Number, default: 0 },
  total:        { type: Number, required: true },

  modePaiement: {
    type: String,
    enum: ['ESPECES', 'MOBILE_MONEY', 'AUTRE'],
    required: true,
  },

  // Montant reçu (espèces) et monnaie rendue
  montantRecu:  { type: Number, default: 0 },
  monnaie:      { type: Number, default: 0 },

  // Numéro du client (facultatif — pour envoyer le reçu WhatsApp)
  telephoneClient: { type: String },

  statut: {
    type: String,
    enum: ['COMPLETEE', 'ANNULEE'],
    default: 'COMPLETEE',
  },

  // Snapshot du plan au moment de la vente (traçabilité)
  planSnapshot: {
    planName:       { type: String },
    tauxCommission: { type: Number },
  },

  commission:   { type: Number, default: 0 },
  montantNet:   { type: Number, default: 0 },

}, { timestamps: true });

// Référence unique : POS-{sellerId(6 chars)}-{timestamp}-{random}
// pre('validate') car Mongoose 6+ valide AVANT pre('save')
venteDirecteSchema.pre('validate', function (next) {
  if (!this.reference) {
    const sellerPart = String(this.sellerId).slice(-6).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.reference = `POS-${sellerPart}-${Date.now()}-${rand}`;
  }
  next();
});

venteDirecteSchema.index({ sellerId: 1, createdAt: -1 });

module.exports = mongoose.model('VenteDirecte', venteDirecteSchema);
