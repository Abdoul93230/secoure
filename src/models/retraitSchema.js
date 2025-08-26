const mongoose = require("mongoose");

const retraitSchema = new mongoose.Schema({
  sellerId: {
    type: String,
    required: true,
    index: true
  },
  montantDemande: {
    type: Number,
    required: true,
    min: 5000 // Montant minimum
  },
  montantAccorde: {
    type: Number,
    default: 0
  },
  fraisRetrait: {
    type: Number,
    default: 0
  },
  statut: {
    type: String,
    enum: ['EN_ATTENTE', 'APPROUVE', 'REJETE', 'TRAITE', 'ANNULE', 'EXPIRE'],
    default: 'EN_ATTENTE'
  },
  methodeRetrait: {
    type: String,
    enum: ['MOBILE_MONEY', 'VIREMENT_BANCAIRE', 'ESPECES'],
    required: true
  },
  detailsRetrait: {
    numeroTelephone: String,
    operateur: String,
    nomBeneficiaire: String,
    numeroCompte: String,
    banque: String,
    nomTitulaire: String,
    adresseCollecte: String
  },
  datedemande: {
    type: Date,
    default: Date.now
  },
  dateTraitement: {
    type: Date
  },
  dateExpiration: {
    type: Date,
    default: function() {
      // Expire après 30 jours si non traité
      const expiration = new Date();
      expiration.setDate(expiration.getDate() + 30);
      return expiration;
    }
  },
  commentaireAdmin: {
    type: String
  },
  adminId: {
    type: String
  },
  reference: {
    type: String,
    unique: true,
    required: true
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransactionSeller'
  },
  // Historique des changements de statut
  historiqueStatut: [{
    ancienStatut: String,
    nouveauStatut: String,
    date: { type: Date, default: Date.now },
    adminId: String,
    commentaire: String
  }]
}, { 
  timestamps: true 
});

// Index pour optimiser les requêtes
retraitSchema.index({ sellerId: 1, datedemande: -1 });
retraitSchema.index({ statut: 1, datedemande: -1 });
retraitSchema.index({ dateExpiration: 1 });

// Middleware pour générer une référence unique
retraitSchema.pre('save', function(next) {
  if (!this.reference) {
    this.reference = `RET_${Date.now()}_${this.sellerId}_${Math.random().toString(36).substr(2, 6)}`;
  }
  next();
});

const Retrait = mongoose.model('Retrait', retraitSchema);
module.exports = Retrait;