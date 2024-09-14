const { SellerRequest } = require("./Models");
const cloudinary = require("cloudinary").v2;
const jwt = require("jsonwebtoken");
const privateKeSeller = require("./auth/clefSeller");
const bcrypt = require("bcrypt");

cloudinary.config({
  cloud_name: "dkfddtykk",
  api_key: "577594384978177",
  api_secret: "kGQ99p3O0iFASZZHEmFelHPVt0I",
});

const createSeller = async (req, res) => {
  try {
    const data = req.body;
    const region = data.region; // Ajoutez ceci pour récupérer la région depuis le corps de la requête
    const ville = data.ville; // Ajoutez ceci pour récupérer la ville depuis le corps de la requête
    const storeName = data.storeName; // Ajoutez ceci pour récupérer le nom du magasin depuis le corps de la requête
    const slug = data.slug; // Ajoutez ceci pour récupérer le slug depuis le corps de la requête
    const category = data.categorie; // Ajoutez ceci pour récupérer la catégorie depuis le corps de la requête

    let picture = null;
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "images",
      });
      picture = result.secure_url;
    }

    const existingSeller = await SellerRequest.findOne({
      email: data.email,
    });

    if (existingSeller) {
      return res
        .status(400)
        .json({ message: "Cette adresse e-mail est déjà utilisée." });
    }

    const hash = await bcrypt.hash(data.password, 10);

    const store = new SellerRequest({
      email: data.email,
      name: data.name,
      password: hash,
      phone: data.phone,
      region: region,
      ville: ville,
      storeName: storeName,
      slug: slug,
      identity: picture,
      categorie: category,
    });

    await store.save();
    const message = `Vous venez d'effectuer une demande de création de Seller : ${data.name}`;
    return res.json({ message: message });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
      // Gestion de l'erreur d'unicité de l'e-mail
      return res
        .status(400)
        .json({ message: "Cette adresse e-mail est déjà utilisée." });
    }

    if (error.name === "ValidationError") {
      // Gérer les erreurs de validation du modèle
      return res.status(400).json({
        message: "Données de demande de vendeur non valides.",
        error: error,
      });
    }
    // Gestion d'autres erreurs
    return res.status(500).json({
      message: "Erreur lors de la création du vendeur",
      error: error.message,
    });
  }
};

const deleteSeller = async (req, res) => {
  try {
    const sellerId = req.params.id;

    const seller = await SellerRequest.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller non trouvé." });
    }

    const publicId = `images/${seller.identity.split("/").pop().split(".")[0]}`;
    await cloudinary.uploader.destroy(publicId); // Supprimer l'image de Cloudinary

    const deletedSeller = await SellerRequest.findByIdAndDelete(sellerId);
    if (deletedSeller) {
      return res.status(200).json({ message: "Seller supprimé avec succès." });
    } else {
      return res.status(404).json({ message: "Seller non trouvé." });
    }
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

async function validerDemandeVendeur(req, res) {
  const requestId = req.params.id; // Supposons que l'ID de la demande est passé en tant que paramètre d'URL

  try {
    // Recherchez la demande de vendeur par ID
    const demande = await SellerRequest.findById(requestId);

    if (!demande) {
      // Si la demande n'existe pas, renvoyez une réponse d'erreur
      return res
        .status(404)
        .json({ message: "Demande de vendeur introuvable." });
    }
    let message = "";
    if (demande.isvalid === true) {
      demande.isvalid = false;
      message = "Compte de vendeur deactiver avec succès.";
    } else {
      demande.isvalid = true;
      message = "Demande de vendeur validée avec succès. compte creer";
    }
    // Marquez la demande comme validée (isvalid à true)

    // Sauvegardez la demande mise à jour dans la base de données
    await demande.save();

    // Renvoyez une réponse de succès
    return res.status(200).json({ message: message });
  } catch (error) {
    // Gérez les erreurs ici, par exemple, en renvoyant une réponse d'erreur
    return res.status(500).json({
      message: `Erreur lors de la validation de la demande de vendeur : ${error.message}`,
    });
  }
}

const login = async (req, res) => {
  const data = req.body;

  try {
    // Recherche de l'utilisateur par e-mail ou numéro de téléphone
    let user = await SellerRequest.findOne({ email: data.email });
    if (!user && data.phoneNumber) {
      user = await SellerRequest.findOne({ phone: data.phoneNumber });
    }
    if (!user) {
      const message =
        "Cet e-mail ou numéro de téléphone n'est pas enregistré !";
      return res.status(400).json({ message });
    }

    // Vérification du mot de passe
    const isValidPassword = await bcrypt.compare(data.password, user.password);

    if (!isValidPassword) {
      const message = "Mot de passe incorrect !";
      return res.status(400).json({ message });
    }

    // Si tout est correct, générer le token JWT et gérer la réponse
    const token = jwt.sign({ userId: user._id }, privateKeSeller, {
      expiresIn: "20d",
    });

    const message = "Connexion réussie !";
    return res.json({
      message,
      token,
      id: user._id,
      name: user.name,
      isvalid: user.isvalid,
    });
  } catch (error) {
    const message =
      "Désolé, la connexion n'a pas pu être établie. Veuillez réessayer !";
    res.status(500).json({ message, error: error.message });
  }
};

const getSeller = (req, res) => {
  const Id = req.params.Id;
  console.log(Id);
  SellerRequest.findById(Id)
    .then((response) => {
      const message = `vous avez demander le Sellers :${response.name}`;
      if (!response) {
        return res.status(400).json(`le Seller demander n'existe pas!`);
      } else {
        return res.json({ message: message, data: response });
      }
    })
    .catch((error) => {
      const message =
        "une erreur s'est produit lors de la recuperation du Seller veuillez ressayer !";
      return res.status(500).json({ message: message, error: error });
    });
};

const getSellers = (req, res) => {
  // const Id = req.params.Id;
  // console.log(Id);
  SellerRequest.find()
    .then((response) => {
      const message = `vous avez demander tous les Sellers.`;
      if (!response) {
        return res.status(400).json(`auccun Seller n'existe pour le moment!`);
      } else {
        return res.json({ message: message, data: response });
      }
    })
    .catch((error) => {
      const message =
        "une erreur s'est produit lors de la recuperation du Seller veuillez ressayer !";
      return res.status(500).json({ message: message, error: error });
    });
};

const verifyToken = async (req, res) => {
  const data = req.headers;
  const id = req.params.id;
  const message = "reusit!";
  user = await SellerRequest.findById(id);

  res.json({ data, message, isvalid: user.isvalid });
  // console.log(data.authorization);
};

const setImage = async (req, res) => {
  const id = req.params.id;
  try {
    const document = await SellerRequest.findById(id).exec(); // Exécute la requête pour obtenir le document
    console.log(req.file);
    if (
      document &&
      document.image !==
        "https://chagona.onrender.com/images/image-1688253105925-0.jpeg"
    ) {
      let picture = null;
      if (req.file) {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: "images", // Le nom du dossier dans lequel vous souhaitez stocker les images
        });
        picture = result.secure_url;

        // Supprimer l'ancienne image du profil
        if (document && document.image) {
          const publicId = `images/${
            document.image.split("/").pop().split(".")[0]
          }`;
          await cloudinary.uploader.destroy(publicId);
        }
        document.image = picture;
        await document.save();
        return res.json("Opération effectuée avec succès.");
      } else {
        return res
          .status(400)
          .json({ message: "vous n'avez pas fournit d'image" });
      }
    } else {
      if (req.file) {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: "images", // Le nom du dossier dans lequel vous souhaitez stocker les images
        });
        picture = result.secure_url;

        document.image = picture;
        await document.save();
        return res.json("Opération effectuée avec succès.");
      } else {
        return res
          .status(400)
          .json({ message: "vous n'avez pas fournit d'image" });
      }
    }
  } catch (error) {
    const message = `Erreur lors de la mise à jour de l'image : ${error.message}`;
    return res.status(500).json({ message: message, data: error });
  }
};

const findSellerByName = async (req, res) => {
  try {
    const name = req.params.name;

    const seller = await SellerRequest.find({
      name: { $regex: new RegExp(name, "i") },
    });

    if (!seller) {
      return res.status(404).json({ message: "seller non trouvé." });
    }
    if (seller.length === 0) {
      return res
        .status(404)
        .json({ message: "Auccun seller trouvé avec ce nom la." });
    }

    return res.json({ data: seller });
  } catch (error) {
    return res.status(500).json({
      message: "Erreur lors de la recherche du seller",
      error: error.message,
    });
  }
};

module.exports = {
  createSeller,
  deleteSeller,
  validerDemandeVendeur,
  login,
  verifyToken,
  getSeller,
  setImage,
  getSellers,
  findSellerByName,
};
