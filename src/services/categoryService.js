const { Categorie } = require('../Models');
const cloudinary = require('../cloudinary');

class CategoryService {
  async getAllCategories() {
    return await Categorie.find();
  }

  async createCategory(categoryData) {
    const newCategory = new Categorie(categoryData);
    return await newCategory.save();
  }

  async updateCategory(categoryId, categoryData) {
    const existingCategory = await Categorie.findById(categoryId);
    if (!existingCategory) return null;

    // Si une nouvelle image est fournie, supprimer l'ancienne
    if (categoryData.image && existingCategory.image) {
      await this.deleteImage(existingCategory.image);
    }

    return await Categorie.findByIdAndUpdate(
      categoryId,
      categoryData,
      { new: true, runValidators: true }
    );
  }

  async deleteCategory(categoryId) {
    const category = await Categorie.findById(categoryId);
    if (!category) return false;

    // Supprimer l'image associée
    if (category.image) {
      await this.deleteImage(category.image);
    }

    await Categorie.findByIdAndDelete(categoryId);
    return true;
  }

  async prepareCategoryData(bodyData, file) {
    const categoryData = { ...bodyData };
    
    if (file) {
      categoryData.image = await this.uploadImage(file);
    }

    return categoryData;
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

module.exports = new CategoryService();