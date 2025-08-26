// Modèle pour le portefeuille du seller
const mongoose = require("mongoose");
const portefeuilleSchema = new mongoose.Schema({
  sellerId: {
    type: String,
    required: true,
    unique: true
  },
  soldeTotal: {
    type: Number,
    default: 0
  },
  soldeDisponible: {
    type: Number,
    default: 0
  },
  soldeEnAttente: {
    type: Number,
    default: 0
  },
  dateCreation: {
    type: Date,
    default: Date.now
  },
  dateMiseAJour: {
    type: Date,
    default: Date.now
  },
  soldeBloqueTemporairement: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

const Portefeuille = mongoose.model('Portefeuille', portefeuilleSchema);
module.exports = Portefeuille;