const mongoose = require('mongoose');

const paiementSchema = new mongoose.Schema({
  montant: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  note: { type: String, default: '' },
}, { _id: false });

const rappelSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  canal: { type: String, enum: ['sms', 'whatsapp', 'manuel'], default: 'manuel' },
}, { _id: false });

const creditClientSchema = new mongoose.Schema({
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SellerRequest',
    required: true,
    index: true,
  },
  clientNom: { type: String, required: true, trim: true },
  clientTel: { type: String, default: '' },

  montantInitial: { type: Number, required: true, min: 1 },
  montantDu: { type: Number, required: true, min: 0 },

  produitLabel: { type: String, default: '' },
  note: { type: String, default: '' },

  dateCredit: { type: Date, default: Date.now },
  dateEcheance: { type: Date, default: null },

  paiements: [paiementSchema],
  rappels: [rappelSchema],

  statut: {
    type: String,
    enum: ['en_cours', 'rembourse', 'litige'],
    default: 'en_cours',
    index: true,
  },
}, {
  timestamps: true,
});

creditClientSchema.index({ sellerId: 1, statut: 1, createdAt: -1 });

module.exports = mongoose.model('CreditClient', creditClientSchema);
