const {
  Categorie,
  TypeProduit,
  Produit,
  ProductComment,
  Commande,
  ProductPub,
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

const createProduct = async (req, res) => {
  const data = req.body;

  let pictures = [];

  if (req.files) {
    if (req.files.image1) {
      const result1 = await cloudinary.uploader.upload(
        req.files.image1[0].path,
        { folder: "images" }
      );
      const picture1 = result1.secure_url;
      pictures.push(picture1);
    }

    if (req.files.image2) {
      const result2 = await cloudinary.uploader.upload(
        req.files.image2[0].path,
        { folder: "images" }
      );
      const picture2 = result2.secure_url;
      pictures.push(picture2);
    }

    if (req.files.image3) {
      const result3 = await cloudinary.uploader.upload(
        req.files.image3[0].path,
        { folder: "images" }
      );
      const picture3 = result3.secure_url;
      pictures.push(picture3);
    }
  }

  if (req.files.nouveauChampImages) {
    for (const file of req.files.nouveauChampImages) {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: "images",
      });
      const picture = result.secure_url;
      pictures.push(picture);
    }
  }

  const product = new Produit({
    name: data.name,
    quantite: data.quantite,
    prixPromo: data.prixPromo,
    prix: data.prix,
    prixf: data.prixF ? data.prixF : 0,
    description: data.description,
    taille: data.taille,
    couleur: data.couleur,
    marque: data.marque,
    ClefType: data.ClefType,
    Clefournisseur: data.Clefournisseur,
    image1: pictures[0],
    image2: pictures[1],
    image3: pictures[2],
    pictures: pictures.slice(3) || [], // Suppression les trois premières images qui appartiennent aux champs existants
    prixLivraison: data.prixLivraison || 0,
  });

  await product
    .save()
    .then((param) => {
      const message = `Vous venez de créer le produit ${data.name}`;
      return res.json({ message: message, data: param });
    })
    .catch((error) => {
      const message =
        "Une erreur s'est produite lors de la création du produit";
      return res.status(500).json({ message: message, data: error });
    });
};

const updateProduct = async (req, res) => {
  const productId = req.params.productId;
  const data = req.body;

  // Vérifier si des fichiers ont été téléchargés
  if (req.files) {
    // Supprimer les anciennes images du produit
    const product = await Produit.findById(productId);
    if (product) {
      if (product.image1 && req.files.image1) {
        const publicId = `images/${
          product.image1.split("/").pop().split(".")[0]
        }`;
        await cloudinary.uploader.destroy(publicId);
      }
      if (product.image2 && req.files.image2) {
        const publicId = `images/${
          product.image2.split("/").pop().split(".")[0]
        }`;
        await cloudinary.uploader.destroy(publicId);
      }
      if (product.image3 && req.files.image3) {
        const publicId = `images/${
          product.image3.split("/").pop().split(".")[0]
        }`;
        await cloudinary.uploader.destroy(publicId);
      }
    }

    // Mettre à jour les nouvelles images
    const updateData = {
      name: data.name,
      quantite: data.quantite,
      prixPromo: data.prixPromo,
      prix: data.prix,
      prixf: data.prixF ? data.prixF : 0,
      description: data.description,
      taille: data.taille,
      couleur: data.couleur,
      marque: data.marque,
      ClefType: data.ClefType,
      Clefournisseur: data.Clefournisseur,
      prixLivraison: data.prixLivraison || 0,
    };

    if (req.files.image1) {
      const result1 = await cloudinary.uploader.upload(
        req.files.image1[0].path,
        { folder: "images" }
      );
      const picture1 = result1.secure_url;
      updateData.image1 = picture1;
    }

    if (req.files.image2) {
      const result2 = await cloudinary.uploader.upload(
        req.files.image2[0].path,
        { folder: "images" }
      );
      const picture2 = result2.secure_url;
      updateData.image2 = picture2;
    }

    if (req.files.image3) {
      const result3 = await cloudinary.uploader.upload(
        req.files.image3[0].path,
        { folder: "images" }
      );
      const picture3 = result3.secure_url;
      updateData.image3 = picture3;
    }

    // Gérer les nouvelles images du champ "nouveauChampImages"
    if (
      req.files.nouveauChampImages &&
      req.files.nouveauChampImages.length !== 0
    ) {
      // const product = await Produit.findById(productId);
      if (product && product.pictures) {
        // Supprimer les anciennes images de Cloudinary et de la base de données
        for (const imageUrl of product.pictures) {
          const publicId = `images/${imageUrl.split("/").pop().split(".")[0]}`;
          await cloudinary.uploader.destroy(publicId);
        }
      }

      const newPictures = [];
      for (const imageFile of req.files.nouveauChampImages) {
        const result = await cloudinary.uploader.upload(imageFile.path, {
          folder: "images",
        });
        newPictures.push(result.secure_url);
      }
      updateData.pictures = newPictures;
    }

    await Produit.findByIdAndUpdate(productId, updateData);

    return res.json({ message: "Produit mis à jour avec succès" });
  } else {
    // Si aucun fichier n'a été téléchargé, mettre à jour les données du produit sans modifier les images
    await Produit.findByIdAndUpdate(productId, {
      name: data.name,
      quantite: data.quantite,
      prixPromo: data.prixPromo,
      prix: data.prix,
      prixf: data.prixF ? data.prixF : 0,
      description: data.description,
      taille: data.taille,
      couleur: data.couleur,
      marque: data.marque,
      ClefType: data.ClefType,
      Clefournisseur: data.Clefournisseur,
      prixLivraison: data.prixLivraison || 0,
    });

    return res.json({ message: "Produit mis à jour avec succès" });
  }
};

const deleteProduct = async (req, res) => {
  const productId = req.params.productId;

  // Récupérer les informations du produit à supprimer
  const product = await Produit.findById(productId);

  if (!product) {
    return res.status(404).json({ message: "Produit introuvable" });
  }

  // Supprimer les images du produit de Cloudinary
  if (product.image1) {
    const publicId = `images/${product.image1.split("/").pop().split(".")[0]}`;
    await cloudinary.uploader.destroy(publicId);
  }
  if (product.image2) {
    const publicId = `images/${product.image2.split("/").pop().split(".")[0]}`;
    await cloudinary.uploader.destroy(publicId);
  }
  if (product.image3) {
    const publicId = `images/${product.image3.split("/").pop().split(".")[0]}`;
    await cloudinary.uploader.destroy(publicId);
  }

  // Supprimer les images du champ "nouveauChampImages" de Cloudinary
  if (product.pictures.length > 0) {
    for (const image of product.pictures) {
      const publicId = `images/${image.split("/").pop().split(".")[0]}`;
      await cloudinary.uploader.destroy(publicId);
    }
  }

  // Supprimer le produit de la base de données
  await Produit.findByIdAndRemove(productId);

  return res.json({ message: "Produit supprimé avec succès" });
};

const getProductById = async (req, res) => {
  const productId = req.params.productId;

  try {
    const product = await Produit.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Produit introuvable" });
    }

    return res.json({ data: product });
  } catch (error) {
    return res.status(500).json({
      message: "Erreur lors de la recherche du produit",
      error: error,
    });
  }
};

const getAllProducts = async (req, res) => {
  try {
    const products = await Produit.find();

    if (products.length > 0) return res.json({ data: products });
    else {
      const message = "aucun produits pour le momant .";
      return res.status(404).json({ message: message });
    }
  } catch (error) {
    return res.status(500).json({
      message: "Erreur lors de la récupération des produits",
      error: error,
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
  console.log(id)
  const { nouvelEtat } = req.body;

  // Vérification que le nouvel état est valide
  const etatsValides = ["traitement", "reçu par le livreur", "en cours de livraison"];
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

    res.status(200).json({ message: "Commande mise à jour avec succès.", commande: resultat });
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la commande :", error);
    res.status(500).json({ message: "Erreur serveur lors de la mise à jour de la commande." });
  }
};

module.exports = {
  createCategorie,
  getAllCategories,
  supCategorie,
  createProductType,
  getAllType,
  suppType,
  createProduct,
  updateProduct,
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
  updateEtatTraitementCommande
};
