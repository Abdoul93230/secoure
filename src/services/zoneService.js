const Zone = require('../models/Zone');

class ZoneService {
  // Votre méthode getZones est déjà bonne, pas de modification nécessaire
  async getZones(options = {}) {
    const {
      page = 1,
      limit = 20,
      type,
      parent,
      search,
      sortBy = 'name',
      sortOrder = 1,
      includeInactive = false,
      isActive
    } = options;

    const skip = (page - 1) * limit;
    const query = {};

    // Filtres
    if (isActive !== undefined) {
      query.isActive = isActive
    } else if (!includeInactive) {
      query.isActive = true;
    }
    
    if (type) {
      query.type = type;
    }
    
    if (parent !== undefined && parent !== null) {
      query.parent = parent;
    } else if (parent === null) {
      query.parent = null;
    }
    
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { fullPath: new RegExp(search, 'i') },
        { code: new RegExp(search, 'i') }
      ];
    }

    // Exécuter la requête avec pagination
    const [zones, total] = await Promise.all([
      Zone.find(query)
        .populate('parent', 'name code type')
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit),
      Zone.countDocuments(query)
    ]);

    return {
      zones,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        limit,
        totalItems: total
      }
    };
  }

  // Modifier getZoneChildren pour supporter la pagination optionnelle
  async getZoneChildren(parentId, includeInactive = false, options = {}) {
    const query = { parent: parentId };
    if (!includeInactive) {
      query.isActive = true;
    }

    // Si options de pagination sont fournies
    if (options.page && options.limit) {
      const { page, limit } = options;
      const skip = (page - 1) * limit;

      const [zones, total] = await Promise.all([
        Zone.find(query)
          .sort('name')
          .populate('parent', 'name code type')
          .skip(skip)
          .limit(limit),
        Zone.countDocuments(query)
      ]);

      return {
        zones, // ou children: zones si vous préférez
        pagination: {
          current: page,
          total: Math.ceil(total / limit),
          limit,
          totalItems: total
        }
      };
    }

    // Sans pagination (comportement actuel)
    return Zone.find(query)
      .sort('name')
      .populate('parent', 'name code type');
  }

  // Modifier searchZones pour supporter la pagination optionnelle
  async searchZones(query, options = {}) {
    // Si options est un nombre (ancien comportement), on le traite comme limit
    if (typeof options === 'number') {
      options = { limit: options };
    }

    const { page, limit = 20 } = options;

    const searchQuery = {
      $or: [
        { name: new RegExp(query, 'i') },
        { fullPath: new RegExp(query, 'i') },
        { code: new RegExp(query, 'i') }
      ],
      isActive: true
    };

    // Si pagination demandée
    if (page) {
      const skip = (page - 1) * limit;

      const [zones, total] = await Promise.all([
        Zone.find(searchQuery)
          .sort('name')
          .populate('parent', 'name code type')
          .skip(skip)
          .limit(limit),
        Zone.countDocuments(searchQuery)
      ]);

      return {
        zones,
        pagination: {
          current: page,
          total: Math.ceil(total / limit),
          limit,
          totalItems: total
        }
      };
    }

    // Sans pagination (comportement actuel pour compatibilité)
    return Zone.find(searchQuery)
      .sort('name')
      .populate('parent', 'name code type')
      .limit(limit);
  }

  // Reste de vos méthodes inchangées...
  async getZoneById(id) {
    const zone = await Zone.findById(id)
      .populate('parent', 'name code type fullPath')
      .populate('ancestors', 'name code type');

    if (!zone) {
      throw new Error('Zone introuvable');
    }

    return zone;
  }

  async createZone(zoneData) {
    // Valider le niveau en fonction du parent
    if (zoneData.parent) {
      const parentZone = await Zone.findById(zoneData.parent);
      if (!parentZone) {
        throw new Error('Zone parent introuvable');
      }
      if (parentZone.level >= 3) {
        throw new Error('Impossible de créer une zone enfant à ce niveau');
      }
      zoneData.level = parentZone.level + 1;
    } else {
      zoneData.level = 0;
    }

    // Valider la cohérence type/niveau
    const typeToLevel = {
      country: 0,
      region: 1,
      city: 2,
      district: 3
    };

    if (typeToLevel[zoneData.type] !== zoneData.level) {
      throw new Error(`Le type "${zoneData.type}" ne correspond pas au niveau ${zoneData.level}`);
    }

    const zone = new Zone(zoneData);
    await zone.save();
    
    return this.getZoneById(zone._id);
  }

  async updateZone(id, updateData) {
    // Ne pas permettre de modifier parent et level directement
    delete updateData.parent;
    delete updateData.level;
    delete updateData.ancestors;
    delete updateData.fullPath;

    const zone = await Zone.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );

    if (!zone) {
      throw new Error('Zone introuvable');
    }

    return this.getZoneById(id);
  }

  async deleteZone(id) {
    // Vérifier qu'il n'y a pas d'enfants actifs
    const childrenCount = await Zone.countDocuments({ parent: id, isActive: true });
    if (childrenCount > 0) {
      throw new Error('Impossible de supprimer une zone qui a des sous-zones actives');
    }

    const zone = await Zone.findByIdAndUpdate(
      id,
      { isActive: false, updatedAt: Date.now() },
      { new: true }
    );

    if (!zone) {
      throw new Error('Zone introuvable');
    }

    return { message: 'Zone supprimée avec succès', zone };
  }

  async getHierarchy(parentId = null, maxLevel = 3) {
    return Zone.getHierarchy(parentId, 0);
  }

  async getStats() {
    const [
      totalZones,
      activeZones,
      inactiveZones,
      statsByType,
      statsByLevel
    ] = await Promise.all([
      Zone.countDocuments(),
      Zone.countDocuments({ isActive: true }),
      Zone.countDocuments({ isActive: false }),
      Zone.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Zone.aggregate([
        { $group: { _id: '$level', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    ]);

    return {
      total: totalZones,
      active: activeZones,
      inactive: inactiveZones,
      byType: statsByType,
      byLevel: statsByLevel
    };
  }

  async validateHierarchy(zoneId) {
    const zone = await Zone.findById(zoneId).populate('parent');
    if (!zone) return false;

    // Vérifier que le niveau correspond au type
    const typeToLevel = {
      country: 0,
      region: 1,
      city: 2,
      district: 3
    };

    return typeToLevel[zone.type] === zone.level;
  }
}

module.exports = new ZoneService();