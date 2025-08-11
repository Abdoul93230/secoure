const { ProductPub } = require('../Models');
const cloudinary = require('../cloudinary');

class PubService {
  async getAllPubs() {
    return await ProductPub.find().sort({ date: -1 });
  }

  async getPubById(pubId) {
    return await ProductPub.findById(pubId);
  }

  async createPub(pubData) {
    const newPub = new ProductPub(pubData);
    return await newPub.save();
  }

  async updatePub(pubId, pubData) {
    const existingPub = await ProductPub.findById(pubId);
    if (!existingPub) return null;

    // Si une nouvelle image est fournie, supprimer l'ancienne
    if (pubData.image && existingPub.image) {
      await this.deleteImage(existingPub.image);
    }

    return await ProductPub.findByIdAndUpdate(
      pubId,
      pubData,
      { new: true, runValidators: true }
    );
  }

  async deletePub(pubId) {
    const pub = await ProductPub.findById(pubId);
    if (!pub) return false;

    // Supprimer l'image associée
    if (pub.image) {
      await this.deleteImage(pub.image);
    }

    await ProductPub.findByIdAndDelete(pubId);
    return true;
  }

  async getPubsByCategory(categoryId) {
    return await ProductPub.find({ clefCategorie: categoryId }).sort({ date: -1 });
  }

  async togglePubStatus(pubId) {
    const pub = await ProductPub.findById(pubId);
    if (!pub) return null;

    pub.pub = !pub.pub;
    return await pub.save();
  }

  async preparePubData(bodyData, file) {
    const pubData = { ...bodyData };
    
    if (file) {
      pubData.image = await this.uploadImage(file);
    }

    return pubData;
  }

  async uploadImage(file) {
    if (!file) return null;
    
    const result = await cloudinary.uploader.upload(file.path, {
      folder: "images"
    });
    return result.secure_url;
  }

  async deleteImage(imageUrl) {
    if (!imageUrl) return;
    
    try {
      const publicId = this.extractPublicIdFromUrl(imageUrl);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId);
      }
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'image:', error);
    }
  }

  extractPublicIdFromUrl(url) {
    if (!url) return null;
    const matches = url.match(/\/images\/([^.]+)/);
    return matches ? `images/${matches[1]}` : null;
  }
}

module.exports = new PubService();