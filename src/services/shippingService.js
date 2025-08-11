const { Zone, Transporteur, Produit } = require('../Models');

class ShippingService {
  // Zone operations
  async createZone(zoneData) {
    const newZone = new Zone(zoneData);
    return await newZone.save();
  }

  async getAllZones() {
    return await Zone.find();
  }

  async getZoneById(zoneId) {
    return await Zone.findById(zoneId);
  }

  async updateZone(zoneId, zoneData) {
    return await Zone.findByIdAndUpdate(
      zoneId,
      zoneData,
      { new: true, runValidators: true }
    );
  }

  async deleteZone(zoneId) {
    const deleted = await Zone.findByIdAndDelete(zoneId);
    return !!deleted;
  }

  // Transporteur operations
  async createTransporteur(transporteurData) {
    const newTransporteur = new Transporteur(transporteurData);
    return await newTransporteur.save();
  }

  async getAllTransporteurs() {
    return await Transporteur.find();
  }

  async getTransporteurById(transporteurId) {
    return await Transporteur.findById(transporteurId);
  }

  async updateTransporteur(transporteurId, transporteurData) {
    return await Transporteur.findByIdAndUpdate(
      transporteurId,
      transporteurData,
      { new: true, runValidators: true }
    );
  }

  async deleteTransporteur(transporteurId) {
    const deleted = await Transporteur.findByIdAndDelete(transporteurId);
    return !!deleted;
  }

  // Shipping options for products
  async addShippingOption(produitId, shippingOptionData) {
    const product = await Produit.findById(produitId);
    if (!product) return null;

    if (!product.shipping) {
      product.shipping = { zones: [] };
    }

    product.shipping.zones.push(shippingOptionData);
    return await product.save();
  }

  async updateShippingOption(produitId, shippingOptionId, updateData) {
    const product = await Produit.findById(produitId);
    if (!product || !product.shipping || !product.shipping.zones) return null;

    const shippingOption = product.shipping.zones.id(shippingOptionId);
    if (!shippingOption) return null;

    Object.assign(shippingOption, updateData);
    return await product.save();
  }

  async deleteShippingOption(produitId, shippingOptionId) {
    const product = await Produit.findById(produitId);
    if (!product || !product.shipping || !product.shipping.zones) return null;

    product.shipping.zones.id(shippingOptionId).remove();
    return await product.save();
  }

  async getShippingOptionsForProduct(produitId) {
    const product = await Produit.findById(produitId);
    return product?.shipping?.zones || [];
  }

  async calculateShippingCost(produitId, destinationZoneId, weight = 1) {
    const product = await Produit.findById(produitId);
    if (!product || !product.shipping || !product.shipping.zones) {
      return null;
    }

    const shippingOption = product.shipping.zones.find(
      zone => zone.destinationZoneId === destinationZoneId
    );

    if (!shippingOption) {
      return null;
    }

    const baseFee = shippingOption.baseFee || 0;
    const weightFee = (shippingOption.weightFee || 0) * weight;
    
    return {
      baseFee,
      weightFee,
      totalCost: baseFee + weightFee,
      transporteur: shippingOption.transporteurName
    };
  }
}

module.exports = new ShippingService();