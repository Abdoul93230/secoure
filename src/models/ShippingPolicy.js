const mongoose = require('mongoose');

const zonePolicySchema = new mongoose.Schema({
  zoneId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ZoneF',
    required: [true, 'La zone est requise']
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  fixedCost: {
    type: Number,
    required: [true, 'Le coût fixe est requis'],
    min: [0, 'Le coût fixe ne peut pas être négatif'],
    validate: {
      validator: function(value) {
        return Number.isInteger(value);
      },
      message: 'Le coût fixe doit être un nombre entier'
    }
  },
  costPerKg: {
    type: Number,
    required: [true, 'Le coût par kg est requis'],
    min: [0, 'Le coût par kg ne peut pas être négatif'],
    validate: {
      validator: function(value) {
        return Number.isInteger(value);
      },
      message: 'Le coût par kg doit être un nombre entier'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
});

const shippingPolicySchema = new mongoose.Schema({
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'L\'ID du vendeur est requis'],
    index: true
  },
  zonePolicies: [zonePolicySchema],
  // Statistiques pour optimisation
  totalPolicies: {
    type: Number,
    default: 0
  },
  activePolicies: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index pour optimiser les requêtes de calcul de frais
shippingPolicySchema.index({ sellerId: 1, 'zonePolicies.zoneId': 1 });
shippingPolicySchema.index({ sellerId: 1, 'zonePolicies.isDefault': 1 });

// Middleware pour s'assurer qu'il n'y a qu'une seule politique par défaut
shippingPolicySchema.pre('save', function(next) {
  const defaultPolicies = this.zonePolicies.filter(p => p.isDefault);
  
  if (defaultPolicies.length > 1) {
    return next(new Error('Il ne peut y avoir qu\'une seule politique par défaut'));
  }
  
  // Mettre à jour les statistiques
  this.totalPolicies = this.zonePolicies.length;
  this.activePolicies = this.zonePolicies.filter(p => p.isActive).length;
  
  next();
});

// Méthode pour ajouter ou mettre à jour une politique de zone
shippingPolicySchema.methods.setPolicyForZone = function(zoneId, policyData) {
  const existingIndex = this.zonePolicies.findIndex(
    p => p.zoneId.toString() === zoneId.toString()
  );
  
  if (existingIndex >= 0) {
    // Mettre à jour la politique existante
    this.zonePolicies[existingIndex] = { ...this.zonePolicies[existingIndex].toObject(), ...policyData };
  } else {
    // Ajouter une nouvelle politique
    this.zonePolicies.push({ zoneId, ...policyData });
  }
  
  // Si c'est une nouvelle politique par défaut, désactiver les autres
  if (policyData.isDefault) {
    this.zonePolicies.forEach((policy, index) => {
      if (index !== existingIndex && policy.zoneId.toString() !== zoneId.toString()) {
        policy.isDefault = false;
      }
    });
  }
};

// Méthode pour obtenir la politique pour une zone
shippingPolicySchema.methods.getPolicyForZone = function(zoneId) {
  // console.log('Recherche politique pour zoneId:', zoneId);
  
  return this.zonePolicies.find(p => {
    // CRUCIAL: Gérer les cas populé ET non-populé
    let policyZoneId;
    if (p.zoneId._id) {
      // Cas populé: zoneId est un objet avec _id
      policyZoneId = p.zoneId._id.toString();
    } else {
      // Cas non-populé: zoneId est directement un ObjectId
      policyZoneId = p.zoneId.toString();
    }
    
    const searchZoneId = zoneId.toString();
    const isMatch = policyZoneId === searchZoneId && p.isActive;
    
    // console.log(`Comparaison: ${policyZoneId} === ${searchZoneId} && ${p.isActive} = ${isMatch}`);
    return isMatch;
  });
};

// Méthode pour obtenir la politique par défaut
shippingPolicySchema.methods.getDefaultPolicy = function() {
  return this.zonePolicies.find(p => p.isDefault && p.isActive);
};

// Méthode statique pour calculer les frais d'expédition
shippingPolicySchema.statics.calculateShippingCost = async function(sellerId, customerZoneId, weight) {
  const Zone = mongoose.model('ZoneF');
  
  // Obtenir la politique du vendeur
  const shippingPolicy = await this.findOne({ sellerId })
    .populate('zonePolicies.zoneId');

  // console.log({shippingPolicy});
  
  if (!shippingPolicy) {
    throw new Error('Aucune politique d\'expédition trouvée pour ce vendeur');
  }
  
  // Convertir customerZoneId en ObjectId si nécessaire
  const normalizedCustomerZoneId = typeof customerZoneId === 'string' ? 
    new mongoose.Types.ObjectId(customerZoneId) : customerZoneId;
  
  // Obtenir la zone client avec ses ancêtres
  const customerZone = await Zone.findById(normalizedCustomerZoneId).populate('ancestors');
  if (!customerZone) {
    throw new Error('Zone client introuvable');
  }
  
  // Chercher la politique la plus spécifique
  let applicablePolicy = null;
  let appliedZone = null;
  
  // 1. Chercher une politique exacte pour la zone
  // console.log({customerZoneId, customerZone});
  
  applicablePolicy = shippingPolicy.getPolicyForZone(normalizedCustomerZoneId);
  // console.log({applicablePolicy});
  
  if (applicablePolicy) {
    appliedZone = customerZone;
  } else {
    // 2. Remonter la hiérarchie (ancêtres)
    if (customerZone.ancestors && customerZone.ancestors.length > 0) {
      for (const ancestorId of customerZone.ancestors.reverse()) {
        applicablePolicy = shippingPolicy.getPolicyForZone(ancestorId);
        if (applicablePolicy) {
          appliedZone = await Zone.findById(ancestorId);
          break;
        }
      }
    }
  }
  
  // 3. Utiliser la politique par défaut si aucune correspondance
  if (!applicablePolicy) {
    applicablePolicy = shippingPolicy.getDefaultPolicy();
    appliedZone = { name: 'Politique par défaut', type: 'default' };
    // console.log('Utilisation politique par défaut:', applicablePolicy);
  }
  
  if (!applicablePolicy) {
    throw new Error('Aucune politique applicable trouvée');
  }
  
  // Calculer le coût total
  const weightCost = Math.ceil(weight * applicablePolicy.costPerKg);
  const totalCost = applicablePolicy.fixedCost + weightCost;
  
  return {
    fixedCost: applicablePolicy.fixedCost,
    costPerKg: applicablePolicy.costPerKg,
    weight: weight,
    weightCost: weightCost,
    totalCost: totalCost,
    appliedPolicy: {
      zone: appliedZone.name,
      type: appliedZone.type,
      policyId: applicablePolicy._id
    }
  };
};

module.exports = mongoose.model('ShippingPolicy', shippingPolicySchema);