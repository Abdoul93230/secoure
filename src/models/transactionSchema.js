// Modèle pour les transactions financières
const mongoose = require("mongoose");
const transactionSchema = new mongoose.Schema({
  sellerId: {
    type: String,
    required: true
  },
  commandeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Commande',
    required: function() {
      return this.type === 'CREDIT_COMMANDE';
    }
  },
  type: {
    type: String,
    enum: ['CREDIT_COMMANDE', 'RETRAIT', 'COMMISSION', 'ANNULATION'],
    required: true
  },
  statut: {
    type: String,
    enum: ['EN_ATTENTE', 'CONFIRME', 'ANNULE'],
    default: 'EN_ATTENTE'
  },
  montant: {
    type: Number,
    required: true
  },
  montantNet: {
    type: Number, // Montant après déduction des commissions
    required: true
  },
  commission: {
    type: Number,
    default: 0
  },
  tauxCommission: {
    type: Number,
    default: 0 // en pourcentage
  },
  description: {
    type: String,
    required: true
  },
  reference: {
    type: String,
    unique: true,
    required: true
  },
  dateTransaction: {
    type: Date,
    default: Date.now
  },
  dateConfirmation: {
    type: Date
  },
  metadata: {
    type: Object,
    default: {}
  },
   dateDisponibilite: {
    type: Date,
    required: function() {
      return this.type === 'CREDIT_COMMANDE';
    }
  },
  estDisponible: {
    type: Boolean,
    default: false
  },
}, { timestamps: true });

const TransactionSeller = mongoose.model('TransactionSeller', transactionSchema);
module.exports = TransactionSeller;
