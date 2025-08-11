const { TypeProduit } = require('../Models');

class TypeService {
  async getAllTypes() {
    return await TypeProduit.find();
  }

  async getTypesBySeller(sellerId) {
    // Cette logique peut être adaptée selon vos besoins
    return await TypeProduit.find({ sellerId });
  }

  async createType(typeData) {
    const newType = new TypeProduit(typeData);
    return await newType.save();
  }

  async updateType(typeId, typeData) {
    return await TypeProduit.findByIdAndUpdate(
      typeId,
      typeData,
      { new: true, runValidators: true }
    );
  }

  async deleteType(typeId) {
    const deleted = await TypeProduit.findByIdAndDelete(typeId);
    return !!deleted;
  }

  async getTypeById(typeId) {
    return await TypeProduit.findById(typeId);
  }

  async getTypesByCategory(categoryId) {
    return await TypeProduit.find({ clefCategories: categoryId });
  }
}

module.exports = new TypeService();