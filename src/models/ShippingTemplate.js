/**
 * Modèle de livraison (« template ») — configuré par l'admin, affecté aux boutiques
 * et éventuellement à des produits. Voir services/shipping/engine.js pour le calcul.
 */
const mongoose = require('mongoose');

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;
const money = { type: Number, min: [0, 'Montant négatif interdit'], default: 0 };

const delaySchema = new Schema(
  {
    sameDay: { type: Boolean, default: false },
    minDays: { type: Number, min: 0, max: 60, default: 1 },
    maxDays: { type: Number, min: 0, max: 60, default: 2 },
  },
  { _id: false },
);

const relationRuleSchema = new Schema(
  {
    baseFee: money,
    available: { type: Boolean, default: true },
    delay: { type: delaySchema, default: () => ({}) },
  },
  { _id: false },
);

const RELATION_KEYS = ['sameDistrict', 'sameCity', 'sameRegion', 'otherRegion', 'international'];

const shippingTemplateSchema = new Schema(
  {
    code: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    name: { type: String, required: [true, 'Le nom du modèle est requis'], trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    /** platform : modèle partagé ; custom : personnalisation d'une boutique */
    kind: { type: String, enum: ['platform', 'custom'], default: 'platform' },
    ownerSellerId: { type: ObjectId, ref: 'SellerRequest', default: null },
    basedOnTemplateId: { type: ObjectId, ref: 'ShippingTemplate', default: null },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },

    relations: {
      sameDistrict: { type: relationRuleSchema, default: () => ({}) },
      sameCity: { type: relationRuleSchema, default: () => ({}) },
      sameRegion: { type: relationRuleSchema, default: () => ({}) },
      otherRegion: { type: relationRuleSchema, default: () => ({}) },
      international: { type: relationRuleSchema, default: () => ({ available: false }) },
    },
    /** Tarif local propre à une zone : ex. même quartier à Niamey = 1 000 F */
    areaRates: [
      new Schema({ zoneId: { type: ObjectId, ref: 'ZoneF', required: true }, relation: { type: String, enum: ['sameDistrict', 'sameCity', 'sameRegion'], required: true }, baseFee: money }, { _id: true }),
    ],
    /** Trajets entre régions (autre région) */
    regionRoutes: [
      new Schema({
        fromZoneId: { type: ObjectId, ref: 'ZoneF', required: true },
        toZoneId: { type: ObjectId, ref: 'ZoneF', required: true },
        baseFee: money,
        minDays: { type: Number, min: 0, max: 60, default: 1 },
        maxDays: { type: Number, min: 0, max: 60, default: 2 },
        bidirectional: { type: Boolean, default: true },
      }, { _id: true }),
    ],
    /** Règles par zone de destination : non desservie / prix fixe / supplément */
    destinationRules: [
      new Schema({
        zoneId: { type: ObjectId, ref: 'ZoneF', required: true },
        mode: { type: String, enum: ['unavailable', 'fixed', 'surcharge'], required: true },
        amount: money,
        note: { type: String, trim: true, maxlength: 120, default: '' },
      }, { _id: true }),
    ],

    includedWeightKg: { type: Number, min: 0, max: 100, default: 1 },
    extraPerKgByClass: {
      small: { ...money, default: 150 },
      medium: { ...money, default: 200 },
      large: { ...money, default: 500 },
    },
    sameDayCutoff: { type: String, match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure au format HH:MM'], default: '18:30' },
    maxWeightKg: { type: Number, min: 0, default: 0 }, // 0 = pas de limite
    codAllowed: { type: Boolean, default: true },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

shippingTemplateSchema.index({ isDefault: 1, isActive: 1 });
shippingTemplateSchema.index({ ownerSellerId: 1 });

/** Un seul modèle par défaut à la fois */
shippingTemplateSchema.pre('save', async function ensureSingleDefault() {
  if (this.isDefault && this.isModified('isDefault')) {
    await this.constructor.updateMany({ _id: { $ne: this._id }, isDefault: true }, { $set: { isDefault: false } });
  }
});

shippingTemplateSchema.statics.RELATION_KEYS = RELATION_KEYS;

module.exports = mongoose.models.ShippingTemplate || mongoose.model('ShippingTemplate', shippingTemplateSchema);
