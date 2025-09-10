const { SellerRequest, PricingPlan } = require("../Models");
const { createSubscriptionForSeller, createInitialSubscription, getSellerCompleteStatus } = require('./subscriptionController');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const privateKeSeller = require("../auth/clefSeller");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");

// Configuration Cloudinary (déjà présente dans votre code)
cloudinary.config({
  cloud_name: "dkfddtykk",
  api_key: "577594384978177",
  api_secret: "kGQ99p3O0iFASZZHEmFelHPVt0I",
});

/**
 * Créer un vendeur avec abonnement automatique
 * Version améliorée de votre fonction existante
 */
// const createSellerWithSubscription = async (req, res) => {
//   try {
//     // Récupération et validation des données (votre code existant)
//     let {
//       email,
//       emailp,
//       name,
//       userName2,
//       phone,
//       storeName,
//       storeDescription,
//       category,
//       storeType,
//       region,
//       city,
//       address,
//       postalCode,
//       businessPhone,
//       whatsapp,
//       facebook,
//       instagram,
//       website,
//       openingHours,
//       minimumOrder,
//       password,
//       planType = 'Starter' // Plan par défaut
//     } = req.body;
//     planType=planType[0];
    

//     // Validations (votre code existant)
//     const requiredFields = {
//       email: "L'email est requis",
//       name: "Le nom est requis",
//       userName2: "Le prénom est requis",
//       phone: "Le numéro de téléphone est requis",
//       storeName: "Le nom de la boutique est requis",
//       storeDescription: "La description de la boutique est requise",
//       category: "La catégorie est requise",
//       storeType: "Le type de boutique est requis",
//       region: "La région est requise",
//       city: "La ville est requise",
//       address: "L'adresse est requise",
//       businessPhone: "Le téléphone professionnel est requis",
//       password: "Le mot de passe est requis",
//     };

//     const missingFields = Object.entries(requiredFields)
//       .filter(([field]) => !req.body[field])
//       .map(([field, message]) => ({ field, message }));

//     if (missingFields.length > 0) {
//       return res.status(400).json({
//         status: "error",
//         code: "MISSING_FIELDS",
//         errors: missingFields,
//       });
//     }

//     // Vérifications d'unicité (votre code existant)
//     const existingSeller = await SellerRequest.findOne({
//       $or: [{ email }, { phone }, { storeName }],
//     });

//     if (existingSeller) {
//       return res.status(409).json({
//         status: "error",
//         code: "DUPLICATE_ENTRY",
//         error: {
//           field: existingSeller.email === email ? "email" : 
//                  existingSeller.phone === phone ? "phone" : "storeName",
//           message: existingSeller.email === email ? "Cette adresse e-mail est déjà utilisée" :
//                    existingSeller.phone === phone ? "Ce numero de telephone est déjà utilisée" :
//                    "Ce nom de boutique est déjà utilisé",
//         },
//       });
//     }

//     // Validation du type de plan
//     if (!['Starter', 'Pro', 'Business'].includes(planType)) {
//       return res.status(400).json({
//         status: "error",
//         code: "INVALID_PLAN_TYPE",
//         error: {
//           field: "planType",
//           message: "Type de plan invalide. Plans disponibles: Starter, Pro, Business"
//         }
//       });
//     }

//     // Validation des fichiers (votre code existant)
//     if (!req.files?.ownerIdentity) {
//       return res.status(400).json({
//         status: "error",
//         code: "MISSING_FILES",
//         error: {
//           field: "ownerIdentity",
//           message: "La pièce d'identité est requise",
//         },
//       });
//     }

//     // Upload des fichiers (votre code existant)
//     let ownerIdentityUrl = null;
//     let logoUrl = null;

//     try {
//       if (req.files.ownerIdentity) {
//         const ownerIdentityResult = await cloudinary.uploader.upload(
//           req.files.ownerIdentity[0].path,
//           { folder: "seller-documents" }
//         );
//         ownerIdentityUrl = ownerIdentityResult.secure_url;
//       }

//       if (req.files.logo) {
//         const logoResult = await cloudinary.uploader.upload(
//           req.files.logo[0].path,
//           { folder: "seller-logos" }
//         );
//         logoUrl = logoResult.secure_url;
//       }
//     } catch (uploadError) {
//       return res.status(500).json({
//         status: "error",
//         code: "UPLOAD_ERROR",
//         message: "Erreur lors de l'upload des fichiers",
//         error: process.env.NODE_ENV === "development" ? uploadError.message : undefined,
//       });
//     }

//     // Hashage du mot de passe
//     const hashedPassword = await bcrypt.hash(password, 10);

//     // Création du vendeur
//     const newSeller = new SellerRequest({
//       email,
//       emailp: emailp?.length !== 0 ? emailp : null,
//       name,
//       userName2,
//       phone,
//       password: hashedPassword,
//       storeName,
//       storeDescription,
//       category,
//       storeType,
//       region,
//       city,
//       address,
//       postalCode,
//       businessPhone,
//       whatsapp,
//       facebook,
//       instagram,
//       website,
//       openingHours,
//       minimumOrder,
//       ownerIdentity: ownerIdentityUrl,
//       logo: logoUrl,
//       subscriptionStatus: 'active', // Nouveau champ
//       onboardingCompleted: false,    // Nouveau champ
//     });

//     const savedSeller = await newSeller.save();

//     // Création automatique de l'abonnement
//     try {
//       const subscription = await createSubscriptionForSeller(savedSeller._id, planType);
      
//       // Mise à jour du vendeur avec l'ID de l'abonnement
//       await SellerRequest.findByIdAndUpdate(savedSeller._id, {
//         subscriptionId: subscription._id
//       });

//       // Réponse avec informations sur l'abonnement
//       return res.status(201).json({
//         status: "success",
//         message: "Votre boutique a été créée avec succès !",
//         data: {
//           seller: {
//             id: savedSeller._id,
//             email: savedSeller.email,
//             storeName: savedSeller.storeName,
//             subscriptionStatus: 'active'
//           },
//           subscription: {
//             id: subscription._id,
//             planType: subscription.planType,
//             status: subscription.status,
//             startDate: subscription.startDate,
//             endDate: subscription.endDate,
//             trialPeriod: planType === 'Starter' ? '3 mois gratuits' : null,
//             nextSteps: [
//               "Complétez votre profil de boutique",
//               "Ajoutez vos premiers produits",
//               "Configurez vos méthodes de paiement",
//               planType === 'Starter' ? "Profitez de vos 3 mois gratuits !" : "Votre abonnement est actif"
//             ]
//           }
//         },
//       });

//     } catch (subscriptionError) {
//       // Si l'abonnement échoue, supprimer le vendeur créé
//       await SellerRequest.findByIdAndDelete(savedSeller._id);
      
//       return res.status(500).json({
//         status: "error",
//         code: "SUBSCRIPTION_ERROR",
//         message: "Erreur lors de la création de l'abonnement",
//         error: process.env.NODE_ENV === "development" ? subscriptionError.message : undefined,
//       });
//     }

//   } catch (error) {
//     console.error("Erreur création vendeur:", error);

//     // Nettoyage des fichiers en cas d'erreur
//     if (req.files) {
//       if (req.files.ownerIdentity) fs.unlinkSync(req.files.ownerIdentity[0].path);
//       if (req.files.logo) fs.unlinkSync(req.files.logo[0].path);
//     }

//     if (error.code === 11000) {
//       const field = Object.keys(error.keyPattern)[0];
//       return res.status(409).json({
//         status: "error",
//         code: "DUPLICATE_KEY",
//         error: {
//           field,
//           message: `Ce ${field} existe déjà dans notre système`,
//         },
//       });
//     }

//     return res.status(500).json({
//       status: "error",
//       code: "SERVER_ERROR",
//       message: "Erreur lors de la création du compte",
//       error: process.env.NODE_ENV === "development" ? error.message : undefined,
//     });
//   }
// };
const createSellerWithSubscription = async (req, res) => {
  try {
    // Validation des données (votre logique existante)
    let {
      email, emailp, name, userName2, phone, storeName, storeDescription,
      category, storeType, region, city, address, postalCode, businessPhone,
      whatsapp, facebook, instagram, website, openingHours, minimumOrder, password
    } = req.body;

    // Validations requises (votre code existant)
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

    // Vérifications d'unicité (votre code existant)
    const existingSeller = await SellerRequest.findOne({
      $or: [{ email }, { phone }, { storeName }],
    });

    if (existingSeller) {
      return res.status(409).json({
        status: "error",
        code: "DUPLICATE_ENTRY",
        error: {
          field: existingSeller.email === email ? "email" :
                existingSeller.phone === phone ? "phone" : "storeName",
          message: existingSeller.email === email ? "Cette adresse e-mail est déjà utilisée" :
                  existingSeller.phone === phone ? "Ce numero de telephone est déjà utilisée" :
                  "Ce nom de boutique est déjà utilisé",
        },
      });
    }

    // Validation des fichiers (votre code existant)
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

    // Upload des fichiers (votre code existant)
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
        error: process.env.NODE_ENV === "development" ? uploadError.message : undefined,
      });
    }

    // Hashage du mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Création du vendeur
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
      // États initiaux
      subscriptionStatus: 'trial',
      isvalid: false,
      onboardingCompleted: false,
      accountCreatedAt: new Date()
    });

    const savedSeller = await newSeller.save();

    // Création automatique de l'abonnement d'essai Starter (3 mois gratuits)
    try {
      const subscriptionResult = await createInitialSubscription(savedSeller._id);

      // Mise à jour du vendeur avec l'ID de l'abonnement
      await SellerRequest.findByIdAndUpdate(savedSeller._id, {
        subscriptionId: subscriptionResult.subscription._id,
        trialEndsAt: subscriptionResult.subscription.endDate
      });

      // Réponse de succès avec informations complètes
      return res.status(201).json({
        status: "success",
        message: "🎉 Votre boutique a été créée avec succès !",
        data: {
          seller: {
            id: savedSeller._id,
            email: savedSeller.email,
            storeName: savedSeller.storeName,
            name: savedSeller.name,
            subscriptionStatus: 'trial'
          },
          trialSubscription: {
            id: subscriptionResult.subscription._id,
            planType: 'Starter',
            status: 'trial',
            startDate: subscriptionResult.subscription.startDate,
            endDate: subscriptionResult.subscription.endDate,
            daysRemaining: Math.ceil((subscriptionResult.subscription.endDate - new Date()) / (1000 * 60 * 60 * 24)),
            benefits: [
              "✨ 3 mois d'accès gratuit complet",
              "📦 Jusqu'à 10 produits",
              "💬 Support email",
              "📱 Paiements mobile money",
              "🎯 Visibilité marketplace standard"
            ]
          },
          onboarding: {
            currentStep: 1,
            totalSteps: 4,
            nextSteps: [
              {
                step: 1,
                title: "Complétez votre profil",
                description: "Ajoutez votre logo et informations complètes",
                completed: !!logoUrl
              },
              {
                step: 2,  
                title: "Ajoutez vos premiers produits",
                description: "Créez votre catalogue de base",
                completed: false
              },
              {
                step: 3,
                title: "Configurez vos méthodes de paiement",
                description: "Paramétrez comment recevoir vos paiements",
                completed: false
              },
              {
                step: 4,
                title: "Explorez les fonctionnalités",
                description: "Découvrez toutes les possibilités de votre boutique",
                completed: false
              }
            ]
          },
          importantNotes: [
            "🆓 Votre période d'essai de 3 mois commence maintenant",
            "⏰ Vous pouvez renouveler jusqu'à 30 jours avant l'expiration",
            "🔄 Vos paramètres et données seront conservés lors du renouvellement",
            "💡 Profitez de cette période pour explorer toutes les fonctionnalités"
          ]
        },
      });

    } catch (subscriptionError) {
      // Si l'abonnement échoue, supprimer le vendeur créé
      await SellerRequest.findByIdAndDelete(savedSeller._id);
      console.log({subscriptionError});
      
      return res.status(500).json({
        status: "error",
        code: "SUBSCRIPTION_ERROR",
        message: "Erreur lors de la création de l'abonnement d'essai",
        error: process.env.NODE_ENV === "development" ? subscriptionError.message : undefined,
      });
    }

  } catch (error) {
    console.error("Erreur création vendeur avec essai:", error);

    // Nettoyage des fichiers en cas d'erreur
    if (req.files) {
      if (req.files.ownerIdentity) fs.unlinkSync(req.files.ownerIdentity[0].path);
      if (req.files.logo) fs.unlinkSync(req.files.logo[0].path);
    }

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

    return res.status(500).json({
      status: "error",
      code: "SERVER_ERROR", 
      message: "Erreur lors de la création du compte",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
/**
 * Login amélioré avec vérification du statut d'abonnement
 */
// const loginWithSubscriptionCheck = async (req, res) => {
//   try {
//     const { email, phoneNumber, password } = req.body;

//     // Recherche de l'utilisateur
//     let user = await SellerRequest.findOne({ email })
//       .populate('subscriptionId'); // Joindre les données d'abonnement
    
//     if (!user && phoneNumber) {
//       user = await SellerRequest.findOne({ phone: phoneNumber })
//         .populate('subscriptionId');
//     }

//     if (!user) {
//       return res.status(400).json({ 
//         message: "Cet e-mail ou numéro de téléphone n'est pas enregistré !" 
//       });
//     }

//     // Vérification du mot de passe
//     const isValidPassword = await bcrypt.compare(password, user.password);
//     if (!isValidPassword) {
//       return res.status(400).json({ message: "Mot de passe incorrect !" });
//     }

//     // Vérification du statut d'abonnement
//     const subscription = user.subscriptionId || await PricingPlan.findOne({ storeId: user._id });
    
//     let subscriptionStatus = 'unknown';
//     let subscriptionWarnings = [];

//     if (subscription) {
//       const now = new Date();
//       const endDate = new Date(subscription.endDate);
//       const daysUntilExpiry = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

//       if (subscription.status === 'expired' || endDate < now) {
//         subscriptionStatus = 'expired';
//         subscriptionWarnings.push('Votre abonnement a expiré. Certaines fonctionnalités sont limitées.');
//       } else if (daysUntilExpiry <= 7) {
//         subscriptionStatus = 'expiring';
//         subscriptionWarnings.push(`Votre abonnement expire dans ${daysUntilExpiry} jour(s).`);
//       } else {
//         subscriptionStatus = 'active';
//       }
//     }

//     // Vérification de la validation du compte
//     if (!user.isvalid) {
//       let message = "Votre compte est en attente de validation.";
//       if (user.suspensionReason) {
//         message = `Votre compte a été suspendu. Raison: ${user.suspensionReason}`;
//       }
      
//       return res.status(403).json({ 
//         message,
//         accountStatus: 'suspended',
//         suspensionReason: user.suspensionReason 
//       });
//     }

//     // Génération du token JWT
//     const token = jwt.sign(
//       { 
//         userId: user._id, 
//         role: "seller",
//         subscriptionStatus,
//         planType: subscription?.planType 
//       },
//       privateKeSeller,
//       { expiresIn: "20d" }
//     );

//     return res.json({
//       message: "Connexion réussie !",
//       token,
//       user: {
//         id: user._id,
//         name: user.name,
//         email: user.email,
//         storeName: user.storeName,
//         isvalid: user.isvalid,
//         subscriptionStatus,
//         token,
//         onboardingCompleted: user.onboardingCompleted || false
//       },
//       subscription: subscription ? {
//         planType: subscription.planType,
//         status: subscription.status,
//         endDate: subscription.endDate,
//         features: subscription.features,
//         commission: subscription.commission
//       } : null,
//       warnings: subscriptionWarnings
//     });

//   } catch (error) {
//     console.error("Erreur login vendeur:", error);
//     return res.status(500).json({
//       message: "Désolé, la connexion n'a pas pu être établie. Veuillez réessayer !",
//       error: error.message
//     });
//   }
// };

const loginWithSubscriptionCheck = async (req, res) => {
  try {
    const { email, phoneNumber, password } = req.body;

    // Recherche de l'utilisateur
    let user = await SellerRequest.findOne({ email });

    if (!user && phoneNumber) {
      user = await SellerRequest.findOne({ phone: phoneNumber });
    }

    if (!user) {
      return res.status(400).json({
        message: "Cet e-mail ou numéro de téléphone n'est pas enregistré !"
      });
    }

    // Vérification du mot de passe
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: "Mot de passe incorrect !" });
    }

    // Vérification de la validation du compte vendeur
    if (!user.isvalid) {
      let message = "Votre compte est en attente de validation administrative.";
      let accountStatus = 'pending_validation';
      
      if (user.suspensionReason) {
        message = `Votre compte a été suspendu. Raison: ${user.suspensionReason}`;
        accountStatus = 'suspended';
      }
      
      return res.status(403).json({ 
        message,
        accountStatus,
        suspensionReason: user.suspensionReason,
        nextSteps: [
          "Votre dossier est en cours de vérification par nos équipes",
          "Vous recevrez un email de confirmation une fois validé",
          "Délai moyen de validation: 24-48h ouvrées",
          "Contactez le support si urgent: support@ihambaobab.com"
        ]
      });
    }

    // Obtenir le statut complet avec la nouvelle logique
    const completeStatus = await getSellerCompleteStatus(user._id);

    // Vérification si le compte est bloqué définitivement
    if (completeStatus.statusInfo?.blocked && completeStatus.statusInfo.status === 'suspended') {
      return res.status(403).json({
        message: "Votre compte est suspendu. Renouvelez votre abonnement pour réactiver.",
        accountStatus: 'suspended',
        statusInfo: completeStatus.statusInfo,
        canReactivate: true
      });
    }

    // Générer le token avec informations complètes
    const token = jwt.sign(
      {
        userId: user._id,
        role: "seller",
        subscriptionStatus: completeStatus.statusInfo?.status,
        planType: completeStatus.activeSubscription?.planType,
        accountValid: !completeStatus.statusInfo?.blocked
      },
      privateKeSeller,
      { expiresIn: "20d" }
    );

    return res.json({
      message: "Connexion réussie !",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        storeName: user.storeName,
        isvalid: user.isvalid,
        subscriptionStatus: completeStatus.statusInfo?.status,
        onboardingCompleted: user.onboardingCompleted || false,
        token
      },
      subscription: {
        current: completeStatus.activeSubscription,
        queue: completeStatus.queueInfo,
        statusInfo: completeStatus.statusInfo,
        daysRemaining: completeStatus.statusInfo?.status === 'trial' || completeStatus.statusInfo?.status === 'active' 
          ? Math.ceil((completeStatus.activeSubscription?.endDate - new Date()) / (1000 * 60 * 60 * 24)) 
          : 0
      },
      accessibility: {
        canAddProducts: !completeStatus.statusInfo?.blocked,
        canManageStore: !completeStatus.statusInfo?.blocked,
        canReceiveOrders: !completeStatus.statusInfo?.blocked,
        canAccessReports: !completeStatus.statusInfo?.blocked,
        restrictedFeatures: completeStatus.statusInfo?.blocked 
          ? ['product_management', 'order_processing', 'store_settings']
          : []
      }
    });

  } catch (error) {
    console.error("Erreur login vendeur:", error);
    return res.status(500).json({
      message: "Désolé, la connexion n'a pas pu être établie. Veuillez réessayer !",
      error: error.message
    });
  }
};

/**
 * Obtenir les informations du vendeur avec son abonnement
 */
const getSellerWithSubscription = async (req, res) => {
  try {
    const { Id } = req.params;

    const seller = await SellerRequest.findById(Id);
    if (!seller) {
      return res.status(404).json({
        status: 'error',
        message: "Vendeur non trouvé"
      });
    }

    const subscription = await PricingPlan.findOne({ storeId: Id });

    // Calcul des statistiques d'utilisation du plan
    let usageStats = {};
    if (subscription) {
      // Ici vous pourriez calculer l'utilisation réelle vs les limites du plan
      // Par exemple: nombre de produits créés vs limite du plan
      usageStats = {
        productsUsed: 0, // À calculer selon vos données
        productsLimit: subscription.features?.productManagement?.maxProducts || -1,
        categoriesUsed: 0, // À calculer
        categoriesLimit: subscription.features?.productManagement?.maxCategories || -1,
      };
    }

    return res.json({
      status: 'success',
      message: `Informations du vendeur: ${seller.name}`,
      data: {
        seller,
        subscription: subscription ? {
          ...subscription.toObject(),
          daysUntilExpiry: subscription.endDate ? 
            Math.ceil((new Date(subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24)) : null
        } : null,
        usageStats
      }
    });
  } catch (error) {
    console.error("Erreur récupération vendeur:", error);
    return res.status(500).json({
      status: 'error',
      message: "Erreur lors de la récupération du vendeur",
      error: error.message
    });
  }
};

/**
 * Vérifier si un vendeur peut effectuer une action selon son plan
 */
const checkPlanLimits = async (sellerId, action, currentCount = 0) => {
  try {
    const subscription = await PricingPlan.findOne({ 
      storeId: sellerId, 
      status: 'active' 
    });

    if (!subscription) {
      return { allowed: false, reason: 'Aucun abonnement actif' };
    }

    const features = subscription.features;

    switch (action) {
      case 'add_product':
        const maxProducts = features.productManagement.maxProducts;
        if (maxProducts !== -1 && currentCount >= maxProducts) {
          return { 
            allowed: false, 
            reason: `Limite de produits atteinte (${maxProducts})`,
            upgrade: true
          };
        }
        break;

      case 'add_category':
        const maxCategories = features.productManagement.maxCategories;
        if (maxCategories !== -1 && currentCount >= maxCategories) {
          return { 
            allowed: false, 
            reason: `Limite de catégories atteinte (${maxCategories})`,
            upgrade: true
          };
        }
        break;

      case 'use_email_marketing':
        if (!features.marketing.emailMarketing) {
          return { 
            allowed: false, 
            reason: 'Email marketing non disponible dans votre plan',
            upgrade: true
          };
        }
        break;

      case 'accept_card_payment':
        if (!features.paymentOptions.cardPayment) {
          return { 
            allowed: false, 
            reason: 'Paiement par carte non disponible dans votre plan',
            upgrade: true
          };
        }
        break;
    }

    return { allowed: true };
  } catch (error) {
    console.error('Erreur vérification limites plan:', error);
    return { allowed: false, reason: 'Erreur système' };
  }
};

module.exports = {
  createSellerWithSubscription,
  loginWithSubscriptionCheck,
  getSellerWithSubscription,
  checkPlanLimits,

  // Réexporter vos fonctions existantes
  updateSeller: require('../storeController').updateSeller,
  deleteSeller: require('../storeController').deleteSeller,
  validerDemandeVendeur: require('../storeController').validerDemandeVendeur,
  getSellers: require('../storeController').getSellers,
  setImage: require('../storeController').setImage,
  findSellerByName: require('../storeController').findSellerByName,
  createPricingPlan: require('../storeController').createPricingPlan,
  getPricingPlan: require('../storeController').getPricingPlan,
  getStorePlan: require('../storeController').getStorePlan,
  updatePricingPlan: require('../storeController').updatePricingPlan,
  deletePricingPlan: require('../storeController').deletePricingPlan,
  listPricingPlans: require('../storeController').listPricingPlans,
  seller_orders: require('../storeController').seller_orders,
  validate_seller_products: require('../storeController').validate_seller_products,
  verifyToken: require('../storeController').verifyToken
};