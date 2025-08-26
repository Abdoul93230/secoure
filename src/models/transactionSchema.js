const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  sellerId: {
    type: String,
    required: true,
    index: true
  },
  commandeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Commande',
    required: function() {
      return this.type === 'CREDIT_COMMANDE';
    }
  },
  retraitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Retrait',
    required: function() {
      return this.type === 'RETRAIT';
    }
  },
  type: {
    type: String,
    enum: ['CREDIT_COMMANDE', 'RETRAIT', 'COMMISSION', 'ANNULATION', 'CORRECTION'],
    required: true
  },
  statut: {
    type: String,
    enum: ['EN_ATTENTE', 'CONFIRME', 'ANNULE', 'EXPIRE'],
    default: 'EN_ATTENTE'
  },
  montant: {
    type: Number,
    required: true
  },
  montantNet: {
    type: Number,
    required: true
  },
  commission: {
    type: Number,
    default: 0
  },
  tauxCommission: {
    type: Number,
    default: 0
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
    default: Date.now,
    index: true
  },
  dateConfirmation: {
    type: Date
  },
  dateDisponibilite: {
    type: Date,
    required: function() {
      return this.type === 'CREDIT_COMMANDE' && this.statut === 'CONFIRME';
    }
  },
  estDisponible: {
    type: Boolean,
    default: false
  },
  metadata: {
    type: Object,
    default: {}
  },
  // Champs d'audit
  creeParAdmin: {
    type: Boolean,
    default: false
  },
  adminId: {
    type: String
  },
  commentaireAdmin: {
    type: String
  }
}, { 
  timestamps: true 
});

// Index composés pour optimiser les requêtes
transactionSchema.index({ sellerId: 1, dateTransaction: -1 });
transactionSchema.index({ type: 1, statut: 1 });
transactionSchema.index({ dateDisponibilite: 1, estDisponible: 1 });
transactionSchema.index({ commandeId: 1 });

// Middleware pour générer une référence unique si non fournie
transactionSchema.pre('save', function(next) {
  if (!this.reference) {
    this.reference = `TXN_${Date.now()}_${this.sellerId}_${Math.random().toString(36).substr(2, 9)}`;
  }
  next();
});

const TransactionSeller = mongoose.model('TransactionSeller', transactionSchema);
module.exports = TransactionSeller;