const { default: mongoose } = require("mongoose");
const {
  Categorie,
  TypeProduit,
  Produit,
  ProductComment,
  Commande,
  ProductPub,
  Zone,
  Transporteur,
  Like,
} = require("./Models");
const fs = require("fs");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: "dkfddtykk",
  api_key: "577594384978177",
  api_secret: "kGQ99p3O0iFASZZHEmFelHPVt0I",
});

const createCategorie = async (req, res) => {
  const name = req.body.name.toLowerCase();

  Categorie.findOne({ name: name })
    .then(async (cat) => {
      if (cat) {
        return res.status(400).json(`La catégorie : ${name} existe déjà !`);
      } else {
        if (req.file) {
          const result = await cloudinary.uploader.upload(req.file.path, {
            folder: "images", // Le nom du dossier dans lequel vous souhaitez stocker les images
          });

          const picture = result.secure_url;

          const categorie = new Categorie({
            name: name,
            image: picture,
          });

          await categorie
            .save()
            .then((ca) => {
              return res.json({
                message: `Vous venez de créer la catégorie : ${name}`,
                data: ca,
              });
            })
            .catch((error) => {
              return res.status(500).json({
                message: "Erreur lors de la sauvegarde de la catégorie",
                error: error,
              });
            });
        } else {
          return res.status(500).json("Vous n'avez pas fourni d'image");
        }
      }
    })
    .catch((error) => {
      return res.status(500).json({
        message: "Erreur lors de la recherche de la catégorie",
        error: error,
      });
    });
};

const getAllCategories = (req, res) => {
  Categorie.find()
    .then((categories) => {
      if (categories) {
        return res.json({
          message: "vous avez demander tous les categories.",
          data: categories,
        });
      } else {
        return res
          .status(404)
          .json("il n'existe aucune categorie pour le moment");
      }
    })
    .catch((error) => {
      const message = "erreur lord de la recuperation des donnes !";
      return res.json({ message: message, data: error });
    });
};

const supCategorie = async (req, res) => {
  const id = req.body.id;

  try {
    const cat = await Categorie.findById(id);
    if (!cat) {
      return res.status(404).json({ message: "Catégorie introuvable" });
    }

    const publicId = `images/${cat.image.split("/").pop().split(".")[0]}`;
    await cloudinary.uploader.destroy(publicId); // Supprimer l'image de Cloudinary

    await Categorie.deleteOne({ _id: id }); // Supprimer la catégorie de la base de données

    const message = `Vous venez de supprimer la catégorie : ${cat.name}`;
    return res.json({ message: message, data: cat });
  } catch (error) {
    return res.status(500).json({
      message: "Erreur lors de la suppression de la catégorie",
      error: error,
    });
  }
};

const updateCategorie = async (req, res) => {
  try {
    const categorieId = req.params.id;
    const data = req.body;

    let picture = null;
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "images", // Le nom du dossier dans lequel vous souhaitez stocker les images
      });
      picture = result.secure_url;
    }

    const existingCategorie = await Categorie.findOne({ _id: categorieId });
    if (!existingCategorie) {
      return res.status(404).json({ message: "Catégorie non trouvée." });
    }

    existingCategorie.name = data.name;

    if (picture) {
      // Supprimer l'ancienne image de Cloudinary si elle existe
      if (existingCategorie.image) {
        const publicId = `images/${
          existingCategorie.image.split("/").pop().split(".")[0]
        }`;

        await cloudinary.uploader.destroy(publicId);
      }
      existingCategorie.image = picture;
    }

    await existingCategorie.save();

    const message = `La catégorie ${existingCategorie.name} a été mise à jour.`;
    return res.json({ message: message });
  } catch (error) {
    return res.status(500).json({
      message: "Erreur lors de la mise à jour de la catégorie",
      error: error.message,
    });
  }
};

const createProductType = (req, res) => {
  const data = req.body;

  Categorie.findOne({ name: data.nameCate })
    .then(async (param) => {
      if (param) {
        const type = new TypeProduit({
          clefCategories: param._id,
          name: data.name,
        });
        await type
          .save()
          .then(() => {
            const message = `vous venez de creer le type : ${data.name}`;
            return res.json({ message: message });
          })
          .catch((error) => {
            const message = "erreur lord de la creation de du type";
            return { message: message, data: error };
          });
      } else {
        return res.json("la categorie selectionner n'existe pas.");
      }
    })
    .catch((error) => {
      const message = "erreur lord de la creation de du type";
      return { message: message, data: error };
    });
};

const getAllType = (req, res) => {
  TypeProduit.find()
    .then((param) => {
      if (param) {
        return res.json({ data: param });
      } else {
        return res.json([]);
      }
    })
    .catch((error) => {
      const message = "erreur lord de la recuperation des types";
      return { message: message, data: error };
    });
};
const getAllTypeBySeller = async (req, res) => {
  const { seller } = req.params;

  try {
    // Récupérer les produits du vendeur
    const productsSeller = await Produit.find({ Clefournisseur: seller });

    // Extraire les clés de type uniques
    const uniqueTypeKeys = [
      ...new Set(productsSeller.map((product) => product.ClefType)),
    ];

    // Vérifier si des types sont trouvés
    if (uniqueTypeKeys.length === 0) {
      return res.json({ data: [] });
    }

    // Récupérer les types associés
    const types = await TypeProduit.find({ _id: { $in: uniqueTypeKeys } });

    // Vérifier si des types sont trouvés
    if (!types || types.length === 0) {
      return res.json({ data: [] });
    }

    return res.json({ data: types });
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des types pour le vendeur :",
      error
    );
    return res.status(500).json({
      message: "Erreur lors de la récupération des types. Veuillez réessayer.",
      data: error,
    });
  }
};

const suppType = (req, res) => {
  id = req.body.id;
  TypeProduit.findById(id)
    .then((param) => {
      if (param) {
        TypeProduit.deleteOne({ _id: id }).then(() => {
          const message = `vous venez de supprimer le type : ${param.name}`;
          return res.json({ message: message });
        });
      }
    })
    .catch((error) => {
      const message = "erreur lord de la supression du type";
      return { message: message, data: error };
    });
};

// const createProduct = async (req, res) => {
//   const data = req.body;

//   let pictures = [];

//   if (req.files) {
//     if (req.files.image1) {
//       const result1 = await cloudinary.uploader.upload(
//         req.files.image1[0].path,
//         { folder: "images" }
//       );
//       const picture1 = result1.secure_url;
//       pictures.push(picture1);
//     }

//     if (req.files.image2) {
//       const result2 = await cloudinary.uploader.upload(
//         req.files.image2[0].path,
//         { folder: "images" }
//       );
//       const picture2 = result2.secure_url;
//       pictures.push(picture2);
//     }

//     if (req.files.image3) {
//       const result3 = await cloudinary.uploader.upload(
//         req.files.image3[0].path,
//         { folder: "images" }
//       );
//       const picture3 = result3.secure_url;
//       pictures.push(picture3);
//     }
//   }

//   if (req.files.nouveauChampImages) {
//     for (const file of req.files.nouveauChampImages) {
//       const result = await cloudinary.uploader.upload(file.path, {
//         folder: "images",
//       });
//       const picture = result.secure_url;
//       pictures.push(picture);
//     }
//   }

//   const product = new Produit({
//     name: data.name,
//     quantite: data.quantite,
//     prixPromo: data.prixPromo,
//     prix: data.prix,
//     prixf: data.prixF ? data.prixF : 0,
//     description: data.description,
//     taille: data.taille,
//     couleur: data.couleur,
//     marque: data.marque,
//     ClefType: data.ClefType,
//     Clefournisseur: data.Clefournisseur,
//     image1: pictures[0],
//     image2: pictures[1],
//     image3: pictures[2],
//     pictures: pictures.slice(3) || [], // Suppression les trois premières images qui appartiennent aux champs existants
//     prixLivraison: data.prixLivraison || 0,
//   });

//   await product
//     .save()
//     .then((param) => {
//       const message = `Vous venez de créer le produit ${data.name}`;
//       return res.json({ message: message, data: param });
//     })
//     .catch((error) => {
//       const message =
//         "Une erreur s'est produite lors de la création du produit";
//       return res.status(500).json({ message: message, data: error });
//     });
// };

// const updateProduct = async (req, res) => {
//   const productId = req.params.productId;
//   const data = req.body;

//   // Vérifier si des fichiers ont été téléchargés
//   if (req.files) {
//     // Supprimer les anciennes images du produit
//     const product = await Produit.findById(productId);
//     if (product) {
//       if (product.image1 && req.files.image1) {
//         const publicId = `images/${
//           product.image1.split("/").pop().split(".")[0]
//         }`;
//         await cloudinary.uploader.destroy(publicId);
//       }
//       if (product.image2 && req.files.image2) {
//         const publicId = `images/${
//           product.image2.split("/").pop().split(".")[0]
//         }`;
//         await cloudinary.uploader.destroy(publicId);
//       }
//       if (product.image3 && req.files.image3) {
//         const publicId = `images/${
//           product.image3.split("/").pop().split(".")[0]
//         }`;
//         await cloudinary.uploader.destroy(publicId);
//       }
//     }

//     // Mettre à jour les nouvelles images
//     const updateData = {
//       name: data.name,
//       quantite: data.quantite,
//       prixPromo: data.prixPromo,
//       prix: data.prix,
//       prixf: data.prixF ? data.prixF : 0,
//       description: data.description,
//       taille: data.taille,
//       couleur: data.couleur,
//       marque: data.marque,
//       ClefType: data.ClefType,
//       Clefournisseur: data.Clefournisseur,
//       prixLivraison: data.prixLivraison || 0,
//     };

// if (req.files.image1) {
//   const result1 = await cloudinary.uploader.upload(
//     req.files.image1[0].path,
//     { folder: "images" }
//   );
//   const picture1 = result1.secure_url;
//   updateData.image1 = picture1;
// }

//     if (req.files.image2) {
//       const result2 = await cloudinary.uploader.upload(
//         req.files.image2[0].path,
//         { folder: "images" }
//       );
//       const picture2 = result2.secure_url;
//       updateData.image2 = picture2;
//     }

//     if (req.files.image3) {
//       const result3 = await cloudinary.uploader.upload(
//         req.files.image3[0].path,
//         { folder: "images" }
//       );
//       const picture3 = result3.secure_url;
//       updateData.image3 = picture3;
//     }

//     // Gérer les nouvelles images du champ "nouveauChampImages"
//     if (
//       req.files.nouveauChampImages &&
//       req.files.nouveauChampImages.length !== 0
//     ) {
//       // const product = await Produit.findById(productId);
//       if (product && product.pictures) {
//         // Supprimer les anciennes images de Cloudinary et de la base de données
//         for (const imageUrl of product.pictures) {
//           const publicId = `images/${imageUrl.split("/").pop().split(".")[0]}`;
//           await cloudinary.uploader.destroy(publicId);
//         }
//       }

//       const newPictures = [];
//       for (const imageFile of req.files.nouveauChampImages) {
//         const result = await cloudinary.uploader.upload(imageFile.path, {
//           folder: "images",
//         });
//         newPictures.push(result.secure_url);
//       }
//       updateData.pictures = newPictures;
//     }

//     await Produit.findByIdAndUpdate(productId, updateData);

//     return res.json({ message: "Produit mis à jour avec succès" });
//   } else {
//     // Si aucun fichier n'a été téléchargé, mettre à jour les données du produit sans modifier les images
//     await Produit.findByIdAndUpdate(productId, {
//       name: data.name,
//       quantite: data.quantite,
//       prixPromo: data.prixPromo,
//       prix: data.prix,
//       prixf: data.prixF ? data.prixF : 0,
//       description: data.description,
//       taille: data.taille,
//       couleur: data.couleur,
//       marque: data.marque,
//       ClefType: data.ClefType,
//       Clefournisseur: data.Clefournisseur,
//       prixLivraison: data.prixLivraison || 0,
//     });

//     return res.json({ message: "Produit mis à jour avec succès" });
//   }
// };

// const deleteProduct = async (req, res) => {
//   const productId = req.params.productId;

//   // Récupérer les informations du produit à supprimer
//   const product = await Produit.findById(productId);

//   if (!product) {
//     return res.status(404).json({ message: "Produit introuvable" });
//   }

//   // Supprimer les images du produit de Cloudinary
//   if (product.image1) {
//     const publicId = `images/${product.image1.split("/").pop().split(".")[0]}`;
//     await cloudinary.uploader.destroy(publicId);
//   }
//   if (product.image2) {
//     const publicId = `images/${product.image2.split("/").pop().split(".")[0]}`;
//     await cloudinary.uploader.destroy(publicId);
//   }
//   if (product.image3) {
//     const publicId = `images/${product.image3.split("/").pop().split(".")[0]}`;
//     await cloudinary.uploader.destroy(publicId);
//   }

//   // Supprimer les images du champ "nouveauChampImages" de Cloudinary
//   if (product.pictures.length > 0) {
//     for (const image of product.pictures) {
//       const publicId = `images/${image.split("/").pop().split(".")[0]}`;
//       await cloudinary.uploader.destroy(publicId);
//     }
//   }

//   // Supprimer le produit de la base de données
//   await Produit.findByIdAndRemove(productId);

//   return res.json({ message: "Produit supprimé avec succès" });
// };

// const getProductById = async (req, res) => {
//   const productId = req.params.productId;

//   try {
//     const product = await Produit.findById(productId);

//     if (!product) {
//       return res.status(404).json({ message: "Produit introuvable" });
//     }

//     return res.json({ data: product });
//   } catch (error) {
//     return res.status(500).json({
//       message: "Erreur lors de la recherche du produit",
//       error: error,
//     });
//   }
// };

// const getAllProducts = async (req, res) => {
//   try {
//     const products = await Produit.find();

//     if (products.length > 0) return res.json({ data: products });
//     else {
//       const message = "aucun produits pour le momant .";
//       return res.status(404).json({ message: message });
//     }
//   } catch (error) {
//     return res.status(500).json({
//       message: "Erreur lors de la récupération des produits",
//       error: error,
//     });
//   }
// };
const createProduct = async (req, res) => {
  try {
    const data = req.body;
    const sellerOrAdmin = req.body.sellerOrAdmin;
    const sellerOrAdmin_id = req.body.sellerOrAdmin_id;
    // console.log(JSON.parse(data.shippingZones));

    // Préparer les données initiales pour le produit
    let productData = {
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
      // Si c'est un admin, le produit est publié directement, sinon il attend validation
      isPublished: sellerOrAdmin === "admin" ? "Published" : "Attente",
    };

    // Si c'est un admin qui crée le produit, on le marque comme validé
    if (sellerOrAdmin === "admin") {
      productData.isValidated = true;
      productData.validatedBy = sellerOrAdmin_id;

      productData.comments = "Validation automatique (créé par admin)";
    }

    // Fonction pour télécharger l'image sur Cloudinary
    const uploadImage = async (imagePath) => {
      const result = await cloudinary.uploader.upload(imagePath, {
        folder: "images",
      });
      return result.secure_url;
    };

    // Gestion des variantes avec téléchargement d'images
    if (data.variants) {
      const variants = JSON.parse(data.variants);

      for (const [index, variant] of variants.entries()) {
        let imageUrl = variant.imageUrl;

        // Si une image pour la variante est envoyée dans req.files
        if (req.files && req.files[variant.colorName]) {
          // Télécharger la nouvelle image
          imageUrl = await uploadImage(req.files[variant.colorName][0].path);
        }
        // Si une image pour la variante est envoyée dans req.files
        if (req.files && req.files[`imageVariante${index}`]) {
          // Upload de la nouvelle image

          imageUrl = await uploadImage(
            req.files[`imageVariante${index}`][0].path
          );
          // imageUrl = result.secure_url;
        }

        // Ajouter la variante dans productData
        productData.variants.push({
          color: variant.colorName,
          colorCode: variant.color,
          sizes: variant.sizes,
          imageUrl: imageUrl,
          stock: variant.stock || 1,
        });
      }
    }

    if (!req.files) {
      return res
        .status(400)
        .json({ message: "Aucune image du produit n'a été envoyée." });
    }

    if (!req.files.image1) {
      return res.status(400).json({
        message: "La première image du produit est obligatoire",
        error: error.message,
      });
    }

    // Gestion des images principales et additionnelles
    if (req.files) {
      // Image principale 1
      if (req.files.image1) {
        productData.image1 = await uploadImage(req.files.image1[0].path);
      }

      // Image principale 2
      if (req.files.image2) {
        productData.image2 = await uploadImage(req.files.image2[0].path);
      }

      // Image principale 3
      if (req.files.image3) {
        productData.image3 = await uploadImage(req.files.image3[0].path);
      }

      // Gestion des nouveaux champs d'images (nouveauChampImages)
      if (req.files.nouveauChampImages) {
        const newPictures = [];
        for (const file of req.files.nouveauChampImages) {
          newPictures.push(await uploadImage(file.path));
        }
        productData.pictures = newPictures;
      }
    }

    // Créer un nouveau produit dans la base de données
    const product = new Produit(productData);

    // Sauvegarder le produit
    const savedProduct = await product.save();
    return res.json({
      message: `Le produit ${data.name} a été ${
        sellerOrAdmin === "admin"
          ? "créé et publié"
          : "créé et en attente de validation"
      } avec succès`,
      data: savedProduct,
    });
    // return res.json({
    //   message: `Le produit ${data.name} a été créé avec succès`,
    //   data: savedProduct,
    // });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "Une erreur s'est produite lors de la création du produit",
      error: error.message,
    });
  }
};
const updateProduct2 = async (req, res) => {
  const sellerOrAdmin = req.body.sellerOrAdmin;
  const sellerOrAdmin_id = req.body.sellerOrAdmin_id;
  try {
    const productId = req.params.productId;
    const data = req.body;

    // Validation de base
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "ID de produit invalide" });
    }

    const product = await Produit.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Produit introuvable" });
    }

    // Vérifier que le produit n'est pas supprimé
    if (product.isDeleted && sellerOrAdmin !== "admin") {
      return res
        .status(400)
        .json({ message: "Impossible de modifier un produit supprimé" });
    }
    // Vérifier que l'utilisateur est autorisé à modifier le produit
    const isAuthorized =
      sellerOrAdmin === "admin" ||
      (product.createdBy &&
        product.createdBy.toString() === sellerOrAdmin_id.toString());

    if (!isAuthorized) {
      return res
        .status(403)
        .json({ message: "Vous n'êtes pas autorisé à modifier ce produit" });
    }

    // Récupérer les IDs des variantes supprimées
    const deletedVariantIds = Array.isArray(data.deletedVariantIds)
      ? data.deletedVariantIds
      : JSON.parse(data.deletedVariantIds || "[]");

    // Récupérer les images à supprimer (sans remplacement)
    const imagesToDelete = Array.isArray(data.imagesToDelete)
      ? data.imagesToDelete
      : JSON.parse(data.imagesToDelete || "[]");
    console.log({ imagesToDelete });

    // Données de mise à jour de base
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
      // Mise à jour des informations d'expédition
      "shipping.weight": data.weight,
      "shipping.dimensions": {
        length: data.length || 0,
        width: data.width || 0,
        height: data.height || 0,
      },
    };

    if (data.shippingZones) {
      try {
        updateData["shipping.zones"] =
          typeof data.shippingZones === "string"
            ? JSON.parse(data.shippingZones)
            : data.shippingZones;
      } catch (error) {
        console.error("Erreur lors du parsing des zones d'expédition:", error);
      }
    }

    // Fonction pour supprimer une image de Cloudinary avec gestion d'erreurs
    const deleteImageFromCloudinary = async (url) => {
      try {
        if (!url || !url.includes("/")) return;

        const urlParts = url.split("/");
        const filenameWithExt = urlParts.pop();
        if (!filenameWithExt) return;

        const publicId = filenameWithExt.split(".")[0]; // Récupérer le `public_id` de l'URL
        const folderPath = urlParts.slice(urlParts.indexOf("images")).join("/");

        await cloudinary.uploader.destroy(`${folderPath}/${publicId}`);
      } catch (error) {
        console.error(
          `Erreur lors de la suppression de l'image ${url}:`,
          error
        );
      }
    };

    // Gestion des suppressions d'images principales
    const imageDeletePromises = [];

    // if (imagesToDelete.includes("image1") && product.image1) {
    //   imageDeletePromises.push(deleteImageFromCloudinary(product.image1));
    //   updateData.image1 = ""; // Effacer l'URL de l'image
    // }

    if (imagesToDelete.includes("image2") && product.image2) {
      imageDeletePromises.push(deleteImageFromCloudinary(product.image2));
      updateData.image2 = ""; // Effacer l'URL de l'image
    }

    if (imagesToDelete.includes("image3") && product.image3) {
      imageDeletePromises.push(deleteImageFromCloudinary(product.image3));
      updateData.image3 = ""; // Effacer l'URL de l'image
    }

    // Attendre que toutes les suppressions d'images soient terminées
    await Promise.all(imageDeletePromises);

    // Gestion des variantes
    if (data.variants) {
      try {
        const variants =
          typeof data.variants === "string"
            ? JSON.parse(data.variants)
            : data.variants;

        updateData.variants = [];

        // Créer un tableau de promesses pour la suppression des images des variantes supprimées
        const deletePromises = deletedVariantIds.map((variantId) => {
          const variantToDelete = product.variants.find(
            (v) => v._id.toString() === variantId
          );
          if (variantToDelete?.imageUrl) {
            return deleteImageFromCloudinary(variantToDelete.imageUrl);
          }
          return Promise.resolve();
        });

        // Attendre que toutes les suppressions soient terminées
        await Promise.all(deletePromises);

        // Filtrer les variantes à conserver
        product.variants = product.variants.filter(
          (v) => !deletedVariantIds.includes(v._id.toString())
        );

        // Traiter les nouvelles variantes ou celles à mettre à jour
        const variantPromises = variants.map(async (variant, index) => {
          let imageUrl = variant.imageUrl;

          // Vérifier si cette variante a une image à supprimer
          if (variant.deleteImage && imageUrl) {
            await deleteImageFromCloudinary(imageUrl);
            imageUrl = ""; // Effacer l'URL de l'image
          }
          // Si une image pour la variante est envoyée dans req.files
          else if (req.files && req.files[`imageVariante${index}`]) {
            // Supprimer l'ancienne image si elle existe
            if (variant.imageUrl) {
              await deleteImageFromCloudinary(variant.imageUrl);
            }

            // Upload de la nouvelle image
            const result = await cloudinary.uploader.upload(
              req.files[`imageVariante${index}`][0].path,
              { folder: "images" }
            );
            imageUrl = result.secure_url;
          }

          // Retourner la variante mise à jour
          return {
            _id: variant._id, // Préserver l'ID existant si disponible
            color: variant.colorName,
            colorCode: variant.color,
            sizes: variant.sizes,
            imageUrl: imageUrl,
            stock: variant.stock || 1,
          };
        });

        // Attendre que toutes les promesses soient résolues
        updateData.variants = await Promise.all(variantPromises);
      } catch (error) {
        console.error("Erreur lors du traitement des variantes:", error);
        return res.status(400).json({
          message: "Format de variantes invalide",
          error: error.message,
        });
      }
    }

    // Gestion des images principales et additionnelles
    if (req.files) {
      const imagePromises = [];

      // Fonction pour gérer l'upload d'une image
      const handleImageUpload = async (fileField, oldImageUrl) => {
        if (req.files[fileField]) {
          // Ne pas supprimer l'ancienne image si elle a déjà été supprimée dans l'étape précédente
          if (oldImageUrl && !imagesToDelete.includes(fileField)) {
            await deleteImageFromCloudinary(oldImageUrl);
          }

          const result = await cloudinary.uploader.upload(
            req.files[fileField][0].path,
            { folder: "images" }
          );

          return result.secure_url;
        }
        return undefined;
      };

      // Traiter les images principales en parallèle (seulement si elles ne sont pas dans imagesToDelete)
      if (req.files.image1 && !imagesToDelete.includes("image1")) {
        imagePromises.push(
          handleImageUpload("image1", product.image1).then((url) => {
            if (url) updateData.image1 = url;
          })
        );
      }

      if (req.files.image2 && !imagesToDelete.includes("image2")) {
        imagePromises.push(
          handleImageUpload("image2", product.image2).then((url) => {
            if (url) updateData.image2 = url;
          })
        );
      }

      if (req.files.image3 && !imagesToDelete.includes("image3")) {
        imagePromises.push(
          handleImageUpload("image3", product.image3).then((url) => {
            if (url) updateData.image3 = url;
          })
        );
      }

      // Gestion des images additionnelles
      if (req.files.nouveauChampImages) {
        imagePromises.push(
          (async () => {
            // Supprimer d'abord les anciennes images si demandé
            if (
              imagesToDelete.includes("pictures") &&
              product.pictures &&
              product.pictures.length > 0
            ) {
              const deletePromises = product.pictures.map((url) =>
                deleteImageFromCloudinary(url)
              );
              await Promise.all(deletePromises);
              updateData.pictures = []; // Reinitialiser les images
            }
            // Sinon, si on a des images existantes et qu'on ne veut pas les supprimer
            else if (product.pictures && product.pictures.length > 0) {
              // On conserve les anciennes images et ajoute les nouvelles
              updateData.pictures = [...product.pictures];
            } else {
              updateData.pictures = [];
            }

            // Uploader les nouvelles images en parallèle
            const uploadPromises = req.files.nouveauChampImages.map((file) =>
              cloudinary.uploader.upload(file.path, { folder: "images" })
            );

            const results = await Promise.all(uploadPromises);
            // Ajouter les nouvelles images aux images existantes (ou à un tableau vide si tout a été supprimé)
            updateData.pictures = [
              ...updateData.pictures,
              ...results.map((result) => result.secure_url),
            ];
          })()
        );
      }
      // Si on veut juste supprimer toutes les images additionnelles sans en ajouter de nouvelles
      else if (
        imagesToDelete.includes("pictures") &&
        product.pictures &&
        product.pictures.length > 0
      ) {
        imagePromises.push(
          (async () => {
            const deletePromises = product.pictures.map((url) =>
              deleteImageFromCloudinary(url)
            );
            await Promise.all(deletePromises);
            updateData.pictures = []; // Reinitialiser les images
          })()
        );
      }

      // Attendre que toutes les opérations d'images soient terminées
      await Promise.all(imagePromises);
    }

    if (sellerOrAdmin === "seller" && product.isPublished === "Published") {
      updateData.isPublished = "Attente";
      updateData.isValidated = false;
      updateData.comments = "En attente de validation après modification";
    }

    // Mise à jour dans la base de données
    const updatedProduct = await Produit.findByIdAndUpdate(
      productId,
      updateData,
      { new: true, runValidators: true }
    );

    // Nettoyer les fichiers temporaires après upload
    if (req.files) {
      Object.values(req.files)
        .flat()
        .forEach((file) => {
          if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
    }

    return res.json({
      message: "Produit mis à jour avec succès",
      data: updatedProduct,
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du produit:", error);

    // Nettoyer les fichiers temporaires en cas d'erreur
    if (req.files) {
      Object.values(req.files)
        .flat()
        .forEach((file) => {
          if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
    }

    return res.status(500).json({
      message: "Erreur lors de la mise à jour du produit",
      error: error.message,
    });
  }
};

const validateProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const { isValidated, comments, published } = req.body;
    const sellerOrAdmin = req.body.sellerOrAdmin;
    const sellerOrAdmin_id = req.body.sellerOrAdmin_id;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "ID de produit invalide" });
    }

    // Vérifier que l'utilisateur est bien un admin
    if (sellerOrAdmin !== "admin") {
      return res.status(403).json({
        message: "Vous n'avez pas les droits pour valider un produit",
      });
    }

    const product = await Produit.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Produit introuvable" });
    }

    if (product.isDeleted) {
      return res
        .status(400)
        .json({ message: "Impossible de valider un produit supprimé" });
    }

    // Mettre à jour le statut de validation et de publication
    const updateData = {
      isValidated: isValidated,
      validatedBy: sellerOrAdmin_id,
      comments: comments || "",
      isPublished: published, // On publie le produit uniquement s'il est validé
    };

    const updatedProduct = await Produit.findByIdAndUpdate(
      productId,
      { $set: updateData },
      { new: true }
    );

    return res.json({
      message:
        published === "Published"
          ? "Le produit a été validé et publié avec succès"
          : "Le produit a été refusé",
      data: updatedProduct,
    });
  } catch (error) {
    console.error("Erreur lors de la validation du produit:", error);
    return res.status(500).json({
      message: "Une erreur s'est produite lors de la validation du produit",
      error: error.message,
    });
  }
};

const deleteProductAttribut = async (req, res) => {
  const sellerOrAdmin = req.body.sellerOrAdmin;
  const sellerOrAdmin_id = req.body.sellerOrAdmin_id;
  try {
    const { productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "ID de produit invalide" });
    }

    const product = await Produit.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Produit introuvable" });
    }

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

    // Suppression logique
    const updatedProduct = await Produit.findByIdAndUpdate(
      productId,
      { $set: { isDeleted: true } },
      { new: true }
    );

    return res.json({
      message: "Le produit a été supprimé avec succès",
      data: updatedProduct,
    });
  } catch (error) {
    console.error("Erreur lors de la suppression du produit:", error);
    return res.status(500).json({
      message: "Une erreur s'est produite lors de la suppression du produit",
      error: error.message,
    });
  }
};

// Pour restaurer un produit supprimé (uniquement pour les admins)
const restoreProduct = async (req, res) => {
  const sellerOrAdmin = req.body.sellerOrAdmin;
  try {
    const { productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "ID de produit invalide" });
    }

    // Vérifier que l'utilisateur est un admin
    if (sellerOrAdmin !== "admin") {
      return res.status(403).json({
        message: "Seuls les administrateurs peuvent restaurer un produit",
      });
    }

    const product = await Produit.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Produit introuvable" });
    }

    if (!product.isDeleted) {
      return res.status(400).json({ message: "Ce produit n'est pas supprimé" });
    }

    // Restauration du produit
    const updatedProduct = await Produit.findByIdAndUpdate(
      productId,
      { $set: { isDeleted: false } },
      { new: true }
    );

    return res.json({
      message: "Le produit a été restauré avec succès",
      data: updatedProduct,
    });
  } catch (error) {
    console.error("Erreur lors de la restauration du produit:", error);
    return res.status(500).json({
      message: "Une erreur s'est produite lors de la restauration du produit",
      error: error.message,
    });
  }
};

// Pour tous les utilisateurs (publics)
const getPublishedProducts = async (req, res) => {
  try {
    const products = await Produit.find({
      isPublished: true,
      isDeleted: false,
    });

    return res.json({ data: products });
  } catch (error) {
    return res.status(500).json({
      message: "Une erreur s'est produite lors de la récupération des produits",
      error: error.message,
    });
  }
};

// Pour les admins (tous les produits)
const getAllProductsForAdmin = async (req, res) => {
  const { sellerOrAdmin } = req.query;

  try {
    // Vérifier que l'utilisateur est un admin
    if (sellerOrAdmin !== "admin") {
      return res.status(403).json({ message: "Accès non autorisé" });
    }

    const products = await Produit.find();

    return res.json({ data: products });
  } catch (error) {
    return res.status(500).json({
      message: "Une erreur s'est produite lors de la récupération des produits",
      error: error.message,
    });
  }
};

// Pour les vendeurs (leurs propres produits)
const getSellerProducts = async (req, res) => {
  const { sellerOrAdmin_id } = req.query;
  try {
    const products = await Produit.find({
      createdBy: sellerOrAdmin_id,
      // On n'exclut pas les produits supprimés pour permettre au vendeur de voir ses produits supprimés
    });

    return res.json({ data: products });
  } catch (error) {
    return res.status(500).json({
      message: "Une erreur s'est produite lors de la récupération des produits",
      error: error.message,
    });
  }
};

// Pour les admins (produits en attente de validation)
const getPendingProducts = async (req, res) => {
  const { sellerOrAdmin } = req.query;
  try {
    // Vérifier que l'utilisateur est un admin
    if (sellerOrAdmin !== "admin") {
      return res.status(403).json({ message: "Accès non autorisé" });
    }

    const products = await Produit.find({
      isPublished: "Attente",
      isDeleted: false,
      isValidated: false,
    });

    return res.json(products);
  } catch (error) {
    return res.status(500).json({
      message: "Une erreur s'est produite lors de la récupération des produits",
      error: error.message,
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const productId = req.params.productId;
    const data = req.body;
    const product = await Produit.findById(productId);

    // Récupérer les IDs des variantes supprimées
    const deletedVariantIds = JSON.parse(data.deletedVariantIds || "[]");

    if (!product) {
      return res.status(404).json({ message: "Produit introuvable" });
    }

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
      // Mise à jour des informations d'expédition
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

    // Fonction pour supprimer une image de Cloudinary
    const deleteImageFromCloudinary = async (url) => {
      if (!url) return;
      const publicId = url.split("/").pop().split(".")[0]; // Récupérer le `public_id` de l'URL
      await cloudinary.uploader.destroy(`images/${publicId}`); // Suppression
    };

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
          await deleteImageFromCloudinary(variantToDelete.imageUrl);
        }
      }

      // Filtrer les variantes à conserver
      product.variants = product.variants.filter(
        (v) => !deletedVariantIds.includes(v._id.toString())
      );

      for (const [index, variant] of variants.entries()) {
        let imageUrl = variant.imageUrl;

        // Si une image pour la variante est envoyée dans req.files
        if (req.files && req.files[`imageVariante${index}`]) {
          // Supprimer l'ancienne image si elle existe
          if (variant.imageUrl) {
            await deleteImageFromCloudinary(variant.imageUrl);
          }

          // Upload de la nouvelle image
          const result = await cloudinary.uploader.upload(
            req.files[`imageVariante${index}`][0].path,
            { folder: "images" }
          );
          imageUrl = result.secure_url;
        }

        // Ajouter la variante mise à jour dans updateData.variants
        updateData.variants.push({
          color: variant.colorName,
          colorCode: variant.color,
          sizes: variant.sizes,
          imageUrl: imageUrl,
          stock: variant.stock || 1,
        });
      }
    }

    // Gestion des images principales et additionnelles
    if (req.files) {
      // Mettre à jour l'image principale 1
      if (req.files.image1) {
        await deleteImageFromCloudinary(product.image1);
        const result1 = await cloudinary.uploader.upload(
          req.files.image1[0].path,
          { folder: "images" }
        );
        updateData.image1 = result1.secure_url;
      }

      // Mettre à jour l'image principale 2
      if (req.files.image2) {
        await deleteImageFromCloudinary(product.image2);
        const result2 = await cloudinary.uploader.upload(
          req.files.image2[0].path,
          { folder: "images" }
        );
        updateData.image2 = result2.secure_url;
      }

      // Mettre à jour l'image principale 3
      if (req.files.image3) {
        await deleteImageFromCloudinary(product.image3);
        const result3 = await cloudinary.uploader.upload(
          req.files.image3[0].path,
          { folder: "images" }
        );
        updateData.image3 = result3.secure_url;
      }

      // Gestion des nouveaux champs d'images (nouveauChampImages)
      if (req.files.nouveauChampImages) {
        const newPictures = [];
        for (const file of req.files.nouveauChampImages) {
          newPictures.push(
            (await cloudinary.uploader.upload(file.path, { folder: "images" }))
              .secure_url
          );
        }

        if (product.pictures && product.pictures.length > 0) {
          // Supprimer les anciennes images du produit
          for (const oldUrl of product.pictures) {
            await deleteImageFromCloudinary(oldUrl);
          }
        }

        updateData.pictures = newPictures;
      }
    }

    // Mise à jour dans la base de données
    const updatedProduct = await Produit.findByIdAndUpdate(
      productId,
      updateData,
      { new: true }
    );

    return res.json({
      message: "Produit mis à jour avec succès",
      data: updatedProduct,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "Erreur lors de la mise à jour du produit",
      error: error.message,
    });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.productId;
    const product = await Produit.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Produit introuvable" });
    }

    // Suppression des images de Cloudinary
    const imagesToDelete = [
      product.image1,
      product.image2,
      product.image3,
      ...product.pictures,
      ...product.variants.map((v) => v.imageUrl),
    ].filter(Boolean);

    for (const imageUrl of imagesToDelete) {
      const publicId = `images/${imageUrl.split("/").pop().split(".")[0]}`;
      await cloudinary.uploader.destroy(publicId);
    }

    await Produit.findByIdAndRemove(productId);
    return res.json({ message: "Produit supprimé avec succès" });
  } catch (error) {
    return res.status(500).json({
      message: "Erreur lors de la suppression du produit",
      error: error.message,
    });
  }
};

const getProductById = async (req, res) => {
  try {
    const product = await Produit.findById(req.params.productId);
    if (!product) {
      return res.status(404).json({ message: "Produit introuvable" });
    }
    return res.json({ data: product });
  } catch (error) {
    return res.status(500).json({
      message: "Erreur lors de la recherche du produit",
      error: error.message,
    });
  }
};

const getAllProducts = async (req, res) => {
  try {
    const products = await Produit.find();
    if (products.length === 0) {
      return res.status(404).json({ message: "Aucun produit pour le moment." });
    }
    return res.json({ data: products });
  } catch (error) {
    return res.status(500).json({
      message: "Erreur lors de la récupération des produits",
      error: error.message,
    });
  }
};

const searchProductByType = async (req, res) => {
  const type = req.params.type;

  try {
    const products = await Produit.find({ ClefType: type });

    if (products.length === 0) {
      return res
        .status(404)
        .json({ message: "Aucun produit trouvé pour ce type" });
    }

    return res.json({ products });
  } catch (error) {
    console.error(
      "Une erreur s'est produite lors de la recherche des produits par type",
      error
    );
    return res.status(500).json({
      message:
        "Une erreur s'est produite lors de la recherche des produits par type",
    });
  }
};

const searchProductByTypeBySeller = async (req, res) => {
  const { type, seller } = req.params;

  try {
    const products = await Produit.find({
      ClefType: type,
      Clefournisseur: seller,
      isDeleted: false,
    });

    if (products.length === 0) {
      return res
        .status(404)
        .json({ message: "Aucun produit trouvé pour ce type" });
    }

    return res.json({ products });
  } catch (error) {
    console.error(
      "Une erreur s'est produite lors de la recherche des produits par type",
      error
    );
    return res.status(500).json({
      message:
        "Une erreur s'est produite lors de la recherche des produits par type",
    });
  }
};

const searchProductByCategory = async (req, res) => {
  const category = req.params.category;

  try {
    const products = await Produit.find({ category: category });

    if (products.length === 0) {
      return res
        .status(404)
        .json({ message: "Aucun produit trouvé pour cette catégorie" });
    }

    return res.json({ products });
  } catch (error) {
    console.error(
      "Une erreur s'est produite lors de la recherche des produits par catégorie",
      error
    );
    return res.status(500).json({
      message:
        "Une erreur s'est produite lors de la recherche des produits par catégorie",
    });
  }
};

const searchProductByName = async (req, res) => {
  const name = req.params.name;

  try {
    const products = await Produit.find({
      name: { $regex: name, $options: "i" },
    });

    if (products.length === 0) {
      return res
        .status(404)
        .json({ message: "Aucun produit trouvé pour ce nom" });
    }

    return res.json({ products });
  } catch (error) {
    console.error(
      "Une erreur s'est produite lors de la recherche des produits par nom",
      error
    );
    return res.status(500).json({
      message:
        "Une erreur s'est produite lors de la recherche des produits par nom",
    });
  }
};
const searchProductByNameBySeller = async (req, res) => {
  const { name, seller } = req.params;

  try {
    const products = await Produit.find({
      name: { $regex: name, $options: "i" },
      Clefournisseur: seller,
      isDeleted: false,
    });

    if (products.length === 0) {
      return res
        .status(404)
        .json({ message: "Aucun produit trouvé pour ce nom" });
    }

    return res.json({ products });
  } catch (error) {
    console.error(
      "Une erreur s'est produite lors de la recherche des produits par nom",
      error
    );
    return res.status(500).json({
      message:
        "Une erreur s'est produite lors de la recherche des produits par nom",
    });
  }
};

const createCommenteProduit = async (req, res) => {
  const { description, clefProduct, clefType, etoil, userName } = req.body;

  try {
    const comment = new ProductComment({
      description,
      clefProduct,
      clefType,
      etoil,
      userName,
    });

    await comment.save();
    const message = "Commentaire envoyé.";
    return res.json({ message });
  } catch (error) {
    return res.status(500).json({
      message: "Erreur lors de la création du commentaire.",
      data: error,
    });
  }
};

const getAllCommenteProduit = async (req, res) => {
  try {
    const comments = await ProductComment.find();
    return res.json(comments);
  } catch (error) {
    return res.status(500).json({
      message: "Erreur lors de la récupération des commentaires.",
      data: error,
    });
  }
};
const getAllCommenteProduitById = async (req, res) => {
  const clefProduct = req.params.id;

  try {
    const comments = await ProductComment.find({
      clefProduct: clefProduct,
    });
    return res.json(comments);
  } catch (error) {
    return res.status(500).json({
      message: "Erreur lors de la récupération des commentaires.",
      data: error,
    });
  }
};

function getMarqueClusters(req, res) {
  Produit.aggregate(
    [
      {
        $group: {
          _id: "$marque",
          produits: { $addToSet: "$name" },
        },
      },
    ],
    (err, clusters) => {
      if (err) {
        console.error("Une erreur s'est produite :", err);
        return res.status(500).json({
          error:
            "Une erreur s'est produite lors de la récupération des clusters de marques.",
        });
      } else {
        const formattedClusters = clusters.map((cluster) => ({
          marque: cluster._id,
          produits: cluster.produits,
        }));

        res.json({ clusters: formattedClusters });
      }
    }
  );
}

function getCouleurClusters(req, res) {
  Produit.aggregate(
    [
      {
        $unwind: "$couleur",
      },
      {
        $group: {
          _id: "$couleur",
          produits: { $addToSet: "$name" },
        },
      },
    ],
    (err, clusters) => {
      if (err) {
        console.error("Une erreur s'est produite :", err);
        return res.status(500).json({
          error:
            "Une erreur s'est produite lors de la récupération des clusters de couleurs.",
        });
      } else {
        const formattedClusters = clusters.map((cluster) => ({
          couleur: cluster._id,
          produits: cluster.produits,
        }));

        res.json({ clusters: formattedClusters });
      }
    }
  );
}

const productPubget = async (req, res) => {
  try {
    const productPubs = await ProductPub.find();
    res.json(productPubs);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Erreur lors de la récupération des produits publics." });
  }
};

const productPubCreate = async (req, res) => {
  // const image = req.body.image;
  const clefCategorie = req.body.clefCategorie;
  try {
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "images", // Le nom du dossier dans lequel vous souhaitez stocker les images
      });
      const picture = result.secure_url;

      const newProductPub = new ProductPub({
        image: picture,
        clefCategorie: clefCategorie,
      });
      const savedProductPub = await newProductPub.save();
      res.json(savedProductPub);
      return;
    } else {
      const message = "Auccune image pour la pub na ete passer!";
      return res.status(500).json({ message: message });
    }
  } catch (error) {
    res
      .status(400)
      .json({ error: "Erreur lors de la création de lapublicite." });
  }
};

const productPubDelete = async (req, res) => {
  const id = req.params.id;
  try {
    const deletedProductPub = await ProductPub.findById(id);
    if (deletedProductPub && deletedProductPub.image) {
      const publicId = `images/${
        deletedProductPub.image.split("/").pop().split(".")[0]
      }`;

      // Suppression de l'image dans Cloudinary
      await cloudinary.uploader.destroy(publicId);

      // Suppression du produit de la base de données
      const deletedProduct = await ProductPub.findByIdAndDelete(id);

      res.json({
        message: "Publication supprimée avec succès",
        data: deletedProduct,
      });
    } else {
      res
        .status(404)
        .json({ error: "Produit non trouvé ou aucune image à supprimer" });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Fonction pour mettre à jour l'état de traitement d'une commande
const updateEtatTraitementCommande = async (req, res) => {
  const { id } = req.params;
  console.log(id);
  const { nouvelEtat } = req.body;

  // Vérification que le nouvel état est valide
  const etatsValides = [
    "traitement",
    "reçu par le livreur",
    "en cours de livraison",
  ];
  if (!etatsValides.includes(nouvelEtat)) {
    return res.status(400).json({ message: "État de traitement non valide." });
  }

  try {
    // Mise à jour de la commande
    const resultat = await Commande.findByIdAndUpdate(
      id,
      { etatTraitement: nouvelEtat },
      { new: true }
    );

    if (!resultat) {
      return res.status(404).json({ message: "Commande non trouvée." });
    }

    res.status(200).json({
      message: "Commande mise à jour avec succès.",
      commande: resultat,
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la commande :", error);
    res.status(500).json({
      message: "Erreur serveur lors de la mise à jour de la commande.",
    });
  }
};

const deleteProductImages = async (productId) => {
  try {
    const product = await Produit.findById(productId);

    if (!product) {
      throw new Error("Produit introuvable");
    }

    // Vérifier si le produit contient des images dans le champ "pictures"
    if (product.pictures && product.pictures.length > 0) {
      for (const url of product.pictures) {
        const publicId = url.split("/").pop().split(".")[0]; // Extraire le public_id de l'URL
        await cloudinary.uploader.destroy(`images/${publicId}`); // Supprimer l'image de Cloudinary
      }
    }

    // Mettre à jour le champ "pictures" pour qu'il soit vide dans la base de données
    await Produit.findByIdAndUpdate(productId, { pictures: [] });

    return { message: "Toutes les images ont été supprimées avec succès." };
  } catch (error) {
    console.error(error.message);
    throw new Error("Erreur lors de la suppression des images.");
  }
};

// Contrôleurs pour les Zones
const createZone = async (req, res) => {
  try {
    const zone = new Zone(req.body);
    await zone.save();
    res.status(201).json(zone);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getAllZones = async (req, res) => {
  try {
    const zones = await Zone.find();
    res.status(200).json(zones);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateZone = async (req, res) => {
  try {
    const zone = await Zone.findOneAndUpdate(
      { zoneId: req.params.zoneId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!zone) return res.status(404).json({ message: "Zone non trouvée" });
    res.status(200).json(zone);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteZone = async (req, res) => {
  try {
    const zone = await Zone.findOneAndDelete({ zoneId: req.params.zoneId });
    if (!zone) return res.status(404).json({ message: "Zone non trouvée" });
    res.status(200).json({ message: "Zone supprimée" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Contrôleurs pour les Transporteurs
const createTransporteur = async (req, res) => {
  try {
    const transporteur = new Transporteur(req.body);
    await transporteur.save();
    res.status(201).json(transporteur);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getAllTransporteurs = async (req, res) => {
  try {
    const transporteurs = await Transporteur.find();
    res.status(200).json(transporteurs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateTransporteur = async (req, res) => {
  try {
    const transporteur = await Transporteur.findOneAndUpdate(
      { transporteurId: req.params.transporteurId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!transporteur)
      return res.status(404).json({ message: "Transporteur non trouvé" });
    res.status(200).json(transporteur);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteTransporteur = async (req, res) => {
  try {
    const transporteur = await Transporteur.findOneAndDelete({
      transporteurId: req.params.transporteurId,
    });
    if (!transporteur)
      return res.status(404).json({ message: "Transporteur non trouvé" });
    res.status(200).json({ message: "Transporteur supprimé" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Contrôleurs pour les Options d'Expédition
const addShippingOptionToProduit = async (req, res) => {
  try {
    const produit = await Produit.findById(req.params.produitId);
    if (!produit) {
      return res.status(404).json({ message: "Produit non trouvé" });
    }

    const shippingOption = req.body;
    produit.shippingOptions.push(shippingOption);
    await produit.save();

    res.status(201).json(produit);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateShippingOption = async (req, res) => {
  try {
    const produit = await Produit.findById(req.params.produitId);
    if (!produit) {
      return res.status(404).json({ message: "Produit non trouvé" });
    }

    const shippingOptionIndex = produit.shippingOptions.findIndex(
      (option) => option._id.toString() === req.params.shippingOptionId
    );

    if (shippingOptionIndex === -1) {
      return res
        .status(404)
        .json({ message: "Option d'expédition non trouvée" });
    }

    produit.shippingOptions[shippingOptionIndex] = {
      ...produit.shippingOptions[shippingOptionIndex],
      ...req.body,
    };

    await produit.save();
    res.status(200).json(produit);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteShippingOption = async (req, res) => {
  try {
    const produit = await Produit.findById(req.params.produitId);
    if (!produit) {
      return res.status(404).json({ message: "Produit non trouvé" });
    }

    produit.shippingOptions = produit.shippingOptions.filter(
      (option) => option._id.toString() !== req.params.shippingOptionId
    );

    await produit.save();
    res.status(200).json(produit);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Ajouter un like
const createLike = async (req, res) => {
  try {
    const { userId, produitId } = req.body;

    const like = new Like({
      user: userId,
      produit: produitId,
    });

    await like.save();
    res.status(201).json(like);
  } catch (error) {
    if (error.code === 11000) {
      // Erreur de duplicate (produit déjà liké)
      return res
        .status(400)
        .json({ message: "Ce produit est déjà dans vos favoris" });
    }
    res.status(500).json({ message: error.message });
  }
};

// Récupérer les likes d'un utilisateur
const getLikesByUser = async (req, res) => {
  try {
    const likes = await Like.find({ user: req.params.userId })
      .populate("produit")
      .sort("-createdAt");
    res.json(likes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Supprimer un like
const deleteLikeByUser = async (req, res) => {
  try {
    await Like.findOneAndDelete({
      user: req.params.userId,
      produit: req.params.produitId,
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Vérifier si un produit est liké par un utilisateur
const verifyLikByUser = async (req, res) => {
  try {
    const like = await Like.findOne({
      user: req.params.userId,
      produit: req.params.produitId,
    });
    res.json({ isLiked: !!like });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createCategorie,
  getAllCategories,
  supCategorie,
  createProductType,
  getAllType,
  getAllTypeBySeller,
  suppType,
  createProduct,
  updateProduct,
  updateProduct2,
  deleteProduct,
  getProductById,
  getAllProducts,
  searchProductByType,
  searchProductByName,
  searchProductByCategory,
  updateCategorie,
  createCommenteProduit,
  getAllCommenteProduit,
  getAllCommenteProduitById,
  getMarqueClusters,
  getCouleurClusters,
  productPubget,
  productPubCreate,
  productPubDelete,
  updateEtatTraitementCommande,
  deleteProductImages,
  createZone,
  getAllZones,
  updateZone,
  deleteZone,
  createTransporteur,
  getAllTransporteurs,
  updateTransporteur,
  deleteTransporteur,
  addShippingOptionToProduit,
  updateShippingOption,
  deleteShippingOption,
  createLike,
  getLikesByUser,
  deleteLikeByUser,
  verifyLikByUser,
  searchProductByTypeBySeller,
  searchProductByNameBySeller,
  deleteProductAttribut,
  getSellerProducts,
};
