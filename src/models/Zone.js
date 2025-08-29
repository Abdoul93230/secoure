const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Le nom de la zone est requis'],
    trim: true,
    maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères']
  },
  code: {
    type: String,
    required: [true, 'Le code de la zone est requis'],
    unique: true,
    trim: true,
    uppercase: true,
    maxlength: [20, 'Le code ne peut pas dépasser 20 caractères']
  },
  type: {
    type: String,
    required: [true, 'Le type de zone est requis'],
    enum: {
      values: ['country', 'region', 'city', 'district'],
      message: 'Le type doit être: country, region, city, ou district'
    }
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ZoneF',
    default: null
  },
  level: {
    type: Number,
    required: true,
    min: [0, 'Le niveau minimum est 0'],
    max: [3, 'Le niveau maximum est 3']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Champs calculés pour optimiser les requêtes
  fullPath: {
    type: String,
    index: true
  },
  ancestors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Zone'
  }]
}, {
  timestamps: true
});

// Index pour optimiser les recherches hiérarchiques
zoneSchema.index({ parent: 1, type: 1 });
zoneSchema.index({ level: 1, isActive: 1 });
zoneSchema.index({ fullPath: 'text', name: 'text' });

// Middleware pour générer le code automatiquement
zoneSchema.pre('save', async function(next) {
  if (this.isNew && !this.code) {
    await this.generateCode();
  }
  
  // Calculer le chemin complet et les ancêtres
  await this.calculatePath();
  next();
});

// Méthode pour générer le code de zone
zoneSchema.methods.generateCode = async function() {
  let code = this.name
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toUpperCase()
    .substring(0, 10);
  
  if (this.parent) {
    const parentZone = await this.constructor.findById(this.parent);
    if (parentZone) {
      code = `${parentZone.code}-${code}`;
    }
  }
  
  // Vérifier l'unicité
  let counter = 1;
  let finalCode = code;
  while (await this.constructor.findOne({ code: finalCode, _id: { $ne: this._id } })) {
    finalCode = `${code}-${counter}`;
    counter++;
  }
  
  this.code = finalCode;
};

// Méthode pour calculer le chemin complet
zoneSchema.methods.calculatePath = async function() {
  if (!this.parent) {
    this.fullPath = this.name;
    this.ancestors = [];
    return;
  }
  
  const parentZone = await this.constructor.findById(this.parent).populate('ancestors');
  if (parentZone) {
    this.fullPath = `${parentZone.fullPath} > ${this.name}`;
    this.ancestors = [...parentZone.ancestors, this.parent];
  }
};

// Méthode statique pour obtenir l'arbre hiérarchique
zoneSchema.statics.getHierarchy = async function(parentId = null, level = 0) {
  const zones = await this.find({ 
    parent: parentId,
    isActive: true 
  }).sort('name');
  
  const result = [];
  for (const zone of zones) {
    const children = level < 3 ? await this.getHierarchy(zone._id, level + 1) : [];
    result.push({
      ...zone.toObject(),
      children
    });
  }
  
  return result;
};

// Méthode statique pour rechercher avec auto-complétion
zoneSchema.statics.search = async function(query, limit = 20) {
  return this.find({
    $or: [
      { name: new RegExp(query, 'i') },
      { fullPath: new RegExp(query, 'i') },
      { code: new RegExp(query, 'i') }
    ],
    isActive: true
  })
  .populate('parent', 'name code')
  .limit(limit)
  .sort('level name');
};

module.exports = mongoose.model('ZoneF', zoneSchema);