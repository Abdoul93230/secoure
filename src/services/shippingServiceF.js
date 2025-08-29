const ShippingPolicy = require('../models/ShippingPolicy');
const Zone = require('../models/Zone');

class ShippingService {
  // Obtenir les politiques d'un vendeur
  async getSellerPolicies(sellerId, options = {}) {
    const { includeInactive = false } = options;
    
    const query = { sellerId };
    
    let shippingPolicy = await ShippingPolicy.findOne(query)
      .populate({
        path: 'zonePolicies.zoneId',
        select: 'name code type fullPath level',
        populate: {
          path: 'parent',
          select: 'name code type'
        }
      });

    if (!shippingPolicy) {
      // Créer une nouvelle politique vide pour le vendeur
      shippingPolicy = new ShippingPolicy({
        sellerId,
        zonePolicies: []
      });
      await shippingPolicy.save();
    }

    // Filtrer les politiques inactives si nécessaire
    if (!includeInactive) {
      shippingPolicy.zonePolicies = shippingPolicy.zonePolicies.filter(p => p.isActive);
    }

    return shippingPolicy;
  }

  // Créer ou mettre à jour une politique pour une zone
  async setPolicyForZone(sellerId, zoneId, policyData) {
    
    // Valider la zone
    const zone = await Zone.findById(zoneId);
    if (!zone) {
      throw new Error('Zone introuvable');
    }

    // Obtenir ou créer la politique du vendeur
    let shippingPolicy = await ShippingPolicy.findOne({ sellerId });
    if (!shippingPolicy) {
      shippingPolicy = new ShippingPolicy({ sellerId, zonePolicies: [] });
    }

    // Valider les données
    if (typeof policyData.fixedCost !== 'number' || policyData.fixedCost < 0) {
      throw new Error('Le coût fixe doit être un nombre positif');
    }
    if (typeof policyData.costPerKg !== 'number' || policyData.costPerKg < 0) {
      throw new Error('Le coût par kg doit être un nombre positif');
    }

    // Vérifier qu'il n'y a pas déjà une politique pour cette zone
    const existingPolicyIndex = shippingPolicy.zonePolicies.findIndex(
      p => p.zoneId.toString() === zoneId.toString()
    );

    if (existingPolicyIndex >= 0) {
      // Mettre à jour la politique existante
      const existingPolicy = shippingPolicy.zonePolicies[existingPolicyIndex];
      Object.assign(existingPolicy, policyData);
    } else {
      // Ajouter une nouvelle politique
      shippingPolicy.zonePolicies.push({
        zoneId,
        ...policyData
      });
    }

    // Si c'est une politique par défaut, désactiver les autres
    
    if (policyData.isDefault) {
      shippingPolicy.zonePolicies.forEach((policy, index) => {
        if (policy.zoneId.toString() !== zoneId.toString()) {
          policy.isDefault = false;
        }
      });
    }

    await shippingPolicy.save();
    return this.getSellerPolicies(sellerId);
  }

  // Supprimer une politique
  async removePolicy(sellerId, policyId) {
    const shippingPolicy = await ShippingPolicy.findOne({ sellerId });
    if (!shippingPolicy) {
      throw new Error('Aucune politique trouvée pour ce vendeur');
    }

    const policyIndex = shippingPolicy.zonePolicies.findIndex(
      p => p._id.toString() === policyId.toString()
    );

    if (policyIndex === -1) {
      throw new Error('Politique introuvable');
    }

    // Ne pas permettre la suppression de la politique par défaut s'il y en a d'autres
    const policy = shippingPolicy.zonePolicies[policyIndex];
    if (policy.isDefault && shippingPolicy.zonePolicies.length > 1) {
      throw new Error('Impossible de supprimer la politique par défaut. Définissez d\'abord une autre politique comme par défaut.');
    }

    shippingPolicy.zonePolicies.splice(policyIndex, 1);
    await shippingPolicy.save();

    return this.getSellerPolicies(sellerId);
  }

  // Activer/désactiver une politique
  async togglePolicyStatus(sellerId, policyId, isActive) {
    const shippingPolicy = await ShippingPolicy.findOne({ sellerId });
    if (!shippingPolicy) {
      throw new Error('Aucune politique trouvée pour ce vendeur');
    }

    const policy = shippingPolicy.zonePolicies.find(
      p => p._id.toString() === policyId.toString()
    );

    if (!policy) {
      throw new Error('Politique introuvable');
    }

    // Ne pas permettre de désactiver la politique par défaut
    if (!isActive && policy.isDefault) {
      throw new Error('Impossible de désactiver la politique par défaut');
    }

    policy.isActive = isActive;
    await shippingPolicy.save();

    return this.getSellerPolicies(sellerId);
  }

  // Calculer les frais d'expédition
  async calculateShippingCost(sellerId, customerZoneId, weight) {
    if (!sellerId || !customerZoneId || !weight) {
      throw new Error('Paramètres manquants: sellerId, customerZoneId et weight sont requis');
    }

    if (weight <= 0) {
      throw new Error('Le poids doit être supérieur à 0');
    }

    try {
      return await ShippingPolicy.calculateShippingCost(sellerId, customerZoneId, weight);
    } catch (error) {
      throw new Error(`Erreur de calcul: ${error.message}`);
    }
  }

  // Calculer les frais pour plusieurs vendeurs (panier multi-vendeurs)
  async calculateMultiVendorShipping(items, customerZoneId) {
    const results = [];
    let totalShipping = 0;

    for (const item of items) {
      try {
        const cost = await this.calculateShippingCost(
          item.sellerId,
          customerZoneId,
          item.weight
        );

        results.push({
          sellerId: item.sellerId,
          sellerName: item.sellerName,
          weight: item.weight,
          items: item.items || 1,
          ...cost
        });

        totalShipping += cost.totalCost;
      } catch (error) {
        results.push({
          sellerId: item.sellerId,
          sellerName: item.sellerName,
          error: error.message,
          totalCost: 0
        });
      }
    }

    return {
      vendors: results,
      totalShipping,
      totalWeight: items.reduce((sum, item) => sum + item.weight, 0),
      customerZone: customerZoneId
    };
  }

  // Obtenir les zones disponibles pour configuration
  async getAvailableZones(sellerId, search = '', limit = 50) {
    // Obtenir les zones déjà configurées
    const shippingPolicy = await ShippingPolicy.findOne({ sellerId });
    const configuredZoneIds = shippingPolicy ? 
      shippingPolicy.zonePolicies.map(p => p.zoneId.toString()) : [];

    // Rechercher les zones non configurées
    const query = {
      isActive: true,
      _id: { $nin: configuredZoneIds }
    };

    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { fullPath: new RegExp(search, 'i') },
        { code: new RegExp(search, 'i') }
      ];
    }

    return Zone.find(query)
      .sort('level name')
      .limit(limit)
      .select('name code type level fullPath');
  }

  // Dupliquer une politique
  async duplicatePolicy(sellerId, sourcePolicyId, targetZoneId) {
    const shippingPolicy = await ShippingPolicy.findOne({ sellerId });
    if (!shippingPolicy) {
      throw new Error('Aucune politique trouvée pour ce vendeur');
    }

    const sourcePolicy = shippingPolicy.zonePolicies.find(
      p => p._id.toString() === sourcePolicyId.toString()
    );

    if (!sourcePolicy) {
      throw new Error('Politique source introuvable');
    }

    // Vérifier que la zone cible existe
    const targetZone = await Zone.findById(targetZoneId);
    if (!targetZone) {
      throw new Error('Zone cible introuvable');
    }

    // Créer la nouvelle politique
    return this.setPolicyForZone(sellerId, targetZoneId, {
      fixedCost: sourcePolicy.fixedCost,
      costPerKg: sourcePolicy.costPerKg,
      isActive: true,
      isDefault: false
    });
  }

  // Obtenir les statistiques des politiques d'un vendeur
  async getSellerStats(sellerId) {
    const shippingPolicy = await ShippingPolicy.findOne({ sellerId })
      .populate('zonePolicies.zoneId', 'type');

    if (!shippingPolicy) {
      return {
        totalPolicies: 0,
        activePolicies: 0,
        hasDefaultPolicy: false,
        coverageByType: {}
      };
    }

    const activePolicies = shippingPolicy.zonePolicies.filter(p => p.isActive);
    const hasDefaultPolicy = shippingPolicy.zonePolicies.some(p => p.isDefault && p.isActive);
    
    const coverageByType = activePolicies.reduce((acc, policy) => {
      const type = policy?.zoneId?.type;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    return {
      totalPolicies: shippingPolicy.zonePolicies.length,
      activePolicies: activePolicies.length,
      hasDefaultPolicy,
      coverageByType
    };
  }
}

module.exports = new ShippingService();