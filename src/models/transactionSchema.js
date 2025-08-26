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
      return ['CREDIT_COMMANDE', 'ANNULATION'].includes(this.type);
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
    sparse: true, // Permet les valeurs null/undefined
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
  // Nouveaux champs pour traçabilité
  transactionOriginale: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransactionSeller'
  },
  motifAnnulation: {
    type: String
  },
  historiqueStatuts: [{
    ancienStatut: String,
    nouveauStatut: String,
    date: { type: Date, default: Date.now },
    motif: String
  }],
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
transactionSchema.index({ commandeId: 1, type: 1, statut: 1 });

// Middleware pour générer une référence unique si non fournie
transactionSchema.pre('save', function(next) {
  if (!this.reference) {
    this.reference = `TXN_${Date.now()}_${this.sellerId}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Ajouter à l'historique des statuts si le statut change
  if (this.isModified('statut') && !this.isNew) {
    this.historiqueStatuts.push({
      ancienStatut: this.constructor.findOne({ _id: this._id }).statut,
      nouveauStatut: this.statut,
      motif: this.motifAnnulation || 'Changement de statut'
    });
  }
  
  next();
});

const TransactionSeller = mongoose.model('TransactionSeller', transactionSchema);
module.exports = TransactionSeller;