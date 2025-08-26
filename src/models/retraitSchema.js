// Modèle pour les demandes de retrait
const mongoose = require("mongoose");
const retraitSchema = new mongoose.Schema({
  sellerId: {
    type: String,
    required: true
  },
  montantDemande: {
    type: Number,
    required: true,
    min: 0
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
    enum: ['EN_ATTENTE', 'APPROUVE', 'REJETE', 'TRAITE', 'ANNULE'],
    default: 'EN_ATTENTE'
  },
  methodeRetrait: {
    type: String,
    enum: ['MOBILE_MONEY', 'VIREMENT_BANCAIRE', 'ESPECES'],
    required: true
  },
  detailsRetrait: {
    numeroTelephone: String,
    operateur: String, // Orange Money, MTN Money, etc.
    nomBeneficiaire: String,
    numeroCompte: String,
    banque: String,
    adresse: String
  },
  datedemande: {
    type: Date,
    default: Date.now
  },
  dateTraitement: {
    type: Date
  },
  commentaireAdmin: {
    type: String
  },
  reference: {
    type: String,
    unique: true,
    required: true
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  }
}, { timestamps: true });

const Retrait = mongoose.model('Retrait', retraitSchema);
module.exports = Retrait;