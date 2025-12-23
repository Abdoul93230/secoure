const { SellerRequest, Commande, Produit } = require("./Models");
const { PricingPlan } = require("./Models");
const cloudinary = require("cloudinary").v2;
const jwt = require("jsonwebtoken");
const privateKeSeller = require("./auth/clefSeller");
const bcrypt = require("bcrypt");
const fs = require("fs");
const { default: mongoose } = require("mongoose");

cloudinary.config({
  cloud_name: "dkfddtykk",
  api_key: "577594384978177",
  api_secret: "kGQ99p3O0iFASZZHEmFelHPVt0I",
});

// Constantes pour les plans prédéfinis
const PLAN_DEFAULTS = {
  Starter: {
    price: {
      monthly: 2500,
      annual: 27000, // 2500 * 12 mois (moin 10% pour paiement annuel)
    },
    commission: 6,
    productLimit: 10,
    features: {
      productManagement: {
        maxProducts: 10,
        maxVariants: 3,
        maxCategories: 5,
        catalogImport: false,
      },
      paymentOptions: {
        manualPayment: true,
        mobileMoney: true,
        cardPayment: false,
        customPayment: false,
      },
      support: {
        responseTime: 48, // heures
        channels: ["email"],
        onboarding: "standard",
      },
      marketing: {
        marketplaceVisibility: "standard",
        maxActiveCoupons: 1,
        emailMarketing: false,
        abandonedCartRecovery: false,
      },
    },
  },
  Pro: {
    price: {
      monthly: 4500,
      annual: 48600, // 4500 * 12 mois (moin 10% pour paiement annuel)
    },
    commission: 3.5,
    productLimit: -1, // illimité
    features: {
      productManagement: {
        maxProducts: -1, // illimité
        maxVariants: 10,
        maxCategories: 20,
        catalogImport: true,
      },
      paymentOptions: {
        manualPayment: true,
        mobileMoney: true,
        cardPayment: true,
        customPayment: false,
      },
      support: {
        responseTime: 24, // heures
        channels: ["email", "chat"],
        onboarding: "personnalisé",
      },
      marketing: {
        marketplaceVisibility: "prioritaire",
        maxActiveCoupons: 5,
        emailMarketing: true,
        abandonedCartRecovery: false,
      },
    },
  },
  Business: {
    price: {
      monthly: 9000,
      annual: 97200, // 9000 * 12 mois (moin 10% pour paiement annuel)
    },
    commission: 2.5,
    productLimit: -1, // illimité
    features: {
      productManagement: {
        maxProducts: -1, // illimité
        maxVariants: -1, // illimité
        maxCategories: -1, // illimité
        catalogImport: true,
      },
      paymentOptions: {
        manualPayment: true,
        mobileMoney: true,
        cardPayment: true,
        customPayment: true,
      },
      support: {
        responseTime: 12, // heures
        channels: ["email", "chat", "phone", "vip"],
        onboarding: "VIP",
      },
      marketing: {
        marketplaceVisibility: "premium",
        maxActiveCoupons: -1, // illimité
        emailMarketing: true,
        abandonedCartRecovery: true,
      },
    },
  },
};

/**
 * Utilitaire pour supprimer une image de Cloudinary
 */
const deleteCloudinaryImage = async (imageUrl, folder) => {
  if (!imageUrl) return;

  try {
    const publicId = `${folder}/${imageUrl.split("/").pop().split(".")[0]}`;
    await cloudinary.uploader.destroy(publicId);
    return true;
  } catch (error) {
    console.error(
      `Erreur lors de la suppression de l'image dans ${folder}:`,
      error
    );
    return false;
  }
};

/**
 * Utilitaire pour uploader une image vers Cloudinary
 */
const uploadToCloudinary = async (filePath, folder) => {
  if (!filePath) return null;

  try {
    const result = await cloudinary.uploader.upload(filePath, { folder });
    return result.secure_url;
  } catch (error) {
    console.error(`Erreur lors de l'upload vers ${folder}:`, error);
    throw new Error(`Échec de l'upload de l'image: ${error.message}`);
  }
};

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
        test: () => /^\+[1-9]\d{7,14}$/.test(phone),
        field: "phone",
        message: "Format de numéro de téléphone international invalide (ex: +22787727501)",
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
      $or: [{ email }, { phone }, { storeName }],
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

    // 1. Ajout d'une validation de taille maximale pour les fichiers
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

    // 2. nettoyage des fichiers temporaires
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
    // console.log({ mess: "first", newSeller });

    // Création automatique du plan tarifaire
    const planType = req.body.planType || "Starter"; // Utiliser le plan spécifié ou Starter par défaut

    // Vérifier si le type de plan est valide
    if (!PLAN_DEFAULTS[planType]) {
      return res.status(400).json({
        status: "error",
        code: "INVALID_PLAN_TYPE",
        error: {
          message: "Type de plan invalide",
        },
      });
    }

    console.log(req.body);

    // Calculer la date de fin (pour le plan Starter, ajouter 3 mois gratuits)
    let endDate = new Date();
    if (planType === "Starter") {
      endDate.setMonth(endDate.getMonth() + 3); // 3 mois gratuits
    }
    // else {
    //   endDate.setMonth(endDate.getMonth() + 1); // 1 mois par défaut pour les autres plans
    // }

    // Créer le plan tarifaire
    const planDefaults = PLAN_DEFAULTS[planType];
    const newPlan = new PricingPlan({
      storeId: newSeller._id,
      planType,
      ...planDefaults,
      status: "active",
      startDate: new Date(),
      endDate: endDate,
    });

    await newPlan.save();

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

const updateSeller = async (req, res) => {
  try {
    const sellerId = req.params.id;

    // Vérifier si l'ID est valide
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({
        status: "error",
        code: "INVALID_ID",
        message: "L'identifiant du vendeur est invalide",
      });
    }

    // Récupérer le vendeur existant
    const existingSeller = await SellerRequest.findById(sellerId);

    if (!existingSeller) {
      return res.status(404).json({
        status: "error",
        code: "SELLER_NOT_FOUND",
        message: "Vendeur non trouvé",
      });
    }

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

    // Préparer l'objet de mise à jour
    const updateData = {};

    // Ajouter uniquement les champs qui sont présents dans la requête
    if (email !== undefined) updateData.email = email;
    if (emailp !== undefined)
      updateData.emailp = emailp?.length !== 0 ? emailp : null;
    if (name !== undefined) updateData.name = name;
    if (userName2 !== undefined) updateData.userName2 = userName2;
    if (phone !== undefined) updateData.phone = phone;
    if (storeName !== undefined) updateData.storeName = storeName;
    if (storeDescription !== undefined)
      updateData.storeDescription = storeDescription;
    if (category !== undefined) updateData.category = category;
    if (storeType !== undefined) updateData.storeType = storeType;
    if (region !== undefined) updateData.region = region;
    if (city !== undefined) updateData.city = city;
    if (address !== undefined) updateData.address = address;
    if (postalCode !== undefined) updateData.postalCode = postalCode;
    if (businessPhone !== undefined) updateData.businessPhone = businessPhone;
    if (whatsapp !== undefined) updateData.whatsapp = whatsapp;
    if (facebook !== undefined) updateData.facebook = facebook;
    if (instagram !== undefined) updateData.instagram = instagram;
    if (website !== undefined) updateData.website = website;
    if (openingHours !== undefined) updateData.openingHours = openingHours;
    if (minimumOrder !== undefined) updateData.minimumOrder = minimumOrder;

    // Validation des champs mis à jour
    const validations = [];

    if (email !== undefined) {
      validations.push({
        test: () => /^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(email),
        field: "email",
        message: "Format d'email invalide",
      });
    }

    if (name !== undefined) {
      validations.push({
        test: () => name.length >= 3,
        field: "name",
        message: "Le nom doit contenir au moins 3 caractères",
      });
    }

    if (userName2 !== undefined) {
      validations.push({
        test: () => userName2.length >= 2,
        field: "userName2",
        message: "Le prénom doit contenir au moins 2 caractères",
      });
    }

    if (phone !== undefined) {
  validations.push({
    test: () => /^\+[1-9]\d{7,14}$/.test(phone),
    field: "phone",
    message: "Format de numéro de téléphone international invalide (ex: +22787727501)",
  });
}


    if (storeDescription !== undefined) {
      validations.push({
        test: () => storeDescription.length >= 20,
        field: "storeDescription",
        message: "La description doit contenir au moins 20 caractères",
      });
    }

    if (category !== undefined) {
      validations.push({
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
      });
    }

    if (storeType !== undefined) {
      validations.push({
        test: () => ["physique", "enligne", "hybride"].includes(storeType),
        field: "storeType",
        message: "Type de boutique invalide",
      });
    }

    // Validation des URLs optionnelles
    const urlFields = { website, facebook, instagram };
    Object.entries(urlFields).forEach(([field, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        validations.push({
          test: () => /^https?:\/\/[^\s/$.?#].[^\s]*$/.test(value),
          field,
          message: `L'URL ${field} n'est pas valide`,
        });
      }
    });

    // Exécuter les validations
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

    // Vérifier si les champs uniques sont déjà utilisés par d'autres vendeurs
    if (email || phone || storeName) {
      const uniqueFieldsQuery = [];

      if (email) uniqueFieldsQuery.push({ email, _id: { $ne: sellerId } });
      if (phone) uniqueFieldsQuery.push({ phone, _id: { $ne: sellerId } });
      if (storeName)
        uniqueFieldsQuery.push({ storeName, _id: { $ne: sellerId } });

      if (uniqueFieldsQuery.length > 0) {
        const duplicateSeller = await SellerRequest.findOne({
          $or: uniqueFieldsQuery,
        });

        if (duplicateSeller) {
          let field = "unknown";
          let message = "Valeur en doublon détectée";

          if (email && duplicateSeller.email === email) {
            field = "email";
            message = "Cette adresse e-mail est déjà utilisée";
          } else if (phone && duplicateSeller.phone === phone) {
            field = "phone";
            message = "Ce numéro de téléphone est déjà utilisé";
          } else if (storeName && duplicateSeller.storeName === storeName) {
            field = "storeName";
            message = "Ce nom de boutique est déjà utilisé";
          }

          return res.status(409).json({
            status: "error",
            code: "DUPLICATE_ENTRY",
            error: { field, message },
          });
        }
      }
    }

    // Traitement du mot de passe si fourni
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({
          status: "error",
          code: "VALIDATION_ERROR",
          errors: [
            {
              field: "password",
              message: "Le mot de passe doit contenir au moins 6 caractères",
            },
          ],
        });
      }
      // Hashage du nouveau mot de passe
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Gestion des fichiers
    if (req.files) {
      // Validation du type de fichier pour ownerIdentity
      if (req.files.ownerIdentity) {
        const allowedMimeTypes = ["image/jpeg", "image/png", "application/pdf"];

        if (!allowedMimeTypes.includes(req.files.ownerIdentity[0].mimetype)) {
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

        // Vérification de la taille du fichier
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

        // Upload du nouveau document d'identité
        try {
          const ownerIdentityResult = await cloudinary.uploader.upload(
            req.files.ownerIdentity[0].path,
            { folder: "seller-documents" }
          );
          updateData.ownerIdentity = ownerIdentityResult.secure_url;

          // Supprimer l'ancien fichier de Cloudinary si besoin
          if (existingSeller.ownerIdentity) {
            const publicId = existingSeller.ownerIdentity
              .split("/")
              .pop()
              .split(".")[0];
            await cloudinary.uploader.destroy(`seller-documents/${publicId}`);
          }
        } catch (uploadError) {
          return res.status(500).json({
            status: "error",
            code: "UPLOAD_ERROR",
            message: "Erreur lors de l'upload du document d'identité",
            error:
              process.env.NODE_ENV === "development"
                ? uploadError.message
                : undefined,
          });
        }
      }

      // Validation et upload du logo
      if (req.files.logo) {
        if (!["image/jpeg", "image/png"].includes(req.files.logo[0].mimetype)) {
          return res.status(400).json({
            status: "error",
            code: "INVALID_FILE_TYPE",
            error: {
              field: "logo",
              message: "Le logo doit être au format JPG ou PNG",
            },
          });
        }

        // Vérification de la taille du logo
        if (req.files.logo[0].size > 2 * 1024 * 1024) {
          // 2MB max
          return res.status(400).json({
            status: "error",
            code: "FILE_TOO_LARGE",
            error: {
              field: "logo",
              message: "Le logo ne doit pas dépasser 2MB",
            },
          });
        }

        try {
          const logoResult = await cloudinary.uploader.upload(
            req.files.logo[0].path,
            { folder: "seller-logos" }
          );
          updateData.logo = logoResult.secure_url;

          // Supprimer l'ancien logo de Cloudinary si besoin
          if (existingSeller.logo) {
            const publicId = existingSeller.logo.split("/").pop().split(".")[0];
            await cloudinary.uploader.destroy(`seller-logos/${publicId}`);
          }
        } catch (uploadError) {
          return res.status(500).json({
            status: "error",
            code: "UPLOAD_ERROR",
            message: "Erreur lors de l'upload du logo",
            error:
              process.env.NODE_ENV === "development"
                ? uploadError.message
                : undefined,
          });
        }
      }

      // Nettoyage des fichiers temporaires
      if (req.files.ownerIdentity) {
        fs.unlinkSync(req.files.ownerIdentity[0].path);
      }
      if (req.files.logo) {
        fs.unlinkSync(req.files.logo[0].path);
      }
    }

    // Mettre à jour le vendeur
    const updatedSeller = await SellerRequest.findByIdAndUpdate(
      sellerId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      status: "success",
      message: "Les informations du vendeur ont été mises à jour avec succès",
      data: {
        email: updatedSeller.email,
        storeName: updatedSeller.storeName,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Erreur mise à jour vendeur:", error);

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
      message: "Erreur lors de la mise à jour du compte vendeur",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const deleteSeller = async (req, res) => {
  try {
    const sellerId = req.params.id;

    // Trouver le vendeur avant de le supprimer
    const seller = await SellerRequest.findById(sellerId);
    if (!seller) {
      return res.status(404).json({
        status: "error",
        code: "SELLER_NOT_FOUND",
        message: "Vendeur non trouvé",
      });
    }

    // Supprimer les images du vendeur de Cloudinary
    try {
      // Supprimer la pièce d'identité si elle existe
      if (seller.ownerIdentity) {
        const ownerIdentityId = seller.ownerIdentity
          .split("/")
          .pop()
          .split(".")[0];
        const publicIdOwnerIdentity = `seller-documents/${ownerIdentityId}`;
        await cloudinary.uploader.destroy(publicIdOwnerIdentity);
      }

      // Supprimer le logo s'il existe
      if (seller.logo) {
        const logoId = seller.logo.split("/").pop().split(".")[0];
        const publicIdLogo = `seller-logos/${logoId}`;
        await cloudinary.uploader.destroy(publicIdLogo);
      }
    } catch (cloudinaryError) {
      console.error(
        "Erreur lors de la suppression des images Cloudinary:",
        cloudinaryError
      );
      // Continuer avec la suppression du vendeur même si les images ne peuvent pas être supprimées
    }

    // Supprimer le vendeur de la base de données
    const deletedSeller = await SellerRequest.findByIdAndDelete(sellerId);

    // Supprimer également le plan tarifaire associé s'il existe
    await PricingPlan.findOneAndDelete({ storeId: sellerId });

    return res.status(200).json({
      status: "success",
      message: "Vendeur et images associées supprimés avec succès",
      data: { id: sellerId },
    });
  } catch (error) {
    console.error("Erreur suppression vendeur:", error);
    return res.status(500).json({
      status: "error",
      code: "SERVER_ERROR",
      message: "Erreur lors de la suppression du vendeur",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

async function validerDemandeVendeur(req, res) {
  const requestId = req.params.id;
  const { suspensionMessage } = req.body; // Récupérer le message de suspension du body

  try {
    const demande = await SellerRequest.findById(requestId);

    if (!demande) {
      return res
        .status(404)
        .json({ message: "Demande de vendeur introuvable." });
    }

    let message = "";
    if (demande.isvalid === true) {
      // Suspension du compte
      if (!suspensionMessage) {
        return res.status(400).json({ 
          message: "Le message de suspension est obligatoire pour suspendre un compte." 
        });
      }
      
      demande.isvalid = false;
      demande.suspensionReason = suspensionMessage;
      demande.suspensionDate = new Date();
      message = "Compte de vendeur suspendu avec succès.";
    } else {
      // Validation du compte
      demande.isvalid = true;
      demande.suspensionReason = null; // Effacer la raison de suspension
      demande.suspensionDate = null;   // Effacer la date de suspension
      message = "Demande de vendeur validée avec succès. Compte créé";
    }

    await demande.save();
    return res.status(200).json({ message: message });
  } catch (error) {
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
    const token = jwt.sign(
      { userId: user._id, role: "seller" },
      privateKeSeller,
      {
        expiresIn: "20d",
      }
    );

    const message = "Connexion réussie !";
    return res.json({
      message,
      token,
      id: user._id,
      name: user.name,
      isvalid: user.isvalid,
      suspensionReason: user.suspensionReason,
    });
  } catch (error) {
    const message =
      "Désolé, la connexion n'a pas pu être établie. Veuillez réessayer !";
    res.status(500).json({ message, error: error.message });
  }
};

const getSeller = (req, res) => {
  const Id = req.params.Id;
  SellerRequest.findById(Id)
    .then((response) => {
      // console.log({response});
      
      const message = `vous avez demander le Sellers :${response.name}`;
      if (!response) {
        return res.status(400).json(`le Seller demander n'existe pas!`);
      } else {
        return res.json({ message: message, data: response });
      }
    })
    .catch((error) => {
      console.log({error});
      
      const message =
        "une erreur s'est produit lors de la recuperation du Seller veuillez ressayer !";
      return res.status(500).json({ message: message, error: error });
    });
};
const getSellerClients = (req, res) => {
  const Id = req.params.Id;

  SellerRequest.findById(Id)
    .then((response) => {
      if (!response) {
        return res.status(404).json({
          message: "Le vendeur demandé n'existe pas !"
        });
      }

      // Vérifier si le fournisseur est actif
      if (!response.isvalid) {
        return res.status(404).json({
          message: "Le vendeur demandé existe mais il n'est pas actif pour le moment."
        });
      }

      const message = `Vous avez demandé le vendeur : ${response.name}`;
      return res.json({ message: message, data: response });
    })
    .catch((error) => {
      console.error({ error });
      const message =
        "Une erreur s'est produite lors de la récupération du vendeur, veuillez réessayer !";
      return res.status(500).json({ message: message, error: error });
    });
};

const getSellerByName = (req, res) => {
  const name = req.params.name;
  SellerRequest.findOne({ storeName: name })
    .then((response) => {
      // console.log({response});
      
      const message = `vous avez demander le Sellers :${response.name}`;
      if (!response) {
        return res.status(400).json(`le Seller demander n'existe pas!`);
      } else {
        return res.json({ message: message, data: response });
      }
    })
    .catch((error) => {
      console.log({error});
      
      const message =
        "une erreur s'est produit lors de la recuperation du Seller veuillez ressayer !";
      return res.status(500).json({ message: message, error: error });
    });
};
const getSellerByNameClients = (req, res) => {
  const name = req.params.name;
  SellerRequest.findOne({ storeName: name, isvalid: true })
    .then((response) => {
      // console.log({response});
      
      const message = `vous avez demander le Sellers :${response.name}`;
      if (!response) {
        return res.status(400).json(`le Seller demander n'existe pas!`);
      } else {
        return res.json({ message: message, data: response });
      }
    })
    .catch((error) => {
      console.log({error});
      
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

/**
 * Met à jour l'image d'un vendeur
 */
const setImage = async (req, res) => {
  try {
    const id = req.params.id;

    // Vérifier si le fichier est présent
    if (!req.file) {
      return res.status(400).json({
        status: "error",
        code: "MISSING_FILE",
        message: "Aucune image n'a été fournie",
      });
    }

    // Validation du type de fichier
    const allowedMimeTypes = ["image/jpeg", "image/png"];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      // Supprimer le fichier temporaire
      fs.unlinkSync(req.file.path);

      return res.status(400).json({
        status: "error",
        code: "INVALID_FILE_TYPE",
        message: "Le format de l'image doit être JPG ou PNG",
      });
    }

    // Validation de la taille du fichier (max 5MB)
    if (req.file.size > 5 * 1024 * 1024) {
      // Supprimer le fichier temporaire
      fs.unlinkSync(req.file.path);

      return res.status(400).json({
        status: "error",
        code: "FILE_TOO_LARGE",
        message: "L'image ne doit pas dépasser 5MB",
      });
    }

    // Trouver le vendeur
    const seller = await SellerRequest.findById(id);
    if (!seller) {
      // Supprimer le fichier temporaire
      fs.unlinkSync(req.file.path);

      return res.status(404).json({
        status: "error",
        code: "SELLER_NOT_FOUND",
        message: "Vendeur non trouvé",
      });
    }

    // Upload de la nouvelle image
    let newImageUrl;
    try {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "seller-logos",
      });
      newImageUrl = result.secure_url;
    } catch (uploadError) {
      // Supprimer le fichier temporaire en cas d'erreur
      fs.unlinkSync(req.file.path);

      return res.status(500).json({
        status: "error",
        code: "UPLOAD_ERROR",
        message: "Erreur lors de l'upload de l'image",
        error:
          process.env.NODE_ENV === "development"
            ? uploadError.message
            : undefined,
      });
    }

    // Supprimer le fichier temporaire après upload réussi
    try {
      fs.unlinkSync(req.file.path);
    } catch (unlinkError) {
      console.error(
        "Erreur lors de la suppression du fichier temporaire:",
        unlinkError
      );
      // Continuer même si la suppression du fichier temporaire échoue
    }

    // Si une image existe déjà et n'est pas l'image par défaut, la supprimer
    const DEFAULT_IMAGE =
      "https://chagona.onrender.com/images/image-1688253105925-0.jpeg";
    if (seller.logo && seller.logo !== DEFAULT_IMAGE) {
      try {
        const logoId = seller.logo.split("/").pop().split(".")[0];
        const publicIdLogo = `seller-logos/${logoId}`;
        await cloudinary.uploader.destroy(publicIdLogo);
      } catch (deleteError) {
        console.error(
          "Erreur lors de la suppression de l'ancienne image:",
          deleteError
        );
        // Continuer même si la suppression de l'ancienne image échoue
      }
    }

    // Important: Utiliser findByIdAndUpdate au lieu de save() pour éviter les validations
    // qui pourraient exiger d'autres champs
    const updatedSeller = await SellerRequest.findByIdAndUpdate(
      id,
      { logo: newImageUrl },
      { new: true, runValidators: false }
    );

    if (!updatedSeller) {
      return res.status(404).json({
        status: "error",
        code: "UPDATE_FAILED",
        message: "La mise à jour de l'image a échoué",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Image mise à jour avec succès",
      data: { logo: newImageUrl },
    });
  } catch (error) {
    console.error("Erreur mise à jour image:", error);

    // Supprimer le fichier temporaire en cas d'erreur
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error(
          "Erreur lors de la suppression du fichier temporaire:",
          e
        );
      }
    }

    return res.status(500).json({
      status: "error",
      code: "SERVER_ERROR",
      message: "Erreur lors de la mise à jour de l'image",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
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

// Fonctions de gestion des plans

// Créer un nouveau plan
// Fonction de création de plan modifiée
// Créer un nouveau plan
const createPricingPlan = async (req, res) => {
  try {
    const { storeId, planType } = req.body;

    // Validation des champs requis
    if (!storeId || !planType) {
      return res.status(400).json({
        status: "error",
        code: "MISSING_FIELDS",
        error: {
          message: "storeId et planType sont requis",
        },
      });
    }

    // Vérifier si le plan existe déjà pour ce store
    const existingPlan = await PricingPlan.findOne({ storeId });
    if (existingPlan) {
      return res.status(409).json({
        status: "error",
        code: "DUPLICATE_PLAN",
        error: {
          message: "Un plan existe déjà pour cette boutique",
        },
      });
    }

    // Vérifier si le type de plan est valide
    if (!PLAN_DEFAULTS[planType]) {
      return res.status(400).json({
        status: "error",
        code: "INVALID_PLAN_TYPE",
        error: {
          message: "Type de plan invalide",
        },
      });
    }

    // Créer le nouveau plan avec les valeurs par défaut
    const planDefaults = PLAN_DEFAULTS[planType];
    const newPlan = new PricingPlan({
      storeId,
      planType,
      ...planDefaults,
      status: "active",
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 jours
    });

    await newPlan.save();

    return res.status(201).json({
      status: "success",
      message: "Plan tarifaire créé avec succès",
      data: newPlan,
    });
  } catch (error) {
    console.error("Erreur création plan:", error);
    return res.status(500).json({
      status: "error",
      code: "SERVER_ERROR",
      message: "Erreur lors de la création du plan",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Obtenir les détails d'un plan
const getPricingPlan = async (req, res) => {
  try {
    const { planId } = req.params;

    const plan = await PricingPlan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        status: "error",
        code: "PLAN_NOT_FOUND",
        error: {
          message: "Plan non trouvé",
        },
      });
    }

    return res.status(200).json({
      status: "success",
      data: plan,
    });
  } catch (error) {
    console.error("Erreur récupération plan:", error);
    return res.status(500).json({
      status: "error",
      code: "SERVER_ERROR",
      message: "Erreur lors de la récupération du plan",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Obtenir le plan d'une boutique
const getStorePlan = async (req, res) => {
  try {
    const { storeId } = req.params;

    const plan = await PricingPlan.findOne({ storeId });
    if (!plan) {
      return res.status(404).json({
        status: "error",
        code: "PLAN_NOT_FOUND",
        error: {
          message: "Aucun plan trouvé pour cette boutique",
        },
      });
    }

    return res.status(200).json({
      status: "success",
      data: plan,
    });
  } catch (error) {
    console.error("Erreur récupération plan boutique:", error);
    return res.status(500).json({
      status: "error",
      code: "SERVER_ERROR",
      message: "Erreur lors de la récupération du plan de la boutique",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Mettre à jour un plan
const updatePricingPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const { planType, status } = req.body;

    // Vérifier si le plan existe
    const existingPlan = await PricingPlan.findById(planId);
    if (!existingPlan) {
      return res.status(404).json({
        status: "error",
        code: "PLAN_NOT_FOUND",
        error: {
          message: "Plan non trouvé",
        },
      });
    }

    // Si changement de type de plan
    if (planType && planType !== existingPlan.planType) {
      if (!PLAN_DEFAULTS[planType]) {
        return res.status(400).json({
          status: "error",
          code: "INVALID_PLAN_TYPE",
          error: {
            message: "Type de plan invalide",
          },
        });
      }

      // Mettre à jour avec les nouvelles valeurs par défaut
      const planDefaults = PLAN_DEFAULTS[planType];
      Object.assign(existingPlan, planDefaults);
      existingPlan.planType = planType;
    }

    // Mise à jour du statut si fourni
    if (status) {
      if (!["active", "inactive", "pending"].includes(status)) {
        return res.status(400).json({
          status: "error",
          code: "INVALID_STATUS",
          error: {
            message: "Statut invalide",
          },
        });
      }
      existingPlan.status = status;
    }

    existingPlan.updatedAt = new Date();
    await existingPlan.save();

    return res.status(200).json({
      status: "success",
      message: "Plan mis à jour avec succès",
      data: existingPlan,
    });
  } catch (error) {
    console.error("Erreur mise à jour plan:", error);
    return res.status(500).json({
      status: "error",
      code: "SERVER_ERROR",
      message: "Erreur lors de la mise à jour du plan",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Supprimer un plan
const deletePricingPlan = async (req, res) => {
  try {
    const { planId } = req.params;

    const plan = await PricingPlan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        status: "error",
        code: "PLAN_NOT_FOUND",
        error: {
          message: "Plan non trouvé",
        },
      });
    }

    await plan.deleteOne();

    return res.status(200).json({
      status: "success",
      message: "Plan supprimé avec succès",
    });
  } catch (error) {
    console.error("Erreur suppression plan:", error);
    return res.status(500).json({
      status: "error",
      code: "SERVER_ERROR",
      message: "Erreur lors de la suppression du plan",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Lister tous les plans
const listPricingPlans = async (req, res) => {
  try {
    const plans = await PricingPlan.find();

    return res.status(200).json({
      status: "success",
      data: plans,
    });
  } catch (error) {
    console.error("Erreur liste des plans:", error);
    return res.status(500).json({
      status: "error",
      code: "SERVER_ERROR",
      message: "Erreur lors de la récupération de la liste des plans",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Fonction pour récupérer les commandes d'un vendeur spécifique
async function getSellerOrders(sellerId, options = {}) {
  try {
    // 🔥 CORRECTION: Convertir sellerId en ObjectId si ce n'est pas déjà fait
    const sellerObjectId = mongoose.Types.ObjectId.isValid(sellerId) 
      ? new mongoose.Types.ObjectId(sellerId)
      : sellerId;

    // 🔥 NOUVEAU: Options de pagination
    const page = parseInt(options.page) || 1;
    const limit = parseInt(options.limit) || 10;
    const skip = (page - 1) * limit;

    // Pipeline d'agrégation avec pagination
    const pipeline = [
      // Premièrement, on fait un match pour trouver les commandes potentiellement pertinentes
      {
        $match: {
          statusPayment: { $exists: true }, // Pour s'assurer qu'on ne prend que des commandes valides
        },
      },

      // Étape 1: Ajouter un index à chaque produit dans nbrProduits
      {
        $addFields: {
          nbrProduitsWithIndex: {
            $map: {
              input: { $range: [0, { $size: "$nbrProduits" }] },
              as: "index",
              in: {
                $mergeObjects: [
                  { $arrayElemAt: ["$nbrProduits", "$$index"] },
                  { originalIndex: "$$index" }
                ]
              }
            }
          }
        }
      },

      // Étape 2: Dénormaliser les produits de chaque commande
      { $unwind: "$nbrProduitsWithIndex" },

      // Étape 3: Lookup pour obtenir les détails du produit
      {
        $lookup: {
          from: "produits", // Nom de votre collection de produits
          localField: "nbrProduitsWithIndex.produit",
          foreignField: "_id",
          as: "productInfo",
        },
      },

      // Étape 4: Dénormaliser le résultat du lookup
      { $unwind: "$productInfo" },

      // Étape 5: Filtrer seulement les produits du vendeur
      // 🔥 CORRECTION: Utiliser sellerObjectId au lieu de sellerId
      {
        $match: {
          "productInfo.Clefournisseur": sellerObjectId,
        },
      },

      // Étape 6: Regrouper par commande
      {
        $group: {
          _id: "$_id",

          clefUser: { $first: "$clefUser" },
          reference: { $first: "$reference" },
          statusPayment: { $first: "$statusPayment" },
          statusLivraison: { $first: "$statusLivraison" },
          livraisonDetails: { $first: "$livraisonDetails" },
          prix: { $first: "$prix" },
          reduction: { $first: "$reduction" },
          date: { $first: "$date" },
          etatTraitement: { $first: "$etatTraitement" },

          // Ajouter les produits du vendeur avec leurs détails complets
          sellerProducts: {
            $push: {
              originalIndex: "$nbrProduitsWithIndex.originalIndex", // 🔥 NOUVEAU: Index original
              produitId: "$nbrProduitsWithIndex.produit",
              isValideSeller: "$nbrProduitsWithIndex.isValideSeller",
              quantite: "$nbrProduitsWithIndex.quantite",
              tailles: "$nbrProduitsWithIndex.tailles",
              couleurs: "$nbrProduitsWithIndex.couleurs",
              nom: "$productInfo.name",
              prix: "$productInfo.prix",
              prixPromo:"$productInfo.prixPromo",
              image: "$productInfo.image1",
            },
          },

          // Calculer le sous-total pour ce vendeur
          sellerTotal: {
            $sum: {
               $multiply: [
            "$nbrProduitsWithIndex.quantite",
            {
              $cond: {
                if: { $gt: ["$productInfo.prixPromo", 0] }, // prixPromo > 0
                then: "$productInfo.prixPromo",
                else: "$productInfo.prix"
              }
            }
          ],
            },
          },
        },
      },

      // Étape 7: Trier par date de commande (le plus récent en premier)
      { $sort: { date: -1 } },
    ];

    // 🔥 NOUVEAU: Exécuter le pipeline avec pagination
    const orders = await Commande.aggregate(pipeline)
      .skip(skip)
      .limit(limit);

    // 🔥 NOUVEAU: Compter le total pour la pagination
    const totalPipeline = [
      ...pipeline.slice(0, -1), // Tous les stages sauf le sort
      { $count: "total" }
    ];
    
    const totalResult = await Commande.aggregate(totalPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;
    const totalPages = Math.ceil(total / limit);

    return {
      orders,
      pagination: {
        currentPage: page,
        totalPages,
        totalOrders: total,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        limit
      }
    };
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des commandes du vendeur:",
      error
    );
    throw error;
  }
}

// Route pour obtenir les commandes d'un vendeur
const seller_orders = async (req, res) => {
  try {
    // Récupérer l'ID du vendeur depuis le token d'authentification
    const sellerId = req.params.Id;

    // 🔥 NOUVEAU: Récupérer les paramètres de pagination depuis la query
    const options = {
      page: req.query.page || 1,
      limit: req.query.limit || 10,
      status: req.query.status, // Optionnel: filtre par statut
      search: req.query.search  // Optionnel: recherche
    };

    // Appeler la fonction pour récupérer les commandes avec pagination
    const result = await getSellerOrders(sellerId, options);

    res.status(200).json({
      success: true,
      data: result,
      // Compatibilité avec l'ancien format
      orders: result.orders,
      pagination: result.pagination
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des commandes",
      error: error.message,
    });
  }
};

// Fonction pour valider les produits d'un vendeur dans une commande spécifique
async function validateSellerProducts(orderId, sellerId) {
  try {
    // 🔥 CORRECTION: Convertir sellerId en ObjectId
    const sellerObjectId = mongoose.Types.ObjectId.isValid(sellerId) 
      ? new mongoose.Types.ObjectId(sellerId)
      : sellerId;

    // Recherche de la commande par son ID
    const commande = await Commande.findById(orderId);

    if (!commande) {
      throw new Error("Commande non trouvée");
    }

    // Obtenir tous les IDs des produits dans la commande
    const productIds = commande.nbrProduits.map((item) => item.produit);

    // Rechercher tous les produits qui appartiennent au vendeur spécifié
    // 🔥 CORRECTION: Utiliser sellerObjectId
    const sellerProducts = await Produit.find({
      _id: { $in: productIds },
      Clefournisseur: sellerObjectId,
    }).select("_id");

    // Créer un Set des IDs de produits du vendeur pour une recherche efficace
    const sellerProductIds = new Set(
      sellerProducts.map((p) => p._id.toString())
    );

    // Mettre à jour uniquement les produits qui appartiennent au vendeur
    let modifié = false;

    commande.nbrProduits.forEach((item) => {
      if (
        sellerProductIds.has(item.produit.toString()) &&
        !item.isValideSeller
      ) {
        item.isValideSeller = true;
        modifié = true;
      }
    });

    // Sauvegarder la commande si des modifications ont été apportées
    if (modifié) {
      await commande.save();
    }

    return {
      success: true,
      message: modifié
        ? "Produits du vendeur validés avec succès"
        : "Aucun produit à valider pour ce vendeur",
      modifié: modifié,
    };
  } catch (error) {
    console.error(
      "Erreur lors de la validation des produits du vendeur:",
      error
    );
    throw error;
  }
}

// Route pour valider les produits d'un vendeur dans une commande
const validate_seller_products = async (req, res) => {
  try {
    const { orderId } = req.params;
    const sellerId = req.params.sellerId; // ou req.seller._id selon votre implémentation d'authentification

    const result = await validateSellerProducts(orderId, sellerId);

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Erreur lors de la validation des produits du vendeur",
      error: error.message,
    });
  }
};

// 🔥 NOUVEAU: Fonction pour valider un produit individuel
async function validateIndividualProduct(orderId, sellerId, productId, isValid = true, productIndex = null) {
  try {
    // Convertir les IDs en ObjectId
    const sellerObjectId = mongoose.Types.ObjectId.isValid(sellerId) 
      ? new mongoose.Types.ObjectId(sellerId)
      : sellerId;
    
    const productObjectId = mongoose.Types.ObjectId.isValid(productId) 
      ? new mongoose.Types.ObjectId(productId)
      : productId;

    // Recherche de la commande
    const commande = await Commande.findById(orderId);
    if (!commande) {
      throw new Error("Commande non trouvée");
    }

    // Vérifier que le produit appartient au vendeur
    const produitVendeur = await Produit.findOne({
      _id: productObjectId,
      Clefournisseur: sellerObjectId,
    });

    if (!produitVendeur) {
      throw new Error("Ce produit ne vous appartient pas ou n'existe pas");
    }

    // Trouver l'item dans la commande et le mettre à jour
    let produitTrouve = false;
    let ancienEtat = false;

    if (productIndex !== null) {
      // Mode index : mettre à jour seulement l'élément à l'index spécifié
      const index = parseInt(productIndex);
      if (index >= 0 && index < commande.nbrProduits.length) {
        const item = commande.nbrProduits[index];
        if (item.produit.toString() === productObjectId.toString()) {
          ancienEtat = item.isValideSeller;
          item.isValideSeller = isValid;
          produitTrouve = true;
        }
      }
    } else {
      // Mode legacy : mettre à jour tous les éléments avec le même productId
      commande.nbrProduits.forEach((item) => {
        if (item.produit.toString() === productObjectId.toString()) {
          ancienEtat = item.isValideSeller;
          item.isValideSeller = isValid;
          produitTrouve = true;
        }
      });
    }

    if (!produitTrouve) {
      throw new Error("Ce produit n'est pas dans cette commande");
    }

    // Sauvegarder la commande
    await commande.save();

    return {
      success: true,
      message: isValid 
        ? "Produit validé avec succès" 
        : "Validation du produit annulée",
      data: {
        orderId,
        productId,
        sellerId,
        isValideSeller: isValid,
        previousState: ancienEtat,
        changed: ancienEtat !== isValid
      }
    };
  } catch (error) {
    console.error("Erreur lors de la validation individuelle:", error);
    throw error;
  }
}

// Route pour valider un produit individuel
const validate_individual_product = async (req, res) => {
  try {
    const { orderId, sellerId, productId } = req.params;
    const { isValid = true } = req.body; // Permettre de spécifier true/false

    const result = await validateIndividualProduct(orderId, sellerId, productId, isValid);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Erreur lors de la validation du produit",
      error: error.message,
    });
  }
};

// Route pour basculer l'état de validation d'un produit
const toggle_product_validation = async (req, res) => {
  try {
    const { orderId, sellerId, productId, productIndex } = req.params;

    // D'abord récupérer l'état actuel
    const commande = await Commande.findById(orderId);
    if (!commande) {
      return res.status(404).json({
        success: false,
        message: "Commande non trouvée"
      });
    }

    // Trouver l'état actuel du produit à l'index spécifique
    let etatActuel = false;
    const index = parseInt(productIndex);
    
    if (index >= 0 && index < commande.nbrProduits.length) {
      const item = commande.nbrProduits[index];
      if (item.produit.toString() === productId) {
        etatActuel = item.isValideSeller || false;
      } else {
        return res.status(400).json({
          success: false,
          message: "L'index du produit ne correspond pas au produit spécifié"
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Index de produit invalide"
      });
    }

    // Basculer l'état
    const nouvelEtat = !etatActuel;
    const result = await validateIndividualProduct(orderId, sellerId, productId, nouvelEtat, productIndex);
    
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Erreur lors du basculement de validation",
      error: error.message,
    });
  }
};

// 🎯 NOUVEAU: Récupérer les informations du seller avec son abonnement
const getSellerInfo = async (req, res) => {
  try {
    const { sellerId } = req.params;
    
    if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({
        success: false,
        message: "ID seller invalide"
      });
    }

    // Récupérer le seller avec son abonnement
    const seller = await SellerRequest.findById(sellerId)
      .populate({
        path: 'subscriptionId',
        model: 'PricingPlan'
      })
      .lean();

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller non trouvé"
      });
    }

    res.json({
      success: true,
      data: seller
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des infos seller:', error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la récupération des informations",
      error: error.message
    });
  }
};

// 🎯 NOUVEAU: Récupérer un plan d'abonnement par son ID
const getPricingPlanById = async (req, res) => {
  try {
    const { planId } = req.params;
    
    if (!planId || !mongoose.Types.ObjectId.isValid(planId)) {
      return res.status(400).json({
        success: false,
        message: "ID plan invalide"
      });
    }

    const plan = await PricingPlan.findById(planId).lean();

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan d'abonnement non trouvé"
      });
    }

    res.json({
      success: true,
      data: plan
    });

  } catch (error) {
    console.error('Erreur lors de la récupération du plan:', error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la récupération du plan",
      error: error.message
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
  createPricingPlan,
  getPricingPlan,
  getStorePlan,
  updatePricingPlan,
  deletePricingPlan,
  listPricingPlans,
  updateSeller,
  seller_orders,
  validate_seller_products,
  validate_individual_product,
  toggle_product_validation,
  getSellerByName,
  getSellerClients,
  getSellerByNameClients,
  // 🎯 NOUVEAU: Méthodes pour le système de commission
  getSellerInfo,
  getPricingPlanById
};
