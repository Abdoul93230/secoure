const { Produit, Commande } = require('../Models');
const cloudinary = require('../cloudinary');

class ProductService {
  async getAllProducts() {
    return await Produit.find({ isDeleted: false });
  }

  async getProductById(productId) {
    return await Produit.findOne({ _id: productId, isDeleted: false });
  }

  async createProduct(productData) {
    const newProduct = new Produit(productData);
    return await newProduct.save();
  }

  async updateProduct(productId, productData) {
    return await Produit.findByIdAndUpdate(
      productId,
      productData,
      { new: true, runValidators: true }
    );
  }

  async updateProductSimple(productId, updateData) {
    return await Produit.findByIdAndUpdate(
      productId,
      updateData,
      { new: true }
    );
  }

  async deleteProduct(productId) {
    const product = await Produit.findById(productId);
    if (!product) return false;

    // Supprimer les images de Cloudinary
    await this.deleteProductImages(product);
    
    // Supprimer le produit de la base de données
    await Produit.findByIdAndDelete(productId);
    return true;
  }

  async softDeleteProduct(productId) {
    const updated = await Produit.findByIdAndUpdate(
      productId,
      { isDeleted: true },
      { new: true }
    );
    return !!updated;
  }

  async searchByType(type) {
    return await Produit.find({
      ClefType: type,
      isDeleted: false,
      isPublished: "Published"
    });
  }

  async searchByTypeAndSeller(type, seller) {
    return await Produit.find({
      ClefType: type,
      Clefournisseur: seller,
      isDeleted: false,
      isPublished: "Published"
    });
  }

  async searchByName(name) {
    return await Produit.find({
      name: { $regex: name, $options: "i" },
      isDeleted: false,
      isPublished: "Published"
    });
  }

  async searchByNameAndSeller(name, seller) {
    return await Produit.find({
      name: { $regex: name, $options: "i" },
      Clefournisseur: seller,
      isDeleted: false,
      isPublished: "Published"
    });
  }

  async validateProduct(productId, validationData) {
    const { isPublished, comments, validatedBy } = validationData;
    
    return await Produit.findByIdAndUpdate(
      productId,
      {
        isPublished,
        comments,
        validatedBy,
        isValidated: isPublished === "Published"
      },
      { new: true }
    );
  }

  async updateOrderStatus(orderId, newStatus) {
    return await Commande.findByIdAndUpdate(
      orderId,
      { etatTraitement: newStatus },
      { new: true }
    );
  }

  async prepareProductData(bodyData, files) {
    const productData = { ...bodyData };
    
    // Traitement des images principales
    if (files) {
      if (files.image1) {
        productData.image1 = await this.uploadImage(files.image1[0]);
      }
      if (files.image2) {
        productData.image2 = await this.uploadImage(files.image2[0]);
      }
      if (files.image3) {
        productData.image3 = await this.uploadImage(files.image3[0]);
      }
      
      // Traitement des images de variantes
      const variantImages = [];
      Object.keys(files).forEach(key => {
        if (key.startsWith('imageVariante')) {
          variantImages.push(this.uploadImage(files[key][0]));
        }
      });
      
      if (variantImages.length > 0) {
        productData.variantImages = await Promise.all(variantImages);
      }
    }

    // Traitement des variantes si présentes
    if (productData.variants && typeof productData.variants === 'string') {
      productData.variants = JSON.parse(productData.variants);
    }

    return productData;
  }

  async uploadImage(file) {
    if (!file) return null;
    
    const result = await cloudinary.uploader.upload(file.path, {
      folder: "images"
    });
    return result.secure_url;
  }

  async deleteProductImages(product) {
    const imagesToDelete = [
      product.image1,
      product.image2,
      product.image3,
      ...(product.pictures || [])
    ].filter(Boolean);

    for (const imageUrl of imagesToDelete) {
      try {
        const publicId = this.extractPublicIdFromUrl(imageUrl);
        if (publicId) {
          await cloudinary.uploader.destroy(publicId);
        }
      } catch (error) {
        console.error('Erreur lors de la suppression de l\'image:', error);
      }
    }
  }

  extractPublicIdFromUrl(url) {
    if (!url) return null;
    const matches = url.match(/\/images\/([^.]+)/);
    return matches ? `images/${matches[1]}` : null;
  }
}

module.exports = new ProductService();