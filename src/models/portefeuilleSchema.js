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
  // Nouveaux champs pour audit et traçabilité
  derniereVerification: {
    type: Date
  },
  dernierRecalcul: {
    type: Date
  },
  nombreTransactions: {
    type: Number,
    default: 0
  },
  nombreRetraits: {
    type: Number,
    default: 0
  },
  alertes: [{
    type: String,
    message: String,
    date: { type: Date, default: Date.now },
    resolue: { type: Boolean, default: false }
  }],
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
      const ecart = Math.abs(this.soldeTotal - sommePartiels);
      
      // Si l'écart est trop important, ajouter une alerte
      if (ecart > 1) {
        this.alertes.push({
          type: 'INCOHERENCE_SOLDES',
          message: `Écart de ${ecart} FCFA détecté entre soldeTotal et somme des soldes partiels`,
          resolue: false
        });
      }
      
      return ecart < 1; // Tolérance de 1 FCFA
    },
    message: 'Incohérence dans les soldes du portefeuille'
  }
});

// Index pour optimiser les requêtes
portefeuilleSchema.index({ sellerId: 1 });
portefeuilleSchema.index({ dateMiseAJour: -1 });
portefeuilleSchema.index({ 'alertes.resolue': 1 });

// Middleware pour mettre à jour la date de modification
portefeuilleSchema.pre('save', function(next) {
  this.dateMiseAJour = new Date();
  this.version += 1;
  next();
});

// Méthodes d'instance
portefeuilleSchema.methods.ajouterAlerte = function(type, message) {
  this.alertes.push({
    type,
    message,
    resolue: false
  });
};

portefeuilleSchema.methods.resoudreAlertes = function(type = null) {
  if (type) {
    this.alertes.forEach(alerte => {
      if (alerte.type === type) {
        alerte.resolue = true;
      }
    });
  } else {
    this.alertes.forEach(alerte => {
      alerte.resolue = true;
    });
  }
};
const Portefeuille = mongoose.model('Portefeuille', portefeuilleSchema);
module.exports = Portefeuille;