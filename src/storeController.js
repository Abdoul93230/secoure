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
    const {
      email,
      emailp,
      name,
      userName2,
      phone,
      storeName,
      storeDescription,
      category,
      storeType,
      region,
      city,
      address,
      postalCode,
      businessPhone,
      whatsapp,
      facebook,
      instagram,
      website,
      openingHours,
      minimumOrder,
      password,
    } = req.body;

    // Validation des champs requis
    const requiredFields = {
      email: "L'email est requis",
      name: "Le nom est requis",
      userName2: "Le prénom est requis",
      phone: "Le numéro de téléphone est requis",
      storeName: "Le nom de la boutique est requis",
      storeDescription: "La description de la boutique est requise",
      category: "La catégorie est requise",
      storeType: "Le type de boutique est requis",
      region: "La région est requise",
      city: "La ville est requise",
      address: "L'adresse est requise",
      businessPhone: "Le téléphone professionnel est requis",
      password: "Le mot de passe est requis",
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([field]) => !req.body[field])
      .map(([field, message]) => ({ field, message }));

    if (missingFields.length > 0) {
      return res.status(400).json({
        status: "error",
        code: "MISSING_FIELDS",
        errors: missingFields,
      });
    }

    // Validations de format
    const validations = [
      {
        test: () => /^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(email),
        field: "email",
        message: "Format d'email invalide",
      },
      {
        test: () => name.length >= 3,
        field: "name",
        message: "Le nom doit contenir au moins 3 caractères",
      },
      {
        test: () => userName2.length >= 2,
        field: "userName2",
        message: "Le prénom doit contenir au moins 2 caractères",
      },
      {
        test: () => /^[0-9]{8,15}$/.test(phone),
        field: "phone",
        message: "Format de numéro de téléphone invalide",
      },
      {
        test: () => storeDescription.length >= 20,
        field: "storeDescription",
        message: "La description doit contenir au moins 20 caractères",
      },
      {
        test: () =>
          [
            "mode",
            "electronique",
            "maison",
            "beaute",
            "sports",
            "artisanat",
            "bijoux",
            "alimentation",
            "livres",
            "services",
          ].includes(category),
        field: "category",
        message: "Catégorie invalide",
      },
      {
        test: () => ["physique", "enligne", "hybride"].includes(storeType),
        field: "storeType",
        message: "Type de boutique invalide",
      },
      {
        test: () => password.length >= 8,
        field: "password",
        message: "Le mot de passe doit contenir au moins 8 caractères",
      },
    ];

    const validationErrors = validations
      .filter((validation) => !validation.test())
      .map(({ field, message }) => ({ field, message }));

    if (validationErrors.length > 0) {
      return res.status(400).json({
        status: "error",
        code: "VALIDATION_ERROR",
        errors: validationErrors,
      });
    }

    // Validation des URLs optionnelles
    const urlFields = { website, facebook, instagram };
    const urlValidationErrors = Object.entries(urlFields)
      .filter(
        ([_, value]) => value && !/^https?:\/\/[^\s/$.?#].[^\s]*$/.test(value)
      )
      .map(([field]) => ({
        field,
        message: `L'URL ${field} n'est pas valide`,
      }));

    if (urlValidationErrors.length > 0) {
      return res.status(400).json({
        status: "error",
        code: "INVALID_URL",
        errors: urlValidationErrors,
      });
    }

    // Vérification si le vendeur existe déjà
    const existingSeller = await SellerRequest.findOne({
      $or: [{ email }, { storeName }, { phone }],
    });

    if (existingSeller) {
      return res.status(409).json({
        status: "error",
        code: "DUPLICATE_ENTRY",
        error: {
          field:
            existingSeller.email === email
              ? "email"
              : existingSeller.phone === phone
              ? "phone"
              : "storeName",
          message:
            existingSeller.email === email
              ? "Cette adresse e-mail est déjà utilisée"
              : existingSeller.phone === phone
              ? "Ce numero de telephone est déjà utilisée"
              : "Ce nom de boutique est déjà utilisé",
        },
      });
    }

    // Validation des fichiers requis
    if (!req.files?.ownerIdentity) {
      return res.status(400).json({
        status: "error",
        code: "MISSING_FILES",
        error: {
          field: "ownerIdentity",
          message: "La pièce d'identité est requise",
        },
      });
    }

    // 1. Ajouter une validation de taille maximale pour les fichiers
    if (req.files.ownerIdentity[0].size > 5 * 1024 * 1024) {
      // 5MB max
      return res.status(400).json({
        status: "error",
        code: "FILE_TOO_LARGE",
        error: {
          field: "ownerIdentity",
          message: "Le fichier de la carte ne doit pas dépasser 5MB",
        },
      });
    }

    // 2. Ajouter le nettoyage des fichiers temporaires
    const cleanupFiles = () => {
      if (req.files.ownerIdentity)
        fs.unlinkSync(req.files.ownerIdentity[0].path);
      if (req.files.logo) fs.unlinkSync(req.files.logo[0].path);
    };

    // Validation du type de fichier pour ownerIdentity et logo
    const allowedMimeTypes = ["image/jpeg", "image/png", "application/pdf"];

    if (
      req.files.ownerIdentity &&
      !allowedMimeTypes.includes(req.files.ownerIdentity[0].mimetype)
    ) {
      return res.status(400).json({
        status: "error",
        code: "INVALID_FILE_TYPE",
        error: {
          field: "ownerIdentity",
          message:
            "Le format du fichier n'est pas accepté. Utilisez JPG, PNG ou PDF",
        },
      });
    }

    if (
      req.files.logo &&
      !["image/jpeg", "image/png"].includes(req.files.logo[0].mimetype)
    ) {
      return res.status(400).json({
        status: "error",
        code: "INVALID_FILE_TYPE",
        error: {
          field: "logo",
          message: "Le logo doit être au format JPG ou PNG",
        },
      });
    }

    // Gestion des uploads
    let ownerIdentityUrl = null;
    let logoUrl = null;

    try {
      if (req.files.ownerIdentity) {
        const ownerIdentityResult = await cloudinary.uploader.upload(
          req.files.ownerIdentity[0].path,
          { folder: "seller-documents" }
        );
        ownerIdentityUrl = ownerIdentityResult.secure_url;
      }

      if (req.files.logo) {
        const logoResult = await cloudinary.uploader.upload(
          req.files.logo[0].path,
          { folder: "seller-logos" }
        );
        logoUrl = logoResult.secure_url;
      }
    } catch (uploadError) {
      return res.status(500).json({
        status: "error",
        code: "UPLOAD_ERROR",
        message: "Erreur lors de l'upload des fichiers",
        error:
          process.env.NODE_ENV === "development"
            ? uploadError.message
            : undefined,
      });
    }

    // Hashage du mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Création du nouveau vendeur
    const newSeller = new SellerRequest({
      email,
      emailp: emailp?.length !== 0 ? emailp : null,
      name,
      userName2,
      phone,
      password: hashedPassword,
      storeName,
      storeDescription,
      category,
      storeType,
      region,
      city,
      address,
      postalCode,
      businessPhone,
      whatsapp,
      facebook,
      instagram,
      website,
      openingHours,
      minimumOrder,
      ownerIdentity: ownerIdentityUrl,
      logo: logoUrl,
    });

    await newSeller.save();

    return res.status(201).json({
      status: "success",
      message:
        "Votre demande de création de boutique a été enregistrée avec succès",
      data: {
        email: newSeller.email,
        storeName: newSeller.storeName,
        requestId: newSeller._id,
      },
    });
  } catch (error) {
    console.error("Erreur création vendeur:", error);

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({
        status: "error",
        code: "DUPLICATE_KEY",
        error: {
          field,
          message: `Ce ${field} existe déjà dans notre système`,
        },
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        status: "error",
        code: "MONGOOSE_VALIDATION",
        errors: Object.values(error.errors).map((err) => ({
          field: err.path,
          message: err.message,
        })),
      });
    }

    return res.status(500).json({
      status: "error",
      code: "SERVER_ERROR",
      message: "Erreur lors de la création du compte",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
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
