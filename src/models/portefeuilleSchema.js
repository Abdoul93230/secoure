const mongoose = require("mongoose");

const portefeuilleSchema = new mongoose.Schema({
  sellerId: {
    type: String,
    required: true,
    unique: true
  },
  soldeTotal: {
    type: Number,
    default: 0,
    min: 0
  },
  soldeDisponible: {
    type: Number,
    default: 0,
    min: 0
  },
  soldeEnAttente: {
    type: Number,
    default: 0,
    min: 0
  },
  soldeBloqueTemporairement: {
    type: Number,
    default: 0,
    min: 0
  },
  soldeReserveRetrait: {
    type: Number,
    default: 0,
    min: 0
  },
  dateCreation: {
    type: Date,
    default: Date.now
  },
  dateMiseAJour: {
    type: Date,
    default: Date.now
  },
  version: {
    type: Number,
    default: 1
  }
}, { 
  timestamps: true,
  // Validation pour s'assurer que la somme des soldes est cohérente
  validate: {
    validator: function() {
      const sommePartiels = this.soldeDisponible + this.soldeEnAttente + 
                           this.soldeBloqueTemporairement + this.soldeReserveRetrait;
      return Math.abs(this.soldeTotal - sommePartiels) < 0.01; // Tolérance pour les arrondis
    },
    message: 'Incohérence dans les soldes du portefeuille'
  }
});

// Index pour optimiser les requêtes
portefeuilleSchema.index({ sellerId: 1 });
portefeuilleSchema.index({ dateMiseAJour: -1 });

// Middleware pour mettre à jour la date de modification
portefeuilleSchema.pre('save', function(next) {
  this.dateMiseAJour = new Date();
  next();
});

const Portefeuille = mongoose.model('Portefeuille', portefeuilleSchema);
module.exports = Portefeuille;