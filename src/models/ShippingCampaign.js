/**
 * Campagne de livraison offerte — financée par la plateforme.
 * S'applique par colis (une boutique) quand toutes les conditions sont réunies.
 */
const mongoose = require('mongoose');

const { Schema } = mongoose;

const shippingCampaignSchema = new Schema(
  {
    name: { type: String, required: [true, 'Le nom de la campagne est requis'], trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    isActive: { type: Boolean, default: false },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    /** Montant d'articles minimum dans la boutique pour bénéficier de la livraison offerte */
    minParcelSubtotal: { type: Number, min: 0, default: 0 },
    /** Vide = toutes. Valeurs : sameDistrict, sameCity, sameRegion, otherRegion */
    relations: [{ type: String, enum: ['sameDistrict', 'sameCity', 'sameRegion', 'otherRegion', 'international'] }],
    /** Vide = partout. Une zone couvre aussi toutes ses sous-zones */
    destinationZoneIds: [{ type: Schema.Types.ObjectId, ref: 'ZoneF' }],
    /** Vide = toutes les boutiques */
    sellerIds: [{ type: Schema.Types.ObjectId, ref: 'SellerRequest' }],
    priority: { type: Number, default: 0 },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

shippingCampaignSchema.pre('validate', function checkDates(next) {
  if (this.startsAt && this.endsAt && this.endsAt < this.startsAt) {
    this.invalidate('endsAt', 'La date de fin doit être après la date de début');
  }
  next();
});

shippingCampaignSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });

module.exports = mongoose.models.ShippingCampaign || mongoose.model('ShippingCampaign', shippingCampaignSchema);
