const { Produit, Commande, SellerRequest, PricingPlan } = require('../Models');
const cloudinary = require('../cloudinary');

const fs = require("fs");
class ProductService {
  async getAllProductsSeller() {
    return await Produit.find({ isDeleted: false }).populate('Clefournisseur');
  }
  async getAllProductsClients() {
    const products = await Produit.find({ isDeleted: false, isPublished: "Published" }).populate({
      path: 'Clefournisseur',
      match: { isvalid: true } // On ne prend que les fournisseurs valides
    });

    const validProducts = products.filter(p => p.Clefournisseur);
    return validProducts;
  }
  async getAllProductsAdmin() {
    return await Produit.find().populate('Clefournisseur');
  }

  async getProductById(productId) {
    return await Produit.findOne({ _id: productId, isDeleted: false }).populate('Clefournisseur');
  }
  async getProductByIdAdmin(productId) {
    return await Produit.findOne({ _id: productId }).populate('Clefournisseur');
  }

  // Créer un produit
  async createProduct(productData) {
    const product = new Produit(productData);
    return await product.save();
  }

  // Mettre à jour un produit
  async updateProduct(productId, updateData) {
    return await Produit.findByIdAndUpdate(
      productId,
      updateData,
      { new: true }
    );
  }

  // Mettre à jour un produit (version avancée)
  async updateProductAdvanced(productId, updateData) {
    return await Produit.findByIdAndUpdate(
      productId,
      updateData,
      { new: true, runValidators: true }
    );
  }

  // Mise à jour simple
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

  async softDeleteProduct(productId, sellerOrAdmin, sellerOrAdmin_id) {
    const product = await Produit.findById(productId);
    if (!product) return false;

    // Vérifier que l'utilisateur est autorisé à supprimer (admin ou le vendeur qui l'a créé)
    const isAuthorized =
      sellerOrAdmin === "admin" ||
      (product.createdBy &&
        product.createdBy.toString() === sellerOrAdmin_id.toString());

    if (!isAuthorized) {
      return res
        .status(403)
        .json({ message: "Vous n'êtes pas autorisé à supprimer ce produit" });
    }

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
    const { published, comments, sellerOrAdmin_id } = validationData;
    // console.log( {validationData });

    return await Produit.findByIdAndUpdate(
      productId,
      {
        isPublished: published,
        comments,
        validatedBy: sellerOrAdmin_id,
        isValidated: published === "Published"
      },
      { new: true }
    );
  }
  // Fonction pour supprimer une image de Cloudinary
  async deleteImageFromCloudinary(url) {
    try {
      if (!url || !url.includes("/")) return;

      const urlParts = url.split("/");
      const filenameWithExt = urlParts.pop();
      if (!filenameWithExt) return;

      const publicId = filenameWithExt.split(".")[0];
      const folderPath = urlParts.slice(urlParts.indexOf("images")).join("/");

      await cloudinary.uploader.destroy(`${folderPath}/${publicId}`);
    } catch (error) {
      console.error(`Erreur lors de la suppression de l'image ${url}:`, error);
    }
  }

  // async updateOrderStatus(orderId, newStatus) {
  //   return await Commande.findByIdAndUpdate(
  //     orderId,
  //     { etatTraitement: newStatus },
  //     { new: true }
  //   );
  // }

async updateOrderStatus(orderId, newStatus) {
  // Valider le nouveau statut
  const validStatuses = [
    "traitement",
    "reçu par le livreur", 
    "en cours de livraison",
    "livraison reçu",
    "Traité",
    "Annulée"
  ];
  
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Statut invalide: ${newStatus}`);
  }
  
  const updatedOrder = await Commande.findByIdAndUpdate(
    orderId,
    { 
      etatTraitement: newStatus,
      // Mettre à jour aussi la date de modification
      updatedAt: new Date()
    },
    { new: true }
  );
  
  return updatedOrder;
}


/**
 * Vérifie si le vendeur peut créer un nouveau produit selon son abonnement
 */
async checkProductCreationEligibility(sellerId) {
  // Vérifier si le vendeur existe
 
  
  const seller = await SellerRequest.findById(sellerId);
  
  if (!seller) {
    throw new Error("Vendeur non trouvé");
  }

  // Vérifier si le vendeur est validé
  if (!seller.isvalid) {
    throw new Error("Votre compte vendeur n'est pas encore validé");
  }

  // Vérifier si le vendeur a un abonnement actif
  const activeSubscription = await PricingPlan.findOne({
    storeId: sellerId,
    status: { $in: ['active', 'trial'] },
    endDate: { $gte: new Date() }
  }).sort({ createdAt: -1 });

  if (!activeSubscription) {
    throw new Error("Vous n'avez pas d'abonnement actif. Veuillez souscrire à un plan pour créer des produits");
  }

  // Vérifier si l'abonnement est expiré
  if (new Date() > new Date(activeSubscription.endDate)) {
    throw new Error("Votre abonnement a expiré. Veuillez renouveler votre plan");
  }

  // Compter le nombre de produits actuels du vendeur
  const productCount = await Produit.countDocuments({
    createdBy: sellerId,
    isDeleted: false
  });

  // Obtenir la limite de produits selon le plan
  const productLimit = activeSubscription.productLimit;

  // Vérifier la limite uniquement si elle n'est pas illimitée (-1)
  if (productLimit !== -1 && productCount >= productLimit) {
    throw new Error(
      `Limite de produits atteinte (${productCount}/${productLimit}). ` +
      `Veuillez passer à un plan supérieur pour ajouter plus de produits`
    );
  }

  return {
    canCreate: true,
    subscription: activeSubscription,
    currentProductCount: productCount,
    productLimit: productLimit,
    remainingSlots: productLimit === -1 ? 'Illimité' : productLimit - productCount
  };
}

  // Préparer les données du produit pour la création
  // async prepareProductData(bodyData, files) {
  //   const data = bodyData;
  //   const sellerOrAdmin = bodyData.sellerOrAdmin;
  //   const sellerOrAdmin_id = bodyData.sellerOrAdmin_id;

  //   // Préparer les données initiales pour le produit
  //   let productData = {
  //     name: data.name,
  //     quantite: data.quantite,
  //     prixPromo: data.prixPromo,
  //     prix: data.prix,
  //     prixf: data.prixF || 0,
  //     description: data.description,
  //     marque: data.marque,
  //     ClefType: data.ClefType,
  //     Clefournisseur: data.Clefournisseur,
  //     prixLivraison: data.prixLivraison || 0,
  //     shipping: {
  //       origine: data.origine,
  //       weight: data.weight,
  //       dimensions: {
  //         length: data.length || 0,
  //         width: data.width || 0,
  //         height: data.height || 0,
  //       },
  //       zones: JSON.parse(data.shippingZones) || [],
  //     },
  //     variants: [],
  //     createdBy: sellerOrAdmin_id,
  //     userRole: sellerOrAdmin,
  //     isDeleted: false,
  //     isPublished: sellerOrAdmin === "admin" ? "Published" : "Attente",
  //   };

  //   // Si c'est un admin qui crée le produit, on le marque comme validé
  //   if (sellerOrAdmin === "admin") {
  //     productData.isValidated = true;
  //     productData.validatedBy = sellerOrAdmin_id;
  //     productData.comments = "Validation automatique (créé par admin)";
  //   }

  //   // Gestion des variantes avec téléchargement d'images
  //   if (data.variants) {
  //     const variants = JSON.parse(data.variants);

  //     for (const [index, variant] of variants.entries()) {
  //       let imageUrl = variant.imageUrl;

  //       // Si une image pour la variante est envoyée dans files
  //       if (files && files[variant.colorName]) {
  //         imageUrl = await this.uploadImage(files[variant.colorName][0].path);
  //       }
  //       // Si une image pour la variante est envoyée avec le pattern imageVariante{index}
  //       if (files && files[`imageVariante${index}`]) {
  //         imageUrl = await this.uploadImage(files[`imageVariante${index}`][0].path);
  //       }

  //       // Ajouter la variante dans productData
  //       productData.variants.push({
  //         color: variant.colorName,
  //         colorCode: variant.color,
  //         sizes: variant.sizes,
  //         imageUrl: imageUrl,
  //         stock: variant.stock || 1,
  //         hasCustomPrice: variant.hasCustomPrice || false,
  //         price: variant.price || 0,
  //         isOnPromo: variant.isOnPromo || false,
  //         promoPrice: variant.promoPrice || 0,
  //       });
  //     }
  //   }

  //   // Validation des fichiers
  //   if (!files) {
  //     throw new Error("Aucune image du produit n'a été envoyée.");
  //   }

  //   if (!files.image1) {
  //     throw new Error("La première image du produit est obligatoire");
  //   }

  //   // Gestion des images principales et additionnelles
  //   if (files) {
  //     // Image principale 1
  //     if (files.image1) {
  //       productData.image1 = await this.uploadImage(files.image1[0].path);
  //     }

  //     // Image principale 2
  //     if (files.image2) {
  //       productData.image2 = await this.uploadImage(files.image2[0].path);
  //     }

  //     // Image principale 3
  //     if (files.image3) {
  //       productData.image3 = await this.uploadImage(files.image3[0].path);
  //     }

  //     // Gestion des nouveaux champs d'images (nouveauChampImages)
  //     if (files.nouveauChampImages) {
  //       const newPictures = [];
  //       for (const file of files.nouveauChampImages) {
  //         newPictures.push(await this.uploadImage(file.path));
  //       }
  //       productData.pictures = newPictures;
  //     }
  //   }

  //   return productData;
  // }

  async prepareProductData(bodyData, files) {
  const data = bodyData;
  const sellerOrAdmin = bodyData.sellerOrAdmin;
  const sellerOrAdmin_id = bodyData.sellerOrAdmin_id;
  const sellerId = data.Clefournisseur;

  // ========== VÉRIFICATIONS POUR LES VENDEURS ==========
  if (sellerOrAdmin === "seller") {
    // Vérifier si le vendeur existe et peut créer un produit
    if (!sellerId) {
      throw new Error("L'identifiant du vendeur (Clefournisseur) est obligatoire");
    }
    

    // Vérifier l'éligibilité du vendeur
    const eligibility = await this.checkProductCreationEligibility(sellerId);
    
    console.log(`Vendeur ${sellerId} peut créer un produit:`, {
      currentProducts: eligibility.currentProductCount,
      limit: eligibility.productLimit,
      remaining: eligibility.remainingSlots,
      plan: eligibility.subscription.planType
    });
  }

  // ========== PRÉPARATION DES DONNÉES DU PRODUIT ==========
  let productData = {
    name: data.name,
    quantite: data.quantite,
    prixPromo: data.prixPromo,
    prix: data.prix,
    prixf: data.prixF || 0,
    description: data.description,
    marque: data.marque,
    ClefType: data.ClefType,
    Clefournisseur: sellerId,
    prixLivraison: data.prixLivraison || 0,
    shipping: {
      origine: data.origine,
      weight: data.weight,
      dimensions: {
        length: data.length || 0,
        width: data.width || 0,
        height: data.height || 0,
      },
      zones: JSON.parse(data.shippingZones) || [],
    },
    variants: [],
    createdBy: sellerOrAdmin_id,
    userRole: sellerOrAdmin,
    isDeleted: false,
    isPublished: sellerOrAdmin === "admin" ? "Published" : "Attente",
  };

  // Si c'est un admin qui crée le produit, on le marque comme validé
  if (sellerOrAdmin === "admin") {
    productData.isValidated = true;
    productData.validatedBy = sellerOrAdmin_id;
    productData.comments = "Validation automatique (créé par admin)";
  }

  // ========== GESTION DES VARIANTES ==========
  if (data.variants) {
    const variants = JSON.parse(data.variants);

    for (const [index, variant] of variants.entries()) {
      let imageUrl = variant.imageUrl;

      // Si une image pour la variante est envoyée dans files
      if (files && files[variant.colorName]) {
        imageUrl = await this.uploadImage(files[variant.colorName][0].path);
      }
      // Si une image pour la variante est envoyée avec le pattern imageVariante{index}
      if (files && files[`imageVariante${index}`]) {
        imageUrl = await this.uploadImage(files[`imageVariante${index}`][0].path);
      }

      // Ajouter la variante dans productData
      productData.variants.push({
        color: variant.colorName,
        colorCode: variant.color,
        sizes: variant.sizes,
        imageUrl: imageUrl,
        stock: variant.stock || 1,
        hasCustomPrice: variant.hasCustomPrice || false,
        price: variant.price || 0,
        isOnPromo: variant.isOnPromo || false,
        promoPrice: variant.promoPrice || 0,
      });
    }
  }

  // ========== VALIDATION DES FICHIERS ==========
  if (!files) {
    throw new Error("Aucune image du produit n'a été envoyée.");
  }

  if (!files.image1) {
    throw new Error("La première image du produit est obligatoire");
  }

  // ========== GESTION DES IMAGES ==========
  if (files) {
    // Image principale 1
    if (files.image1) {
      productData.image1 = await this.uploadImage(files.image1[0].path);
    }

    // Image principale 2
    if (files.image2) {
      productData.image2 = await this.uploadImage(files.image2[0].path);
    }

    // Image principale 3
    if (files.image3) {
      productData.image3 = await this.uploadImage(files.image3[0].path);
    }

    // Gestion des nouveaux champs d'images
    if (files.nouveauChampImages) {
      const newPictures = [];
      for (const file of files.nouveauChampImages) {
        newPictures.push(await this.uploadImage(file.path));
      }
      productData.pictures = newPictures;
    }
  }

  return productData;
}


  // Préparer les données pour la mise à jour

  async prepareUpdateData(productId, bodyData, files) {
    const data = bodyData;
    const product = await Produit.findById(productId);

    if (!product) {
      throw new Error("Produit introuvable");
    }

    // Récupérer les IDs des variantes supprimées
    const deletedVariantIds = JSON.parse(data.deletedVariantIds || "[]");

    let updateData = {
      name: data.name,
      quantite: data.quantite,
      prixPromo: data.prixPromo,
      prix: data.prix,
      prixf: data.prixF || 0,
      description: data.description,
      marque: data.marque,
      ClefType: data.ClefType,
      Clefournisseur: data.Clefournisseur,
      prixLivraison: data.prixLivraison || 0,
      "shipping.weight": data.weight,
      "shipping.dimensions": {
        length: data.length || 0,
        width: data.width || 0,
        height: data.height || 0,
      },
    };

    if (data.shippingZones) {
      updateData["shipping.zones"] = JSON.parse(data.shippingZones);
    }

    // Mise à jour des variantes avec gestion des images
    if (data.variants) {
      const variants = JSON.parse(data.variants);
      updateData.variants = [];

      // Supprimer les images des variantes supprimées
      for (const variantId of deletedVariantIds) {
        const variantToDelete = product.variants.find(
          (v) => v._id.toString() === variantId
        );
        if (variantToDelete && variantToDelete.imageUrl) {
          await this.deleteImageFromCloudinary(variantToDelete.imageUrl);
        }
      }

      // Filtrer les variantes à conserver
      product.variants = product.variants.filter(
        (v) => !deletedVariantIds.includes(v._id.toString())
      );

      for (const [index, variant] of variants.entries()) {
        let imageUrl = variant.imageUrl;

        // Si une image pour la variante est envoyée dans files
        if (files && files[`imageVariante${index}`]) {
          // Supprimer l'ancienne image si elle existe
          if (variant.imageUrl) {
            await this.deleteImageFromCloudinary(variant.imageUrl);
          }

          // Upload de la nouvelle image
          imageUrl = await this.uploadImage(files[`imageVariante${index}`][0].path);
        }

        // Ajouter la variante mise à jour dans updateData.variants
        updateData.variants.push({
          color: variant.colorName,
          colorCode: variant.color,
          sizes: variant.sizes,
          imageUrl: imageUrl,
          stock: variant.stock || 1,
          hasCustomPrice: variant.hasCustomPrice || false,
          price: variant.price || 0,
          isOnPromo: variant.isOnPromo || false,
          promoPrice: variant.promoPrice || 0,
        });
      }
    }

    // Gestion des images principales et additionnelles
    if (files) {
      // Mettre à jour l'image principale 1
      if (files.image1) {
        await this.deleteImageFromCloudinary(product.image1);
        updateData.image1 = await this.uploadImage(files.image1[0].path);
      }

      // Mettre à jour l'image principale 2
      if (files.image2) {
        await this.deleteImageFromCloudinary(product.image2);
        updateData.image2 = await this.uploadImage(files.image2[0].path);
      }

      // Mettre à jour l'image principale 3
      if (files.image3) {
        await this.deleteImageFromCloudinary(product.image3);
        updateData.image3 = await this.uploadImage(files.image3[0].path);
      }

      // Gestion des nouveaux champs d'images (nouveauChampImages)
      if (files.nouveauChampImages) {
        const newPictures = [];
        for (const file of files.nouveauChampImages) {
          newPictures.push(await this.uploadImage(file.path));
        }

        if (product.pictures && product.pictures.length > 0) {
          // Supprimer les anciennes images du produit
          for (const oldUrl of product.pictures) {
            await this.deleteImageFromCloudinary(oldUrl);
          }
        }

        updateData.pictures = newPictures;
      }
    }

    return { updateData, product };
  }

  // Préparer les données pour la mise à jour avancée (updateProduct2)
  // async prepareAdvancedUpdateData(productId, bodyData, files) {
  //   const data = bodyData;
  //   const sellerOrAdmin = bodyData.sellerOrAdmin;
  //   const sellerOrAdmin_id = bodyData.sellerOrAdmin_id;

  //   const product = await Produit.findById(productId);
  //   if (!product) {
  //     throw new Error("Produit introuvable");
  //   }

  //   // Vérifier que le produit n'est pas supprimé
  //   if (product.isDeleted && sellerOrAdmin !== "admin") {
  //     throw new Error("Impossible de modifier un produit supprimé");
  //   }

  //   // Vérifier que l'utilisateur est autorisé à modifier le produit
  //   const isAuthorized =
  //     sellerOrAdmin === "admin" ||
  //     (product.createdBy &&
  //       product.createdBy.toString() === sellerOrAdmin_id.toString());

  //   if (!isAuthorized) {
  //     throw new Error("Vous n'êtes pas autorisé à modifier ce produit");
  //   }

  //   // Récupérer les IDs des variantes supprimées
  //   const deletedVariantIds = Array.isArray(data.deletedVariantIds)
  //     ? data.deletedVariantIds
  //     : JSON.parse(data.deletedVariantIds || "[]");

  //   // Récupérer les images à supprimer (sans remplacement)
  //   const imagesToDelete = Array.isArray(data.imagesToDelete)
  //     ? data.imagesToDelete
  //     : JSON.parse(data.imagesToDelete || "[]");

  //   // Données de mise à jour de base
  //   let updateData = {
  //     name: data.name,
  //     quantite: data.quantite,
  //     prixPromo: data.prixPromo,
  //     prix: data.prix,
  //     prixf: data.prixF || 0,
  //     description: data.description,
  //     marque: data.marque,
  //     ClefType: data.ClefType,
  //     Clefournisseur: data.Clefournisseur,
  //     prixLivraison: data.prixLivraison || 0,
  //     "shipping.weight": data.weight,
  //     "shipping.dimensions": {
  //       length: data.length || 0,
  //       width: data.width || 0,
  //       height: data.height || 0,
  //     },
  //   };

  //   if (data.shippingZones) {
  //     try {
  //       updateData["shipping.zones"] =
  //         typeof data.shippingZones === "string"
  //           ? JSON.parse(data.shippingZones)
  //           : data.shippingZones;
  //     } catch (error) {
  //       console.error("Erreur lors du parsing des zones d'expédition:", error);
  //     }
  //   }

  //   // Gestion des suppressions d'images principales
  //   const imageDeletePromises = [];

  //   if (imagesToDelete.includes("image2") && product.image2) {
  //     imageDeletePromises.push(this.deleteImageFromCloudinary(product.image2));
  //     updateData.image2 = "";
  //   }

  //   if (imagesToDelete.includes("image3") && product.image3) {
  //     imageDeletePromises.push(this.deleteImageFromCloudinary(product.image3));
  //     updateData.image3 = "";
  //   }

  //   // Attendre que toutes les suppressions d'images soient terminées
  //   await Promise.all(imageDeletePromises);

  //   // Gestion des variantes
  //   if (data.variants) {
  //     try {
  //       const variants =
  //         typeof data.variants === "string"
  //           ? JSON.parse(data.variants)
  //           : data.variants;

  //       updateData.variants = [];

  //       // Créer un tableau de promesses pour la suppression des images des variantes supprimées
  //       const deletePromises = deletedVariantIds.map((variantId) => {
  //         const variantToDelete = product.variants.find(
  //           (v) => v._id.toString() === variantId
  //         );
  //         if (variantToDelete?.imageUrl) {
  //           return this.deleteImageFromCloudinary(variantToDelete.imageUrl);
  //         }
  //         return Promise.resolve();
  //       });

  //       // Attendre que toutes les suppressions soient terminées
  //       await Promise.all(deletePromises);

  //       // Filtrer les variantes à conserver
  //       product.variants = product.variants.filter(
  //         (v) => !deletedVariantIds.includes(v._id.toString())
  //       );

  //       // Traiter les nouvelles variantes ou celles à mettre à jour
  //       // Traiter les nouvelles variantes ou celles à mettre à jour
  //       const variantPromises = variants.map(async (variant, index) => {
  //         console.log({ variant });

  //         let imageUrl = variant.imageUrl;

  //         // Trouver la variante existante dans la base de données pour récupérer l'ancienne imageUrl
  //         let existingVariant = null;
          
  //         // Seulement chercher une variante existante si ce n'est pas une nouvelle variante
  //         if (!variant.isNew && variant._id) {
  //           existingVariant = product.variants.find(
  //             (v) => v._id.toString() === variant._id.toString()
  //           );
  //         }

  //         // Vérifier si cette variante a une image à supprimer explicitement
  //         if (variant.deleteImage && imageUrl) {
  //           await this.deleteImageFromCloudinary(imageUrl);
  //           imageUrl = "";
  //         }
  //         // Si une nouvelle image pour la variante est envoyée dans files
  //         else if (files && files[`imageVariante${index}`]) {
  //           console.log({ file: files[`imageVariante${index}`] });

  //           // Supprimer l'ancienne image si elle existe (récupérée depuis la DB)
  //           if (existingVariant && existingVariant.imageUrl) {
  //             console.log(`Suppression de l'ancienne image: ${existingVariant.imageUrl}`);
  //             await this.deleteImageFromCloudinary(existingVariant.imageUrl);
  //           }

  //           // Upload de la nouvelle image
  //           console.log(`Upload de la nouvelle image pour la variante ${index}`);
  //           imageUrl = await this.uploadImage(files[`imageVariante${index}`][0].path);
  //           console.log(`Nouvelle imageUrl: ${imageUrl}`);
  //         }

  //         // Retourner la variante mise à jour
  //         const processedVariant = {
  //           color: variant.colorName,
  //           colorCode: variant.color,
  //           sizes: variant.sizes,
  //           imageUrl: imageUrl,
  //           stock: variant.stock || 1,
  //           hasCustomPrice: variant.hasCustomPrice || false,
  //           price: variant.price || 0,
  //           isOnPromo: variant.isOnPromo || false,
  //           promoPrice: variant.promoPrice || 0,
  //         };

  //         // Seulement ajouter _id pour les variantes existantes
  //         if (!variant.isNew && variant._id) {
  //           processedVariant._id = variant._id;
  //         }

  //         return processedVariant;
  //       });

  //       // Attendre que toutes les promesses soient résolues
  //       updateData.variants = await Promise.all(variantPromises);
  //     } catch (error) {
  //       console.error("Erreur lors du traitement des variantes:", error);
  //       throw new Error("Format de variantes invalide");
  //     }
  //   }

  //   // Gestion des images principales et additionnelles
  //   if (files) {
  //     const imagePromises = [];

  //     // Fonction pour gérer l'upload d'une image
  //     const handleImageUpload = async (fileField, oldImageUrl) => {
  //       if (files[fileField]) {
  //         // Ne pas supprimer l'ancienne image si elle a déjà été supprimée dans l'étape précédente
  //         if (oldImageUrl && !imagesToDelete.includes(fileField)) {
  //           await this.deleteImageFromCloudinary(oldImageUrl);
  //         }

  //         return await this.uploadImage(files[fileField][0].path);
  //       }
  //       return undefined;
  //     };

  //     // Traiter les images principales en parallèle
  //     if (files.image1 && !imagesToDelete.includes("image1")) {
  //       imagePromises.push(
  //         handleImageUpload("image1", product.image1).then((url) => {
  //           if (url) updateData.image1 = url;
  //         })
  //       );
  //     }

  //     if (files.image2 && !imagesToDelete.includes("image2")) {
  //       imagePromises.push(
  //         handleImageUpload("image2", product.image2).then((url) => {
  //           if (url) updateData.image2 = url;
  //         })
  //       );
  //     }

  //     if (files.image3 && !imagesToDelete.includes("image3")) {
  //       imagePromises.push(
  //         handleImageUpload("image3", product.image3).then((url) => {
  //           if (url) updateData.image3 = url;
  //         })
  //       );
  //     }

  //     // Gestion des images additionnelles
  //     if (files.nouveauChampImages) {
  //       imagePromises.push(
  //         (async () => {
  //           // Supprimer d'abord les anciennes images si demandé
  //           if (
  //             imagesToDelete.includes("pictures") &&
  //             product.pictures &&
  //             product.pictures.length > 0
  //           ) {
  //             const deletePromises = product.pictures.map((url) =>
  //               this.deleteImageFromCloudinary(url)
  //             );
  //             await Promise.all(deletePromises);
  //             updateData.pictures = [];
  //           }
  //           // Sinon, si on a des images existantes et qu'on ne veut pas les supprimer
  //           else if (product.pictures && product.pictures.length > 0) {
  //             updateData.pictures = [...product.pictures];
  //           } else {
  //             updateData.pictures = [];
  //           }

  //           // Uploader les nouvelles images en parallèle
  //           const uploadPromises = files.nouveauChampImages.map((file) =>
  //             this.uploadImage(file.path)
  //           );

  //           const uploadedUrls = await Promise.all(uploadPromises);
  //           updateData.pictures = [...updateData.pictures, ...uploadedUrls];
  //         })()
  //       );
  //     }
  //     // Si on veut juste supprimer toutes les images additionnelles sans en ajouter de nouvelles
  //     else if (
  //       imagesToDelete.includes("pictures") &&
  //       product.pictures &&
  //       product.pictures.length > 0
  //     ) {
  //       imagePromises.push(
  //         (async () => {
  //           const deletePromises = product.pictures.map((url) =>
  //             this.deleteImageFromCloudinary(url)
  //           );
  //           await Promise.all(deletePromises);
  //           updateData.pictures = [];
  //         })()
  //       );
  //     }

  //     // Attendre que toutes les opérations d'images soient terminées
  //     await Promise.all(imagePromises);
  //   }

  //   // Gérer le statut de publication pour les vendeurs
  //   if (sellerOrAdmin === "seller" && product.isPublished === "Published") {
  //     updateData.isPublished = "Attente";
  //     updateData.isValidated = false;
  //     updateData.comments = "En attente de validation après modification";
  //   }

  //   // Nettoyer les fichiers temporaires après upload
  //   if (files) {
  //     Object.values(files)
  //       .flat()
  //       .forEach((file) => {
  //         if (file.path && fs.existsSync(file.path)) {
  //           fs.unlinkSync(file.path);
  //         }
  //       });
  //   }

  //   return { updateData, product };
  // }

  async prepareAdvancedUpdateData(productId, bodyData, files) {
  const data = bodyData;
  const sellerOrAdmin = bodyData.sellerOrAdmin;
  const sellerOrAdmin_id = bodyData.sellerOrAdmin_id;

  // ========== RÉCUPÉRATION DU PRODUIT ==========
  const product = await Produit.findById(productId);
  if (!product) {
    throw new Error("Produit introuvable");
  }

  // Vérifier que le produit n'est pas supprimé
  if (product.isDeleted && sellerOrAdmin !== "admin") {
    throw new Error("Impossible de modifier un produit supprimé");
  }

  // ========== VÉRIFICATION DES AUTORISATIONS ==========
  const isAuthorized =
    sellerOrAdmin === "admin" ||
    (product.createdBy &&
      product.createdBy.toString() === sellerOrAdmin_id.toString());

  if (!isAuthorized) {
    throw new Error("Vous n'êtes pas autorisé à modifier ce produit");
  }

  // ========== VÉRIFICATION DE L'ABONNEMENT (POUR LES VENDEURS) ==========
  // Si un vendeur modifie son produit, vérifier que son abonnement est toujours actif
  if (sellerOrAdmin === "seller" && data.Clefournisseur) {
    try {
      const seller = await SellerRequest.findById(data.Clefournisseur);
      
      if (!seller) {
        throw new Error("Vendeur non trouvé");
      }

      if (!seller.isvalid) {
        throw new Error("Votre compte vendeur n'est plus actif");
      }

      // Vérifier l'abonnement actif
      const activeSubscription = await PricingPlan.findOne({
        storeId: data.Clefournisseur,
        status: { $in: ['active', 'trial'] },
        endDate: { $gte: new Date() }
      }).sort({ createdAt: -1 });

      if (!activeSubscription) {
        throw new Error("Vous n'avez pas d'abonnement actif. Impossible de modifier le produit");
      }

      // Vérifier si l'abonnement est expiré
      if (new Date() > new Date(activeSubscription.endDate)) {
        throw new Error("Votre abonnement a expiré. Veuillez renouveler votre plan");
      }

    } catch (error) {
      // Si l'erreur vient des vérifications ci-dessus, la propager
      if (error.message.includes("Vendeur") || 
          error.message.includes("compte") || 
          error.message.includes("abonnement")) {
        throw error;
      }
      // Sinon logger et continuer (erreur technique non bloquante)
      console.error("Erreur lors de la vérification d'abonnement:", error);
    }
  }

  // ========== RÉCUPÉRATION DES DONNÉES DE SUPPRESSION ==========
  const deletedVariantIds = Array.isArray(data.deletedVariantIds)
    ? data.deletedVariantIds
    : JSON.parse(data.deletedVariantIds || "[]");

  const imagesToDelete = Array.isArray(data.imagesToDelete)
    ? data.imagesToDelete
    : JSON.parse(data.imagesToDelete || "[]");

  // ========== DONNÉES DE BASE ==========
  let updateData = {
    name: data.name,
    quantite: data.quantite,
    prixPromo: data.prixPromo,
    prix: data.prix,
    prixf: data.prixF || 0,
    description: data.description,
    marque: data.marque,
    ClefType: data.ClefType,
    Clefournisseur: data.Clefournisseur,
    prixLivraison: data.prixLivraison || 0,
    "shipping.weight": data.weight,
    "shipping.dimensions": {
      length: data.length || 0,
      width: data.width || 0,
      height: data.height || 0,
    },
  };

  // Gestion des zones d'expédition
  if (data.shippingZones) {
    try {
      updateData["shipping.zones"] =
        typeof data.shippingZones === "string"
          ? JSON.parse(data.shippingZones)
          : data.shippingZones;
    } catch (error) {
      console.error("Erreur lors du parsing des zones d'expédition:", error);
      throw new Error("Format des zones d'expédition invalide");
    }
  }

  // ========== SUPPRESSION DES IMAGES PRINCIPALES ==========
  const imageDeletePromises = [];

  if (imagesToDelete.includes("image2") && product.image2) {
    imageDeletePromises.push(this.deleteImageFromCloudinary(product.image2));
    updateData.image2 = "";
  }

  if (imagesToDelete.includes("image3") && product.image3) {
    imageDeletePromises.push(this.deleteImageFromCloudinary(product.image3));
    updateData.image3 = "";
  }

  await Promise.all(imageDeletePromises);

  // ========== GESTION DES VARIANTES ==========
  if (data.variants) {
    try {
      const variants =
        typeof data.variants === "string"
          ? JSON.parse(data.variants)
          : data.variants;

      updateData.variants = [];

      // Supprimer les images des variantes supprimées
      const variantDeletePromises = deletedVariantIds.map((variantId) => {
        const variantToDelete = product.variants.find(
          (v) => v._id.toString() === variantId
        );
        if (variantToDelete?.imageUrl) {
          return this.deleteImageFromCloudinary(variantToDelete.imageUrl);
        }
        return Promise.resolve();
      });

      await Promise.all(variantDeletePromises);

      // Filtrer les variantes à conserver
      product.variants = product.variants.filter(
        (v) => !deletedVariantIds.includes(v._id.toString())
      );

      // Traiter les variantes (nouvelles et existantes)
      const variantPromises = variants.map(async (variant, index) => {
        let imageUrl = variant.imageUrl;

        // Trouver la variante existante si ce n'est pas une nouvelle
        let existingVariant = null;
        if (!variant.isNew && variant._id) {
          existingVariant = product.variants.find(
            (v) => v._id.toString() === variant._id.toString()
          );
        }

        // Cas 1: Suppression explicite de l'image
        if (variant.deleteImage && imageUrl) {
          await this.deleteImageFromCloudinary(imageUrl);
          imageUrl = "";
        }
        // Cas 2: Nouvelle image uploadée
        else if (files && files[`imageVariante${index}`]) {
          // Supprimer l'ancienne image si elle existe
          if (existingVariant?.imageUrl) {
            await this.deleteImageFromCloudinary(existingVariant.imageUrl);
          }
          
          // Upload de la nouvelle image
          imageUrl = await this.uploadImage(files[`imageVariante${index}`][0].path);
        }

        // Construire l'objet variante
        const processedVariant = {
          color: variant.colorName,
          colorCode: variant.color,
          sizes: variant.sizes,
          imageUrl: imageUrl || "",
          stock: variant.stock || 1,
          hasCustomPrice: variant.hasCustomPrice || false,
          price: variant.price || 0,
          isOnPromo: variant.isOnPromo || false,
          promoPrice: variant.promoPrice || 0,
        };

        // Conserver l'ID pour les variantes existantes
        if (!variant.isNew && variant._id) {
          processedVariant._id = variant._id;
        }

        return processedVariant;
      });

      updateData.variants = await Promise.all(variantPromises);

    } catch (error) {
      console.error("Erreur lors du traitement des variantes:", error);
      throw new Error("Format de variantes invalide: " + error.message);
    }
  }

  // ========== GESTION DES IMAGES PRINCIPALES ==========
  if (files) {
    const imagePromises = [];

    // Fonction helper pour upload avec suppression de l'ancienne
    const handleImageUpload = async (fileField, oldImageUrl) => {
      if (files[fileField]) {
        // Supprimer l'ancienne image si elle existe et n'a pas déjà été supprimée
        if (oldImageUrl && !imagesToDelete.includes(fileField)) {
          await this.deleteImageFromCloudinary(oldImageUrl);
        }
        return await this.uploadImage(files[fileField][0].path);
      }
      return undefined;
    };

    // Image 1 (obligatoire, ne peut pas être supprimée)
    if (files.image1) {
      imagePromises.push(
        handleImageUpload("image1", product.image1).then((url) => {
          if (url) updateData.image1 = url;
        })
      );
    }

    // Image 2 (optionnelle)
    if (files.image2 && !imagesToDelete.includes("image2")) {
      imagePromises.push(
        handleImageUpload("image2", product.image2).then((url) => {
          if (url) updateData.image2 = url;
        })
      );
    }

    // Image 3 (optionnelle)
    if (files.image3 && !imagesToDelete.includes("image3")) {
      imagePromises.push(
        handleImageUpload("image3", product.image3).then((url) => {
          if (url) updateData.image3 = url;
        })
      );
    }

    // ========== GESTION DES IMAGES ADDITIONNELLES ==========
    if (files.nouveauChampImages) {
      imagePromises.push(
        (async () => {
          // Supprimer toutes les anciennes images additionnelles si demandé
          if (imagesToDelete.includes("pictures") && product.pictures?.length > 0) {
            const deletePromises = product.pictures.map((url) =>
              this.deleteImageFromCloudinary(url)
            );
            await Promise.all(deletePromises);
            updateData.pictures = [];
          }
          // Conserver les images existantes
          else if (product.pictures?.length > 0) {
            updateData.pictures = [...product.pictures];
          } else {
            updateData.pictures = [];
          }

          // Uploader les nouvelles images
          const uploadPromises = files.nouveauChampImages.map((file) =>
            this.uploadImage(file.path)
          );
          const uploadedUrls = await Promise.all(uploadPromises);
          
          updateData.pictures = [...updateData.pictures, ...uploadedUrls];
        })()
      );
    }
    // Supprimer les images additionnelles sans en ajouter de nouvelles
    else if (imagesToDelete.includes("pictures") && product.pictures?.length > 0) {
      imagePromises.push(
        (async () => {
          const deletePromises = product.pictures.map((url) =>
            this.deleteImageFromCloudinary(url)
          );
          await Promise.all(deletePromises);
          updateData.pictures = [];
        })()
      );
    }

    // Attendre que toutes les opérations d'images soient terminées
    await Promise.all(imagePromises);
  }
  // console.log({sellerOrAdmin});
  
  // ========== GESTION DU STATUT DE PUBLICATION ==========
  // Si un vendeur modifie un produit publié, le remettre en attente de validation
  if (sellerOrAdmin === "seller" && product.isPublished === "Published") {
    updateData.isPublished = "Attente";
    updateData.isValidated = false;
    updateData.comments = "En attente de validation après modification";
  }

  if (sellerOrAdmin === "seller" && product.isPublished === "Refuser") {
    updateData.isPublished = "Attente";
    updateData.isValidated = false;
    updateData.comments = "En attente de validation après modification";
  }

  // Si un admin modifie, le produit reste publié et validé
  if (sellerOrAdmin === "admin") {
    updateData.isPublished = "Published";
    updateData.isValidated = true;
    if (!updateData.comments) {
      updateData.comments = "Modifié par l'administrateur";
    }
  }

  // ========== NETTOYAGE DES FICHIERS TEMPORAIRES ==========
  if (files) {
    try {
      Object.values(files)
        .flat()
        .forEach((file) => {
          if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
    } catch (error) {
      console.error("Erreur lors du nettoyage des fichiers temporaires:", error);
      // Ne pas bloquer l'opération pour une erreur de nettoyage
    }
  }

  return { updateData, product };
}

  async uploadImage(fileOrPath) {
    let filePath;

    // Si c'est un objet file avec une propriété path
    if (typeof fileOrPath === 'object' && fileOrPath.path) {
      filePath = fileOrPath.path;
    }
    // Si c'est directement un chemin (string)
    else if (typeof fileOrPath === 'string') {
      filePath = fileOrPath;
    }
    // Si c'est un buffer ou autre format
    else {
      filePath = fileOrPath;
    }

    const result = await cloudinary.uploader.upload(filePath, {
      folder: "images",
    });
    return result.secure_url;
  }

  async deleteProductImages(product) {
    const imagesToDelete = [
      product.image1,
      product.image2,
      product.image3,
      ...(product.pictures || []),
      ...product.variants.map((v) => v.imageUrl),
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

/**
 * Récupère les informations d'abonnement d'un vendeur
 * @param {string} sellerId - ID du vendeur
 * @returns {Object} Informations sur l'abonnement et l'utilisation des produits
 */
async getSellerSubscriptionInfo(sellerId) {
  try {
    // Vérifier si le vendeur existe
    const seller = await SellerRequest.findById(sellerId);
    
    if (!seller) {
      throw new Error("Vendeur non trouvé");
    }

    // Récupérer l'abonnement actif
    const activeSubscription = await PricingPlan.findOne({
      storeId: sellerId,
      status: { $in: ['active', 'trial'] },
      endDate: { $gte: new Date() }
    }).sort({ createdAt: -1 });

    // Compter les produits actuels du vendeur
    const productCount = await Produit.countDocuments({
      createdBy: sellerId,
      isDeleted: false
    });

    // Si aucun abonnement actif
    if (!activeSubscription) {
      return {
        hasActiveSubscription: false,
        subscription: null,
        products: {
          current: productCount,
          limit: 0,
          remaining: 0
        },
        isValid: seller.isvalid
      };
    }

    // Calculer les informations sur les produits
    const productLimit = activeSubscription.productLimit;
    const remainingSlots = productLimit === -1 
      ? 'Illimité' 
      : Math.max(0, productLimit - productCount);

    return {
      hasActiveSubscription: true,
      subscription: {
        planType: activeSubscription.planType,
        status: activeSubscription.status,
        startDate: activeSubscription.startDate,
        endDate: activeSubscription.endDate,
        isExpired: new Date() > new Date(activeSubscription.endDate)
      },
      products: {
        current: productCount,
        limit: productLimit,
        remaining: remainingSlots,
        percentageUsed: productLimit === -1 
          ? 0 
          : Math.round((productCount / productLimit) * 100)
      },
      isValid: seller.isvalid
    };

  } catch (error) {
    console.error("Erreur lors de la récupération des infos d'abonnement:", error);
    throw error;
  }
}


}

module.exports = new ProductService();