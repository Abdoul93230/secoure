const {
  User,
  Profile,
  Commande,
  AdressShipping,
  CarteBancaire,
  MobileMoney,
  PaymentMethode,
  UserMessage,
  PromoCode,
} = require("./Models");
const bcrypt = require("bcrypt");
const { Expo } = require("expo-server-sdk");
const mongoose = require("mongoose");
const axios = require("axios");
const fs = require("fs");
const nodemailer = require("nodemailer");
const { gererValidationFinanciere, handleFinancialTransitions } = require("./productControler");
const { gererRelanceCommande } = require("./controllers/financeController");
const promoCodeController = require("./controllers/promoCodeController");

const cloudinary = require('./cloudinary');

// Créez une nouvelle instance d'Expo
const expo = new Expo();

function generateCodeFromClefUser(clefUser) {
  const saltRounds = 10; // Nombre de tours de hachage
  const codePromoLength = 9; // Longueur du code promo
  const hashedClefUser = bcrypt.hashSync(clefUser, saltRounds);
  // const code = hashedClefUser.substring(0, codePromoLength).toUpperCase();

  return hashedClefUser;
}

/////////////////////////// creation d'un utilisateur ////////////////////////////////////
const createUser = async (req, res) => {
  try {
    const data = req.body;
    // Vérifier si l'email a été passé dans la requête
    if (!data.email && !data.phoneNumber) {
      return res
        .status(400)
        .json({ message: "L'email ou le numéro de téléphone est requis !" });
    }

    // Check if user with the same email already exists
    const existingUserByEmail = data.email
      ? await User.findOne({ email: data.email })
      : null;

    // Check if user with the same phone number already exists
    const existingUserByPhone = data.phoneNumber
      ? await User.findOne({ phoneNumber: data.phoneNumber })
      : null;

    const existingProfilWithNumber = data.phoneNumber
      ? await Profile.findOne({
        numero: data.phoneNumber,
      })
      : null;

    if (existingUserByEmail) {
      return res
        .status(409)
        .json({ message: "Un utilisateur avec le même email existe déjà !" });
    }

    if (existingUserByPhone) {
      return res.status(409).json({
        message:
          "Un utilisateur avec le même numéro de téléphone existe déjà !",
      });
    }

    if (existingProfilWithNumber) {
      return res.status(409).json({
        message:
          "Un utilisateur avec le même numéro de téléphone existe déjà !",
      });
    }

    const hash = await bcrypt.hash(data.password, 10);

    const user = new User({
      name: data.name,
      // email: data.email || null, // Utilisez null si l'email n'est pas passé
      phoneNumber: data.phoneNumber || null, // Utilisez null si le numéro de téléphone n'est pas passé
      password: hash,
      whatsapp: data.whatsapp,
    });
    if (data.phoneNumber && data.phoneNumber !== null) {
      user.phoneNumber = data.phoneNumber;
    }
    if (data.email && data.email !== null) {
      user.email = data.email;
    }

    await user.save();

    const existingProfileByUser = await Profile.findOne({ clefUser: String(user._id) });
    if (!existingProfileByUser) {
      const profileData = {
        clefUser: String(user._id),
      };

      if (user.phoneNumber) {
        const existingProfileByNumber = await Profile.findOne({ numero: user.phoneNumber });
        if (!existingProfileByNumber || String(existingProfileByNumber.clefUser) === String(user._id)) {
          profileData.numero = user.phoneNumber;
        }
      }

      await Profile.create(profileData);
    }

    const newCodePromo = new PromoCode({
      // code: generateCodeFromClefUser(user?._id),
      code: "BIENVENUE20",
      dateExpirate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Valide 30 jours,
      prixReduiction: 20,
      clefUser: user?._id,
      isValide: true,
      isWelcomeCode: true,
    });

    newCodePromo.save();
    //   .then((savedCodePromo) => {
    //     res
    //       .status(201)
    //       .json({ data: savedCodePromo, message: "bon creer avec succes." });
    //   })
    //   .catch((error) => {
    //     res.status(400).json({ error: error.message });
    //   });

    res.status(201).json({ message: "Utilisateur ajouté !" });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      const errors = Object.values(error.errors).map((err) => err.message);
      res.status(400).json({ errors });
    } else {
      res.status(500).json({
        message: "Erreur lors de la création de l'utilisateur",
        data: error,
      });
    }
  }
};

/////////////////////////// fin creation d'un utilisateur ////////////////////////////////////

/////////////////////////////// verification de l'autorisation /////////////////////////////
const verifyToken = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        message: "Token invalide: utilisateur non identifié.",
      });
    }

    const user = await User.findById(req.userId).select("_id name email phoneNumber whatsapp isMinimalAccount needsPasswordChange isActive");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur introuvable.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Token valide",
      user: {
        id: user._id,
        name: user.name,
        email: user.email || null,
        phoneNumber: user.phoneNumber || null,
        whatsapp: !!user.whatsapp,
        isMinimalAccount: !!user.isMinimalAccount,
        needsPasswordChange: !!user.needsPasswordChange,
        isActive: user.isActive !== false,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Erreur lors de la vérification du token.",
      data: error,
    });
  }
};
/////////////////////////////// fin verification de l'autorisation /////////////////////////////

const getUser = async (req, res) => {
  const data = req.query;
  // console.log(id);
  try {
    const user = await User.findOne({ _id: data.id });
    if (user) {
      return res.json({ message: "vous avez demander l'utilisateur", user });
    } else {
      return res.status(404).json("l'utilisateur demander n'existe pas");
    }
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: 'Erreur lors de la récupération de l"utilisateur' });
  }
};

const creatProfile = async (req, res) => {
  const data = req.body;

  try {
    const user = await User.findById(data.id);
    // const existingUserWithName = await User.findOne({ name: data.name });
    const existingUserWithEmail = await User.findOne({ email: data.email });
    const existingProfilWithNumber = await Profile.findOne({
      numero: data.phone,
    });
    const existingUserWithPhone = await User.findOne({
      phoneNumber: data.phone,
    });

    // if (
    //   existingUserWithName &&
    //   existingUserWithName._id.toString() !== data.id
    // ) {
    //   return res
    //     .status(402)
    //     .json({ message: "Un utilisateur avec le même nom existe déjà." });
    // }

    if (
      existingUserWithEmail &&
      existingUserWithEmail._id.toString() !== data.id
    ) {
      return res
        .status(402)
        .json({ message: "Un utilisateur avec le même email existe déjà." });
    }

    if (
      existingUserWithPhone &&
      existingUserWithPhone._id.toString() !== data.id
    ) {
      return res.status(402).json({
        message: "Un utilisateur avec le même numéro de téléphone existe déjà.",
      });
    }

    if (
      existingProfilWithNumber &&
      existingProfilWithNumber.clefUser.toString() !== data.id
    ) {
      return res.status(402).json({
        message: "Un utilisateur avec le même numéro de téléphone existe déjà.",
      });
    }

    if (user.name !== data.name) {
      await User.updateOne({ _id: data.id }, { $set: { name: data.name } });
    }
    if (user.email !== data.email) {
      await User.updateOne({ _id: data.id }, { $set: { email: data.email } });
    }
    if (user.phoneNumber !== data.phone) {
      await User.updateOne(
        { _id: data.id },
        { $set: { phoneNumber: data.phone } }
      );
    }

    let picture = null;
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "images", // Le nom du dossier dans lequel vous souhaitez stocker les images
      });
      picture = result.secure_url;

      // Supprimer l'ancienne image du profil
      const profile = await Profile.findOne({ clefUser: data.id });
      if (profile && profile.image) {
        const publicId = `images/${profile.image.split("/").pop().split(".")[0]
          }`;
        await cloudinary.uploader.destroy(publicId);
      }
    }

    const profile = await Profile.findOne({ clefUser: data.id });

    if (profile) {
      if (picture) {
        await Profile.updateOne(
          { clefUser: data.id },
          { $set: { image: picture, numero: data.phone } }
        );
      } else {
        await Profile.updateOne(
          { clefUser: data.id },
          { $set: { numero: data.phone } }
        );
      }
    } else {
      const profileData = {
        clefUser: data.id,
        numero: data.phone,
      };

      if (picture) {
        profileData.image = picture;
      }

      const newProfile = new Profile(profileData);
      await newProfile.save();
    }

    return res.json({ message: "Création du profil réussie" });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      // Gérez les erreurs de validation du modèle ici
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(401).json({ errors });
    } else {
      // Gérez les autres erreurs ici
      const message = "Erreur lors de la création du profil.";
      return res.status(500).json({ message: message, data: error });
    }
  }
};

const getUserProfiles = (req, res) => {
  Profile.find()
    .then((profile) => {
      if (profile) {
        const message = "vous avez demander le profile :";
        return res.json({ message: message, data: profile });
      }
      return res.status(404).json({
        message:
          "vous avez pas de profile pour le moment veuiller en creer un !",
      });
    })
    .catch((error) => {
      const message = "erreur lord de la recuperation du profile.";
      return res.status(500).json({ message: message, data: error });
    });
};
const getUserProfile = (req, res) => {
  const id = req.query.id;
  Profile.findOne({ clefUser: id })
    .then((profile) => {
      if (profile) {
        const message = "vous avez demander le profile :";
        return res.json({ message: message, data: profile });
      }
      return res.status(404).json({
        message:
          "vous avez pas de profile pour le moment veuiller en creer un !",
      });
    })
    .catch((error) => {
      const message = "erreur lord de la recuperation du profile.";
      return res.status(500).json({ message: message, data: error });
    });
};

const createCommande = async (req, res) => {
  const data = req.body;
  const StockService = require('./services/stockService');
  const promoCodeController = require('./controllers/promoCodeController');
  const mongoose = require('mongoose');

  // Démarrer une transaction pour assurer la cohérence
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      // 1. Valider la disponibilité du stock
      console.log('🔍 Validation du stock pour la commande...');
      const stockValidation = await StockService.validateStockAvailability(data.nbrProduits);
      
      if (!stockValidation.valid) {
        const errors = stockValidation.invalidItems.map(item => item.error).join(', ');
        throw new Error(`Stock insuffisant: ${errors}`);
      }

      // 2. Traiter le code promo via le nouveau système centralisé
      let subtotal = data.prixTotal || data.prix; // Le montant de base pour la promo (produits seulement)
      let shipping = data.fraisLivraison || 0;
      let finalPrice = subtotal + shipping;
      let finalReduction = data.reduction || 0;
      
      let promoResult = null;
      if (data.idCodePro) {
        console.log('🎫 Validation du code promo:', data.idCodePro);
        try {
          const userId = data.clefUser || null;
          
          // Utiliser applyPromoToOrder sans orderId pour valider et calculer la réduction uniquement
          promoResult = await promoCodeController.applyPromoToOrder(
            data.idCodePro,
            subtotal,
            userId,
            { session, orderId: null } // On enregistre pas l'usage ici car on n'a pas encore l'orderId
          );
          
          if (promoResult.success && promoResult.promoCode) {
            finalReduction = promoResult.discount;
            finalPrice = subtotal - finalReduction + shipping;
            console.log('✅ Code promo validé. Réduction calculée:', finalReduction);
          } else {
            console.warn('⚠️ Code promo rejeté:', promoResult.message);
            finalPrice = subtotal - finalReduction + shipping;
          }
        } catch (error) {
          console.error('Erreur lors de la validation du code promo:', error);
          finalPrice = subtotal - finalReduction + shipping;
        }
      } else {
        // Pas de code promo, mais on applique quand même la réduction envoyée par le frontend si elle existe
        finalPrice = subtotal - finalReduction + shipping;
      }

      // 2b. Déduire les Baobab Points si l'utilisateur en utilise
      let pointsUsed = 0;
      let pointsDiscount = 0;
      if (data.pointsToUse && data.pointsToUse > 0 && data.clefUser) {
        try {
          const pointsService = require('./services/pointsService');
          const configService = require('./services/gamificationConfigService');
          const cfg = await configService.getConfig();
          const rate = cfg.redemption?.pointsToFcfaRate || 20;
          const maxPct = cfg.redemption?.maxPercentPerOrder || 30;
          const maxFcfa = Math.floor(subtotal * maxPct / 100);
          const maxPoints = Math.floor(maxFcfa / rate);
          const actualPoints = Math.min(data.pointsToUse, maxPoints);
          if (actualPoints > 0) {
            const wallet = await pointsService.getWallet(data.clefUser);
            const deductible = Math.min(actualPoints, wallet.balance);
            if (deductible > 0) {
              pointsUsed = deductible;
              pointsDiscount = deductible * rate;
              finalPrice = Math.max(0, finalPrice - pointsDiscount);
            }
          }
        } catch (pErr) {
          console.error('⚠️ Erreur lecture wallet points:', pErr.message);
        }
      }

      // 3. Créer la commande
      const commande = new Commande({
        clefUser: data.clefUser,
        nbrProduits: data.nbrProduits,
        prix: finalPrice, // Total final à payer
        prixTotal: subtotal, // Sous-total des produits
        fraisLivraison: shipping,
        reduction: finalReduction,
        codePro: data.idCodePro ? true : Boolean(data.codePro),
        idCodePro: data.idCodePro,
        codePromo: (data.idCodePro && promoResult && promoResult.promoCode) ? promoResult.promoCode.code : null,
        reference: data.reference,
        livraisonDetails: data.livraisonDetails,
        prod: data.prod,
        statusPayment: data?.statusPayment ? data.statusPayment : "en cours",
        pointsUsed,
        pointsDiscount,
      });

      await commande.save({ session });

      // 3. ENREGISTRER L'USAGE DU CODE PROMO
      if (data.idCodePro && finalReduction > 0) {
        console.log('🎫 Enregistrement final de l\'usage du code promo...');
        await promoCodeController.recordPromoUsage(
          data.idCodePro,
          subtotal,
          data.clefUser,
          commande._id,
          finalReduction,
          { session }
        );
      }

      // 3b. Débiter les points utilisés (après création commande, avant fin transaction)
      if (pointsUsed > 0 && data.clefUser) {
        try {
          const pointsService = require('./services/pointsService');
          await pointsService.redeemPoints({
            userId: data.clefUser,
            pointsToRedeem: pointsUsed,
            orderId: commande._id,
            orderAmountFcfa: subtotal,
          });
          console.log(`✅ ${pointsUsed} BP débités pour la commande`);
        } catch (pErr) {
          console.error('⚠️ Erreur débit points:', pErr.message);
        }
      }

      // 3. Décrémenter le stock
      console.log('📦 Décrémentation du stock...');
      const stockResult = await StockService.decrementStock(data.nbrProduits, { session });
      
      console.log('✅ Commande créée et stock mis à jour:', {
        commandeId: commande._id,
        stockOperations: stockResult.operations.length
      });

      // Retourner les données pour la réponse
      req.commandeResult = { commande, stockResult };
    });

    const { commande, stockResult } = req.commandeResult;
    const message = "Commande créée avec succès et stock mis à jour.";
    return res.json({ 
      message, 
      commande,
      stockOperations: stockResult.operations
    });

  } catch (error) {
    console.error('❌ Erreur lors de la création de la commande:', error);
    const message = "Erreur lors de la création de la commande.";
    return res.status(500).json({ 
      message, 
      error: error.message 
    });
  } finally {
    await session.endSession();
  }
};
const getCommandesById = async (req, res) => {
  const id = req.params.id;

  try {
    const commande = await Commande.findById(id);

    return res.json({ commande });
  } catch (error) {
    const message =
      "Erreur lors de la récupération des commandes pour la clefUser spécifiée.";
    return res.status(500).json({ message, error });
  }
};

const getCommandeByReference = async (req, res) => {
  const reference = req.params.reference;

  try {
    const commandes = await Commande.find({
      $or: [
        { reference },
        { "paymentDetails.reference": reference },
        { "paymentDetails.externalReference": reference },
        { "paymentDetails.publicReference": reference },
      ],
    }).sort({ date: -1, _id: -1 });

    const commande =
      commandes.find((item) => item.reference === reference) ||
      commandes.find((item) => item?.paymentDetails?.externalReference === reference) ||
      commandes.find((item) => item?.paymentDetails?.reference === reference) ||
      commandes.find((item) => item?.paymentDetails?.publicReference === reference) ||
      commandes[0];

    if (!commande) {
      return res.status(404).json({ message: "Aucune commande trouvée pour cette référence." });
    }

    return res.json({ commande });
  } catch (error) {
    const message = "Erreur lors de la récupération de la commande pour la référence spécifiée.";
    return res.status(500).json({ message, error });
  }
};

// Endpoint optimisé pour le polling - retourne seulement le statut du paiement
// Payload réduit: ~200 bytes vs 4.9KB de getCommandeByReference
const getOrderPaymentStatus = async (req, res) => {
  const reference = req.params.reference;

  try {
    const commandes = await Commande.find({
      $or: [
        { reference },
        { "paymentDetails.reference": reference },
        { "paymentDetails.externalReference": reference },
        { "paymentDetails.publicReference": reference },
      ],
    }).sort({ date: -1, _id: -1 }).select('reference statusPayment date updatedAt -_id');

    const commande =
      commandes.find((item) => item.reference === reference) ||
      commandes.find((item) => item?.paymentDetails?.externalReference === reference) ||
      commandes.find((item) => item?.paymentDetails?.reference === reference) ||
      commandes.find((item) => item?.paymentDetails?.publicReference === reference) ||
      commandes[0];

    if (!commande) {
      return res.status(404).json({ 
        status: 'notfound',
        message: "Commande introuvable"
      });
    }

    // Réponse optimisée: ~200 bytes au lieu de 4.9KB
    return res.json({ 
      reference: commande.reference,
      status: commande.statusPayment,
      lastUpdate: commande.updatedAt || commande.date,
      isCompleted: ['payé', 'échec', 'payé à la livraison', 'payé par téléphone'].includes(commande.statusPayment)
    });
  } catch (error) {
    console.error('Erreur getOrderPaymentStatus:', error);
    return res.status(500).json({ 
      status: 'error',
      message: "Erreur serveur",
      error: error.message 
    });
  }
};

const emitPaymentStatusUpdate = (req, commande, payload) => {
  const io = req?.app?.get?.("io");

  if (!io || !commande?.reference) {
    return;
  }

  io.to(`payment:${commande.reference}`).emit("payment:status", {
    commandeId: commande._id,
    reference: commande.reference,
    statusPayment: payload.statusPayment,
    status: payload.status,
    externalReference: payload.externalReference,
    referenceIpay: payload.reference,
    publicReference: payload.publicReference,
    amount: payload.amount,
    paymentDate: payload.paymentDate,
    customerName: payload.customerName,
    msisdn: payload.msisdn,
    failureDetails: payload.failureDetails || null,
    emittedAt: new Date().toISOString(),
  });
};


const getCommandesByClefUser = async (req, res) => {
  const clefUser = req.params.clefUser;

  try {
    const commandes = await Commande.find({ clefUser });

    return res.json({ commandes });
  } catch (error) {
    const message =
      "Erreur lors de la récupération des commandes pour la clefUser spécifiée.";
    return res.status(500).json({ message, error });
  }
};

const getAllCommandes = async (req, res) => {
  try {
    const commandes = await Commande.find().sort({ date: -1 });

    return res.json({ commandes });
  } catch (error) {
    const message = "Erreur lors de la récupération des commandes.";
    return res.status(500).json({ message, error });
  }
};

const deleteCommandeById = async (req, res) => {
  const StockService = require('./services/stockService');
  const mongoose = require('mongoose');

  // Démarrer une transaction
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const commandeId = req.params.commandeId;

      const commandeToDelete = await Commande.findById(commandeId).session(session);

      if (!commandeToDelete) {
        throw new Error("La commande spécifiée n'a pas été trouvée.");
      }

      // Restaurer le stock avant de supprimer la commande
      console.log('🔄 Suppression de commande - Restauration du stock...');
      const stockResult = await StockService.incrementStock(
        commandeToDelete.nbrProduits, 
        { session }
      );

      // Restaurer l'utilisation du code promo si la commande en avait un
      if (commandeToDelete.idCodePro) {
        console.log('🎫 Restauration de l\'utilisation du code promo...');
        const promoCodeController = require('./controllers/promoCodeController');
        try {
          // Utiliser l'ID de la commande réelle, pas l'ID utilisateur
          await promoCodeController.restorePromoUsage(commandeToDelete.idCodePro, commandeToDelete._id, { session });
        } catch (error) {
          console.error('Erreur lors de la restauration du code promo:', error);
        }
      }

      // Supprimer la commande
      const deletedCommande = await Commande.findByIdAndDelete(commandeId).session(session);

      console.log('✅ Commande supprimée et stock restauré:', {
        commandeId,
        stockOperations: stockResult.operations.length
      });

      // Sauvegarder le résultat pour la réponse
      req.deleteResult = { deletedCommande, stockResult };
    });

    const { deletedCommande, stockResult } = req.deleteResult;
    const message = "Commande supprimée avec succès et stock restauré.";
    return res.json({ 
      message, 
      stockOperations: stockResult.operations
    });

  } catch (error) {
    console.error('❌ Erreur lors de la suppression de la commande:', error);
    const message = "Erreur lors de la suppression de la commande.";
    return res.status(500).json({ 
      message, 
      error: error.message 
    });
  } finally {
    await session.endSession();
  }
};

const mettreAJourStatuts = async (req, res) => {
  const commandeId = req.params.commandeId;

  try {
    // 1. Récupérer l'état actuel de la commande
    const commandeActuelle = await Commande.findById(commandeId);

    if (!commandeActuelle) {
      return res.status(404).json({
        success: false,
        message: "Commande non trouvée"
      });
    }

    // Vérifier si la commande n'est pas déjà validée
    if (commandeActuelle.etatTraitement === "livraison reçu") {
      return res.status(400).json({
        success: false,
        message: "Cette commande est déjà validée"
      });
    }

    // Vérifier si la commande n'est pas annulée
    if (commandeActuelle.etatTraitement === "Annulée") {
      return res.status(400).json({
        success: false,
        message: "Impossible de valider une commande annulée"
      });
    }

    console.log(`Validation de la commande ${commandeId} - État actuel: ${commandeActuelle.etatTraitement}`);

    // 2. Mettre à jour la commande
    const updatedCommande = await Commande.findOneAndUpdate(
      { _id: commandeId },
      {
        $set: {
          statusPayment: "recu",
          statusLivraison: "recu",
          etatTraitement: "livraison reçu",
          dateValidation: new Date() // Ajouter la date de validation
        },
      },
      { new: true }
    );

    // 3. Gérer les aspects financiers
    await gererValidationFinanciere(commandeId, commandeActuelle.etatTraitement);

    // 4. Gamification: créditer points d'achat + bonus 1ère commande + parrainage
    if (commandeActuelle.clefUser) {
      try {
        const pointsService = require('./services/pointsService');
        const referralService = require('./services/referralService');
        const orderAmount = Math.max(0, (commandeActuelle.prix || 0) - (commandeActuelle.fraisLivraison || 0));

        await pointsService.creditPurchasePoints({
          userId: commandeActuelle.clefUser,
          orderAmountFcfa: orderAmount,
          orderId: commandeId,
        });
        await pointsService.creditFirstOrderBonus({
          userId: commandeActuelle.clefUser,
          orderId: commandeId,
        });
        await referralService.handleOrderDelivered({
          userId: commandeActuelle.clefUser,
          orderId: commandeId,
        });
        console.log(`✅ Points gamification crédités pour commande ${commandeId}`);
      } catch (gErr) {
        console.error('⚠️ Gamification mettreAJourStatuts:', gErr.message);
      }
    }

    // 5. Réponse de succès
    res.status(200).json({
      success: true,
      message: "Commande validée avec succès",
      data: updatedCommande,
      financial: {
        message: "Paiements sellers traités",
        timestamp: new Date()
      }
    });

    console.log(`✅ Commande ${commandeId} validée avec succès`);

  } catch (error) {
    console.error(`❌ Erreur lors de la validation de la commande ${commandeId}:`, error);

    res.status(500).json({
      success: false,
      message: "Erreur lors de la validation de la commande",
      error: error.message
    });
  }
};

function createOrUpdateAddress(req, res) {
  const { clefUser, ...newAddressData } = req.body;
  console.log(req.body);

  // Vérifier si l'adresse existe déjà pour la clé d'utilisateur donnée
  AdressShipping.findOne({ clefUser })
    .then((address) => {
      if (!address) {
        // Si l'adresse n'existe pas, créer une nouvelle adresse
        address = new AdressShipping(newAddressData);
        address.clefUser = clefUser;
      } else {
        // Si l'adresse existe, mettre à jour les informations avec les nouvelles données
        Object.assign(address, newAddressData);
      }

      // Enregistrer l'adresse dans la base de données
      return address.save();
    })
    .then((address) => {
      res.status(200).json({
        message: "Adresse créée ou mise à jour avec succès.",
        address,
      });
    })
    .catch((error) => {
      // console.error(error);
      if (error instanceof mongoose.Error.ValidationError) {
        const errors = Object.values(error.errors).map((err) => err.message);
        res.status(400).json({ err: errors });
      } else if (error.code === 11000 && error.keyPattern.email) {
        // Erreur d'unicité détectée pour le champ "email"
        res
          .status(400)
          .json({ message: "L'adresse e-mail existe déjà.", error: error });
      } else {
        res.status(500).json({
          message:
            "Une erreur s'est produite lors de la création ou de la mise à jour de l'adresse de livraison.",
          error: error,
        });
      }
    });
}

function getAddressByUserKey(req, res) {
  const clefUser = req.params.clefUser;

  // Rechercher l'adresse en fonction de la clé d'utilisateur
  AdressShipping.findOne({ clefUser })
    .then((address) => {
      if (!address) {
        return res.status(404).json({
          error: "Aucune adresse trouvée pour la clé d'utilisateur fournie.",
        });
      }

      res.status(200).json({ address });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({
        error:
          "Une erreur s'est produite lors de la recherche de l'adresse de livraison.",
      });
    });
}
function getAllAddressByUser(req, res) {
  // Rechercher l'adresse en fonction de la clé d'utilisateur
  AdressShipping.find()
    .then((address) => {
      if (!address) {
        return res.status(404).json({
          error: "Aucune adresse trouvée pour la clé d'utilisateur fournie.",
        });
      }

      res.status(200).json({ data: address });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({
        error:
          "Une erreur s'est produite lors de la recherche de l'adresse de livraison.",
      });
    });
}

const createMoyentPayment = async (req, res) => {
  const data = req.body;

  try {
    let paymentMethod = await PaymentMethode.findOne({
      clefUser: data.clefUser,
    });

    if (!paymentMethod) {
      if (data.option === "Visa" || data.option === "master Card") {
        paymentMethod = new PaymentMethode({
          type: data.option,
          numeroCard: data.numeroCard,
          cvc: data.cvc,
          clefUser: data.clefUser,
          expire: data.expire,
        });
      } else if (data.option === "Mobile Money") {
        paymentMethod = new PaymentMethode({
          type: data.option,
          phone: data.numero,
          operateur: data.operateur,
          clefUser: data.clefUser,
        });
      } else if (data.option === "Payment a domicile") {
        paymentMethod = new PaymentMethode({
          type: data.option,
          clefUser: data.clefUser,
        });
      }

      await paymentMethod.save();
    } else {
      // Le moyen de paiement existe, supprimer et créer un nouveau
      await PaymentMethode.findOneAndDelete({ clefUser: data.clefUser });

      if (data.option === "Visa" || data.option === "master Card") {
        paymentMethod = new PaymentMethode({
          type: data.option,
          numeroCard: data.numeroCard,
          cvc: data.cvc,
          clefUser: data.clefUser,
          expire: data.expire,
        });
      } else if (data.option === "Mobile Money") {
        paymentMethod = new PaymentMethode({
          type: data.option,
          phone: data.numero,
          operateur: data.operateur,
          clefUser: data.clefUser,
        });
      } else if (data.option === "Payment a domicile") {
        paymentMethod = new PaymentMethode({
          type: data.option,
          clefUser: data.clefUser,
        });
      }

      await paymentMethod.save();
    }

    const message = "Opération réussie !";
    return res.json({ message: message });
  } catch (error) {
    const message =
      "Erreur lors de la création ou de la mise à jour du moyen de paiement.";
    return res.status(500).json({ message: message, data: error });
  }
};

const getMoyentPaymentByClefUser = async (req, res) => {
  const clefUser = req.params.clefUser;

  try {
    const paymentMethod = await PaymentMethode.findOne({ clefUser });

    if (!paymentMethod) {
      return res.status(404).json({ message: "Moyen de paiement non trouvé." });
    }

    return res.json({ paymentMethod });
  } catch (error) {
    return res.status(500).json({
      message: "Erreur lors de la récupération du moyen de paiement.",
      data: error,
    });
  }
};

const getUsers = async (req, res) => {
  try {
    const users = await User.find();
    res.json({ message: "tous les utilisateurs", data: users });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: "Erreur lors de la récupération des utilisateurs" });
  }
};

const createUserMessage = async (req, res) => {
  const { date, message, clefUser, provenance, utlisateur } = req.body;

  try {
    // Créer une nouvelle instance de UserMessage avec les données fournies
    const newUserMessage = new UserMessage({
      date: date,
      message: message,
      clefUser: clefUser,
      provenance: provenance,
    });

    // Sauvegarder le message
    await newUserMessage.save();

    // Récupérer l'utilisateur destinataire pour obtenir son pushToken
    const user = await User.findById(clefUser);

    if (user && user.pushToken) {
      // Vérifier si le token est valide
      if (!Expo.isExpoPushToken(user.pushToken)) {
        console.error(
          `Push token ${user.pushToken} is not a valid Expo push token`
        );
        return res
          .status(201)
          .json("message envoyé mais notification impossible");
      }

      // Préparer le message de notification
      const cleanMessage = message.replace(/<[^>]*>/g, "");

      const messages = [
        {
          to: user.pushToken,
          sound: "default",
          title: "IHAM Baobab message",
          body:
            cleanMessage.length > 70
              ? cleanMessage.substring(0, 47) + "..."
              : cleanMessage,
          data: {
            messageId: newUserMessage._id,
            clefUser: clefUser,
            provenance: provenance,
          },
          icon: "https://res.cloudinary.com/dkfddtykk/image/upload/v1730637067/images/djbqrcbhunhdoeucxbyb.png",
        },
      ];

      try {
        if (!utlisateur) {
          // Envoyer les notifications en chunks (Expo recommande des chunks de 100 notifications max)
          const chunks = expo.chunkPushNotifications(messages);
          const tickets = [];

          for (let chunk of chunks) {
            try {
              const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
              tickets.push(...ticketChunk);
            } catch (error) {
              console.error("Erreur lors de l'envoi des notifications:", error);
            }
          }

          console.log("Notifications envoyées:", tickets);
        } else {
          console.log("condition non verifier");
        }
      } catch (error) {
        console.error(
          "Erreur lors de la préparation des notifications:",
          error
        );
      }
    }

    res.status(201).json("message envoyé");
  } catch (error) {
    console.error("Erreur lors de la création du message:", error);
    res.status(400).json({ error: error.message });
  }
};

// Ajoutez cette fonction pour sauvegarder le token de notification
const saveUserPushToken = async (req, res) => {
  const { userId, pushToken } = req.body;
  // console.log("oui1");

  try {
    // Vérifier si le token est valide
    if (!Expo.isExpoPushToken(pushToken)) {
      return res.status(400).json({ error: "Token invalide" });
    }

    // Mettre à jour l'utilisateur avec le nouveau token
    await User.findByIdAndUpdate(userId, { pushToken: pushToken });

    res.status(200).json({ message: "Token sauvegardé avec succès" });
  } catch (error) {
    console.error("Erreur lors de la sauvegarde du token:", error);
    res.status(400).json({ error: error.message });
  }
};

const lecturUserMessage = async (req, res) => {
  try {
    const userKey = req.body.userKey; // Assurez-vous que le champ userKey est envoyé dans le corps de la requête

    // Recherche de tous les messages non lus de l'utilisateur avec la clé spécifiée
    const unreadMessages = await UserMessage.find({
      clefUser: userKey,
      lusUser: false,
    });

    // Mettre à jour l'attribut lusUser à true pour les messages non lus de l'utilisateur
    await UserMessage.updateMany(
      { _id: { $in: unreadMessages.map((msg) => msg._id) } },
      { $set: { lusUser: true } }
    );

    res.status(200).json({
      message:
        "Les messages ont été marqués comme lus pour l'utilisateur spécifié.",
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour des messages :", error);
    res.status(500).json({
      error: "Une erreur est survenue lors de la mise à jour des messages.",
    });
  }
};

const lecturAdminMessage = async (req, res) => {
  try {
    const userKey = req.body.userKey; // Assurez-vous que le champ userKey est envoyé dans le corps de la requête

    // Recherche de tous les messages non lus de l'utilisateur avec la clé spécifiée
    const unreadMessages = await UserMessage.find({
      clefUser: userKey,
      lusAdmin: false,
    });

    // Mettre à jour l'attribut lusUser à true pour les messages non lus de l'utilisateur
    await UserMessage.updateMany(
      { _id: { $in: unreadMessages.map((msg) => msg._id) } },
      { $set: { lusAdmin: true } }
    );

    res.status(200).json({
      message:
        "Les messages ont été marqués comme lus pour l'utilisateur spécifié.",
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour des messages :", error);
    res.status(500).json({
      error: "Une erreur est survenue lors de la mise à jour des messages.",
    });
  }
};

function getUserMessagesByClefUser(req, res) {
  const clefUser = req.params.id;

  UserMessage.find({ clefUser: clefUser })
    .then((userMessages) => {
      res.status(200).json(userMessages); // Répondre avec les messages correspondants à la clefUser
    })
    .catch((error) => {
      res.status(400).json({ error: error.message }); // En cas d'erreur, renvoyer un message d'erreur
    });
}

function deleteUserMessagesByClefUser(req, res) {
  const clefUser = req.params.id;

  UserMessage.deleteMany({ clefUser: clefUser })
    .then(() => {
      res.status(200).json({ message: "Messages supprimés avec succès." });
    })
    .catch((error) => {
      res.status(400).json({ error: error.message });
    });
}

function getAllUserMessages(req, res) {
  UserMessage.find()
    .then((userMessages) => {
      res.status(200).json(userMessages); // Répondre avec tous les messages
    })
    .catch((error) => {
      res.status(400).json({ error: error.message }); // En cas d'erreur, renvoyer un message d'erreur
    });
}

function deleteUserMessageById(req, res) {
  const messageId = req.params.id;

  UserMessage.findByIdAndDelete(messageId)
    .then((deletedMessage) => {
      if (deletedMessage) {
        res.status(200).json({ message: "Message supprimé avec succès." });
      } else {
        res.status(404).json({ message: "Message non trouvé." });
      }
    })
    .catch((error) => {
      res.status(400).json({ error: error.message });
    });
}

function updateUserMessageAttributeById(req, res) {
  const messageId = req.params.id;
  const data = req.body;

  UserMessage.findOneAndUpdate(
    { _id: messageId },
    { $set: data },
    { new: true }
  )
    .then((updatedUserMessage) => {
      if (updatedUserMessage) {
        res.status(200).json(updatedUserMessage);
      } else {
        res.status(404).json({ message: "Message non trouvé." });
      }
    })
    .catch((error) => {
      res.status(400).json({ error: error.message });
    });
}

const getUserByName = async (req, res) => {
  const name = req.params.name;

  try {
    const users = await User.find({
      name: { $regex: name, $options: "i" },
    });

    if (users.length === 0) {
      return res
        .status(404)
        .json({ message: "Aucun users trouvé pour ce nom" });
    }

    return res.json({ users });
  } catch (error) {
    console.error(
      "Une erreur s'est produite lors de la recherche des users par nom",
      error
    );
    return res.status(500).json({
      message:
        "Une erreur s'est produite lors de la recherche des users par nom",
    });
  }
};

function createCodePromo(req, res) {
  const { dateExpirate, prixReduiction, clefUser } = req.body;

  const newCodePromo = new PromoCode({
    code: generateCodeFromClefUser(clefUser),
    dateExpirate: dateExpirate,
    prixReduiction: prixReduiction,
    clefUser: clefUser,
    isValide: true,
  });

  newCodePromo
    .save()
    .then((savedCodePromo) => {
      res
        .status(201)
        .json({ data: savedCodePromo, message: "bon creer avec succes." });
    })
    .catch((error) => {
      res.status(400).json({ error: error.message });
    });
}

function updateCodePromo(req, res) {
  const { codePromoId, isValide } = req.body;

  PromoCode.findByIdAndUpdate(
    codePromoId,
    // { isValide: isValide, isWelcomeCode: isValide },
    { isValide: isValide },

    { new: true }
  )
    .then((updatedCodePromo) => {
      if (!updatedCodePromo) {
        return res.status(404).json({ message: "Code promo non trouvé." });
      }
      res.status(200).json({
        data: updatedCodePromo,
        message: "Mise à jour du code promo effectuée avec succès.",
      });
    })
    .catch((error) => {
      res.status(400).json({ error: error.message });
    });
}

function deleteCodePromo(req, res) {
  const codePromoId = req.params.id;

  PromoCode.findByIdAndRemove(codePromoId)
    .then((deletedCodePromo) => {
      if (deletedCodePromo) {
        res.status(200).json({ message: "Code promo supprimé avec succès." });
      } else {
        res.status(404).json({ message: "Code promo non trouvé." });
      }
    })
    .catch((error) => {
      res.status(400).json({ error: error.message });
    });
}

function getCodePromoByClefUser(req, res) {
  const clefUser = req.params.clefUser;

  const code = generateCodeFromClefUser(clefUser);

  PromoCode.find({ clefUser: clefUser })
    .then((codePromos) => {
      if (!codePromos) {
        return res
          .status(404)
          .json({ message: "Aucun code promo trouvé pour cette clefUser." });
      }

      res.status(200).json({ data: codePromos, isValid: code });
    })
    .catch((error) => {
      res.status(500).json({ error: error.message });
    });
}
function getCodePromoById(req, res) {
  const id = req.params.id;

  PromoCode.findById(id)
    .then((codePromos) => {
      if (!codePromos) {
        return res
          .status(404)
          .json({ message: "Aucun code promo trouvé pour cette clefUser." });
      }

      res.status(200).json({ data: codePromos });
    })
    .catch((error) => {
      res.status(500).json({ error: error.message });
    });
}

function getCodePromoByHashedCode(req, res) {
  const welcom = req.query.welcom || null;
  const id = req.query.id || null;
  const hashedCode = req.query.hashedCode;
  // return;
  if (id !== null && welcom === "true") {
    PromoCode.findOne({ code: hashedCode, clefUser: id, isWelcomeCode: true })
      .then((codePromo) => {
        if (!codePromo) {
          return res
            .status(404)
            .json({ message: "Aucun code promo trouvé pour ce code haché." });
        }

        res.status(200).json({ data: codePromo });
      })
      .catch((error) => {
        res.status(500).json({ error: error.message });
      });
  } else {
    PromoCode.findOne({ code: hashedCode })
      .then((codePromo) => {
        if (!codePromo) {
          return res
            .status(404)
            .json({ message: "Aucun code promo trouvé pour ce code haché." });
        }

        res.status(200).json({ data: codePromo });
      })
      .catch((error) => {
        res.status(500).json({ error: error.message });
      });
  }
}

//   const getUserByEmail = async (req,res) => {
//     const data = req.query
//     // console.log(data);
//     try {
//     //   const user = await User.find({ email: { $in: ["abdoulrazak932@gmail.com", "abdoulrazak9323@gmail1.com"] } });
//     const user = await User.findOne({email:data.email})
//       if(!user){
//         const message = "l'utilisateur demander n'existe pas !";
//         return res.status(400).json({message})
//       }else{
//         bcrypt.compare(data.password,user.password).then(isPasswordValid=>{
//             if(isPasswordValid){
//                 const jeton = jwt.sign(
//                     {userId:user._id},
//                     praviteKey,
//                     {expiresIn:"24h"}
//                 )

//                 res.cookie('token', jeton, {
//                     httpOnly: true,
//                     secure: true,
//                     expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
//                 });

//                 const message = "utilisateur connecter.";
//                 return res.json({message:message,data:user,token:jeton})
//             }else{
//                 const message = "mot de passe incorrecte";
//                 return res.status(401).json({message:message})
//             }
//         }).catch(error=>{
//             const message = "l'utilisateur na pas pu etre connecte veuiller reesayer dans un instant !"
//             return res.status(500).json({message:message,data:error})
//         })

//       }
//     } catch (error) {
//       // Gérer les erreurs de recherche
//       throw new Error('Erreur lors de la recherche de l\'utilisateur par email');
//     }
//   };

// Ajoutez d'autres fonctions de contrôleur pour la mise à jour et la suppression des utilisateurs

const Send_email = async (req, res) => {
  // Récupérez les données du client depuis la requête
  const { senderEmail, subject, message, titel } = req.body;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "HabouNiger227@gmail.com",
      pass: "lctrgorwycvjrqcv",
    },
    tls: {
      rejectUnauthorized: false, // C'est ici que vous désactivez la vérification du certificat
    },
  });

  const htmlContent = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Document</title>
  </head>
  <body>
      <div>${titel}</div>
      <div>${message}</div>

  </body>
  </html>
  `;

  const mailOptions = {
    from: senderEmail,
    to: "HabouNiger227@gmail.com",
    subject: `${subject} : ${senderEmail}`,
    text: message,
    html: htmlContent,
  };
  console.log(senderEmail);

  transporter
    .sendMail(mailOptions)
    .then((info) => {
      res.status(200).json({ message: "E-mail envoyé avec succès!" });
    })
    .catch((error) => {
      res
        .status(500)
        .json({ error: "Erreur lors de l'envoi de l'e-mail.", data: error });
    });
};

const Send_email_freind = async (req, res) => {
  // Récupérez les données du client depuis la requête
  const { senderEmail, friendEmail, subject, message, clientName } = req.body;
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "HabouNiger227@gmail.com",
      pass: "lctrgorwycvjrqcv",
    },
    tls: {
      rejectUnauthorized: false, // C'est ici que vous désactivez la vérification du certificat
    },
  });

  const htmlContent = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Document</title>
      <style>
          body{
              text-align: center;
              width: 100%;
              height: auto;
              box-sizing: border-box;
          }
          nav{
              width: 100%;
              height: auto;
              background-color: #FF6969;
              padding: 10px 20px;
              font-family: 'Courier New', Courier, monospace;
              color: white;
              text-transform: uppercase;
              font-style: italic;
              text-align: left;
          }
          h3{
              color: #515C6F;
              text-align: center;
          }
          p{
              margin: 20px 8%;
          }
          .a{
              display: block;
              margin: 0px auto;
             margin-top: 50px;
             width: 120px;
              padding: 10px 12px;
              background-color: #FF6969;
              color: white;
              cursor: pointer;
              text-decoration: none;
              text-align: center;


          }
          ul{
              text-align: left;
              margin-top: 20px;
              color: #515C6F;
              list-style-type: none;
          }
      </style>
  </head>
  <body>
      <nav><h1>habou227</h1></nav>
      <h3>Vous venez d'etre inviter par votre ami : <br/>${senderEmail}</h3>
      <p>${message}</p>
      <a class="a" href="https://habou227.onrender.com">join habou227</a>

      <ul>
          <li>habou227.onrender.com</li>
          <li>+227 87727501</li>
          <li>Niamey/Niger</li>
      </ul>
  </body>
  </html>
  `;

  // Envoyer l'e-mail à l'adresse de l'ami du client
  const mailOptionsToFriend = {
    from: `${clientName} <${senderEmail}>`,
    to: friendEmail,
    // subject: `${subject} (Invitation de ${senderEmail})`,
    subject: `${subject} (Invitation)`,
    text: message,
    html: htmlContent,
  };

  // Envoyer une copie de l'e-mail à vous-même ou une autre adresse de votre choix (facultatif)
  const mailOptionsToYourself = {
    from: `${clientName} <${senderEmail}>`,
    to: "HabouNiger227@gmail.com",
    subject: `${subject} (Copie de l'invitation de ${senderEmail} envoyée à ${friendEmail})`,
    text: message,
    html: htmlContent,
  };

  transporter.sendMail(mailOptionsToFriend, (error, info) => {
    if (error) {
      console.error("Erreur lors de l'envoi de l'e-mail à l'ami :", error);
      res
        .status(500)
        .json({ error: "Erreur lors de l'envoi de l'e-mail à l'ami." });
    } else {
      // console.log("E-mail envoyé à l'ami :", info.response);
      // Envoyer la copie de l'e-mail à vous-même ou à une autre adresse (facultatif)
      transporter.sendMail(mailOptionsToYourself, (error, info) => {
        if (error) {
          console.error(
            "Erreur lors de l'envoi de la copie de l'e-mail :",
            error
          );
        } else {
          // console.log("Copie de l'e-mail envoyée :", info.response);
        }
      });

      res.status(200).json({ message: "Invitation envoyée avec succès!" });
    }
  });
};

async function requetteGet(req, res) {
  try {
    const authToken = "sk_ef56606cf6f3420bbf844fe60d06b6c0";
    const requestOptions = {
      url: `https://i-pay.money/api/v1/payments`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        "Ipay-Payment-Type": "mobile",
        "Ipay-Target-Environment": "live",
        Accept: "*/*",
      },
    };

    const postResponse = await axios.get(requestOptions.url, {
      headers: requestOptions.headers,
    });

    return res.status(200).json({
      message: "Requête effectuée avec succès",
      data: postResponse.data ? postResponse.data : "",
    });
  } catch (error) {
    if (error.response) {
      // Si une réponse a été reçue du serveur avec un code d'erreur, renvoyer le code et le message d'erreur
      return res
        .status(error.response.status)
        .json({ message: error.response.data, error });
    } else {
      // Si aucune réponse n'a été reçue du serveur, renvoyer un message d'erreur générique
      return res.status(500).json({
        message: "Erreur lors de la requête au serveur de paiement",
      });
    }
  }
}

async function requette(req, res) {
  try {
    // console.log(req.body);
    const dataToSend = {
      customer_name: req.body.name,
      currency: "XOF",
      country: "NE",
      amount: req.body.total,
      transaction_id: req.body.transaction_id,
      msisdn:
        req.body.choix === "master Card" || req.body.choix === "Visa"
          ? req.body.numeroCard
          : req.body.phone,
    };
    const authToken = "sk_ef56606cf6f3420bbf844fe60d06b6c0";
    const requestOptions = {
      method: "post",
      url: "https://i-pay.money/api/v1/payments",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        "Ipay-Payment-Type":
          req.body.choix === "master Card" || req.body.choix === "Visa"
            ? "card"
            : "mobile",
        "Ipay-Target-Environment": "live",
        Accept: "*/*",
      },
      data: dataToSend,
    };

    const postResponse = await axios.post(
      requestOptions.url,
      requestOptions.data,
      { headers: requestOptions.headers }
    );

    // Vérifier si la réponse du serveur est valide (200 OK)
    if (postResponse.status === 200) {
      // Si la requête POST réussit, retourner un statut 200 avec un message
      // console.log({ response: postResponse });
      return res.status(200).json({
        message: "Paiement effectué avec succès",
        data: postResponse.data ? postResponse.data : "",
      });
    } else {
      // Si le serveur renvoie un autre code de statut, renvoyer un message d'erreur
      console.error(
        "Réponse du serveur avec un statut inattendu :"
        // postResponse.status
      );
      return res.status(500).json({
        message: "Erreur interne du serveur lors du paiement",
        data: postResponse.response ? postResponse.response : "",
      });
    }
  } catch (error) {
    // Si une erreur se produit pendant le processus, envoyer un statut d'erreur et un message d'erreur approprié
    // console.log({ error });
    console.error("Erreur lors de la requête :", error.message);
    if (error.response) {
      // Si une réponse a été reçue du serveur avec un code d'erreur, renvoyer le code et le message d'erreur
      return res
        .status(error.response.status)
        .json({ message: error.response.data });
    } else {
      // Si aucune réponse n'a été reçue du serveur, renvoyer un message d'erreur générique
      return res.status(500).json({
        message: "Erreur lors de la requête au serveur de paiement",
      });
    }
  }
}

const createCommande2 = async (data) => {
  console.log("command", data);
  // try {
  //   const commande = new Commande({
  //     clefUser: data.clefUser,
  //     nbrProduits: data.nbrProduits,
  //     prix: data.prix,
  //     codePro: data.codePro,
  //     idCodePro: data.idCodePro,
  //     reference: data.reference,
  //   });

  //   await commande.save();

  //   return true; // Indique que la commande a été créée avec succès
  // } catch (error) {
  //   console.error("Erreur lors de la création de la commande:", error);
  //   return false; // Indique que la commande n'a pas pu être créée
  // }
};

// Route pour le callback de paiement

// Ex: Backend Endpoint to Generate Payment Page

const generate_payment_page = async (req, res) => {
  try {
    const { total, transaction_id, redirect_url, callback_url } = req.body;
    const publicKey = "pk_f83a240bd0df4393b35a819925863e16"; // Assurez-vous de sécuriser cette clé
    const paymentPageHTML = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Paiement</title>
      </head>
      <body>
        <h2>Veuillez procéder au paiement pour finaliser votre commande.</h2>
        <button
          type="button"
          class="ipaymoney-button"
          data-amount="${total}"
          data-environement="live"
          data-key="${publicKey}"
          data-transaction-id="${transaction_id}"
          data-redirect-url="${redirect_url}"
          data-callback-url="${callback_url}"
        >
          Paiement
        </button>
        <script src="https://i-pay.money/checkout.js"></script>
      </body>
      </html>
    `;

    // Retourne la page HTML avec le SDK intégré pour le paiement
    res.send(paymentPageHTML);
  } catch (error) {
    res.status(500).json({
      message: "Erreur lors de la génération de la page de paiement",
      error,
    });
  }
};

// Route pour la redirection après un paiement réussi
// const payment_callback = async (req, res) => {
//   const { transactionId, status, amount } = req.body;
//   console.log(req.body);
//   // Exemple de vérification du statut de paiement
//   if (status === "success") {
//     console.log(
//       `Paiement réussi pour la transaction ${transactionId} avec montant ${amount}`
//     );
//     // Logique pour le succès du paiement, comme mise à jour de la base de données
//   } else {
//     console.log(`Paiement échoué pour la transaction ${transactionId}`);
//     // Logique pour l'échec du paiement
//   }

//   // Répondre à iPaymoney pour accuser réception
//   return res.status(200).json({ message: "Callback reçu", data: req.body });
// };
const payment_callback = async (req, res) => {
  {
    try {
      const {
        status, // Statut du paiement (succeeded/failed)
        customerName, // Nom du client
        msisdn, // Numéro de téléphone
        reference, // Référence iPay
        publicReference, // Référence publique iPay
        externalReference, // Notre référence de transaction
        amount, // Montant payé
        paymentDate, // Date du paiement
        failureReason,
        paymentMethod,
        webhookPayload,
      } = req.body;

      console.log("Callback PAYMENT reçu:", req.body);

      const searchReference = externalReference || reference || publicReference;
      const normalizedStatus = String(status || "")
        .trim()
        .toLowerCase();

      // Vérifier que la commande existe avec notre référence (recherche déterministe)
      const commandes = await Commande.find({
        $or: [
          { reference: externalReference },
          { "paymentDetails.externalReference": externalReference },
          { reference: searchReference },
          { "paymentDetails.externalReference": searchReference },
          { "paymentDetails.reference": reference },
          { "paymentDetails.publicReference": publicReference },
        ],
      }).sort({ date: -1, _id: -1 });

      const commande =
        commandes.find((item) => item.reference === externalReference) ||
        commandes.find((item) => item?.paymentDetails?.externalReference === externalReference) ||
        commandes.find((item) => ["en_attente", "en cours", "en attente"].includes(String(item.statusPayment || "").toLowerCase())) ||
        commandes.find((item) => item.reference === searchReference) ||
        commandes[0];

      if (!commande) {
        console.error(
          "Commande non trouvée pour la transaction:",
          searchReference
        );
        return res.status(200).json({
          message: "Commande non trouvée",
        });
      }

      // Mettre à jour le statut de la commande
      const isSuccessfulPayment = ["succeeded", "success", "paid", "completed"].includes(normalizedStatus);

      if (isSuccessfulPayment) {
        const updatedCommande = await Commande.findOneAndUpdate(
          { _id: commande._id },
          {
            $set: {
              statusPayment: "payé",
              paymentDetails: {
                customerName,
                msisdn,
                reference, // Référence iPay
                publicReference, // Référence publique iPay
                externalReference, // Référence commande interne
                paymentDate,
                amount,
                paymentMethod,
                failureReason: null,
                webhookPayload,
              },
            },
          },
          { new: true }
        );

        emitPaymentStatusUpdate(req, commande, {
          status: "succeeded",
          statusPayment: "payé",
          customerName,
          msisdn,
          reference,
          publicReference,
          externalReference,
          paymentDate,
          amount,
        });

        // Si un code promo a été utilisé
        if (commande.codePro && commande.idCodePro) {
          await PromoCode.findByIdAndUpdate(commande.idCodePro, {
            isValide: false,
          });
        }

        console.log("Paiement réussi pour la transaction", {
          externalReference,
          commandeId: commande._id,
          commandeReference: commande.reference,
          previousStatusPayment: commande.statusPayment,
          persistedStatusPayment: updatedCommande?.statusPayment,
        });
        res.status(200).json({ message: "Paiement traité avec succès" });
      } else {
        // En cas d'échec
        const updatedCommande = await Commande.findOneAndUpdate(
          { _id: commande._id },
          {
            $set: {
              statusPayment: "échec",
              paymentDetails: {
                customerName,
                msisdn,
                reference,
                publicReference,
                externalReference,
                paymentDate,
                amount,
                paymentMethod,
                failureReason: failureReason || null,
                failureDetails: req.body,
                webhookPayload,
              },
            },
          },
          { new: true }
        );

        emitPaymentStatusUpdate(req, commande, {
          status: "failed",
          statusPayment: "échec",
          customerName,
          msisdn,
          reference,
          publicReference,
          externalReference,
          paymentDate,
          amount,
          failureDetails: req.body,
        });

        console.log("Paiement échoué pour la transaction", {
          externalReference,
          commandeId: commande._id,
          previousStatusPayment: commande.statusPayment,
          persistedStatusPayment: updatedCommande?.statusPayment,
        });
        res.status(200).json({ message: "Échec du paiement enregistré" });
      }
    } catch (error) {
      console.error("Erreur dans le callback iPay:", error);
      // Toujours renvoyer 200 pour iPay
      res.status(200).json({
        message: "Erreur lors du traitement du paiement",
      });
    }
  }
};

const payment_callback2 = async (req, res) => {
  try {    
    console.log({callbackData2: req.body});

    const webhookData = req.body?.data || req.body || {};

    return payment_callback(
      {
        body: {
          status: webhookData.status,
          customerName: webhookData.customer_name,
          msisdn: webhookData.msisdn,
          reference: webhookData.reference,
          publicReference: webhookData.public_reference,
          externalReference: webhookData.external_reference,
          amount: webhookData.amount,
          paymentDate: webhookData.validated_at,
          failureReason: webhookData.failure_reason,
          paymentMethod: webhookData.payment_method,
          webhookPayload: webhookData,
        },
        app: req.app,
      },
      res
    );
  } catch (error) {
    console.error("Erreur dans le callback iPay:", error);
    res.status(200).json({
      message: "Erreur lors du traitement du paiement",
    });
  }

};

// Route pour mettre à jour la référence d'une commande
const updateCommanderef = async (req, res) => {
  const StockService = require('./services/stockService');
  const mongoose = require('mongoose');

  // Démarrer une transaction
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      const {
        oldReference,
        newReference,
        livraisonDetails,
        prod,
        statusPayment,
      } = req.body;
      data = req.body;

      // Vérifier que la commande existe avec l'ancienne référence
      const commande = await Commande.findOne({ reference: oldReference }).session(session);
      if (!commande) {
        console.error("Commande non trouvée pour la référence:", oldReference);
        throw new Error("Commande non trouvée");
      }

      // Sauvegarder l'ancien état des produits pour la gestion du stock
      const oldNbrProduits = commande.nbrProduits;

      // Vérifier que c'est bien le même utilisateur (sécurité)
      if (data.clefUser && commande.clefUser && String(data.clefUser) !== String(commande.clefUser)) {
        console.warn(`⚠️ Tentative de mise à jour de commande par un autre utilisateur. Order: ${oldReference}, ReqUser: ${data.clefUser}, OrderUser: ${commande.clefUser}`);
        throw new Error("Vous n'êtes pas autorisé à modifier cette commande");
      }

      // 2. Traiter le code promo pour la mise à jour
      let subtotal = data.prixTotal || data.prix;
      let shipping = data.fraisLivraison || 0;
      let finalPrice = subtotal + shipping;
      let finalReduction = data.reduction || 0;

      // Restaurer l'usage de l'ancien code s'il existait
      if (commande.idCodePro) {
        console.log('♻️ Restauration de l\'ancien usage du code promo:', commande.idCodePro);
        await promoCodeController.restorePromoUsage(commande.idCodePro, commande._id, { session });
      }

      let promoResult = null;
      if (data.idCodePro) {
        console.log('🎫 Re-validation du code promo pour mise à jour:', data.idCodePro);
        try {
          const userId = data.clefUser || null;
          
          promoResult = await promoCodeController.applyPromoToOrder(
            data.idCodePro,
            subtotal,
            userId,
            { session, orderId: null }
          );
          
          if (promoResult.success && promoResult.promoCode) {
            finalReduction = promoResult.discount;
            finalPrice = subtotal - finalReduction + shipping;
            console.log('✅ Code promo migré/mis à jour. Réduction:', finalReduction);
          } else {
            console.warn('⚠️ Code promo rejeté lors de la mise à jour:', promoResult.message);
            finalPrice = subtotal - finalReduction + shipping;
          }
        } catch (error) {
          console.error('Erreur promo mise à jour:', error);
          finalPrice = subtotal - finalReduction + shipping;
        }
      } else {
        finalPrice = subtotal - finalReduction + shipping;
      }

      // Valider la disponibilité du stock pour les nouveaux produits
      console.log('🔍 Validation du stock pour la mise à jour de commande...');
      const stockValidation = await StockService.validateStockAvailability(data.nbrProduits);
      
      if (!stockValidation.valid) {
        const errors = stockValidation.invalidItems.map(item => item.error).join(', ');
        throw new Error(`Stock insuffisant: ${errors}`);
      }

      // Mettre à jour la commande
      const dataUpdate = {
        clefUser: data.clefUser,
        nbrProduits: data.nbrProduits,
        prix: finalPrice, // Total final
        prixTotal: subtotal, // Sous-total
        fraisLivraison: shipping,
        reduction: finalReduction,
        codePro: data.idCodePro ? true : Boolean(data.codePro),
        idCodePro: data.idCodePro,
        codePromo: (data.idCodePro && promoResult && promoResult.promoCode) ? promoResult.promoCode.code : (commande.codePromo || null),
        reference: newReference,
        livraisonDetails: livraisonDetails,
        prod: prod,
        // IMPORTANT: Réinitialiser le statusPayment lors d'une mise à jour (relance de paiement)
        statusPayment: statusPayment || "en_attente",
      };
      
      console.log('📝 Mise à jour du statusPayment:', dataUpdate.statusPayment);

      await Commande.findOneAndUpdate({ reference: oldReference }, dataUpdate, { session });

      // Enregistrer le nouvel usage
      if (data.idCodePro && finalReduction > 0) {
        await promoCodeController.recordPromoUsage(
          data.idCodePro,
          subtotal,
          data.clefUser,
          commande._id,
          finalReduction,
          { session }
        );
      }

      // 3. Mettre à jour le stock (restaurer ancien + décrémenter nouveau)
      console.log('📦 Mise à jour du stock...');
      const stockResult = await StockService.decrementStock(
        data.nbrProduits, 
        { 
          session, 
          isUpdate: true, 
          oldNbrProduits 
        }
      );

      console.log("✅ Référence mise à jour et stock mis à jour:", { oldReference, newReference });
      
      // Sauvegarder le résultat pour la réponse
      req.updateResult = { stockResult };
    });

    const { stockResult } = req.updateResult;
    res.status(200).json({
      message: "Référence mise à jour avec succès et stock mis à jour",
      commande: {
        reference: req.body.newReference,
      },
      stockOperations: stockResult.operations
    });
    
  } catch (error) {
    console.error("❌ Erreur lors de la mise à jour de la référence:", error);
    res.status(500).json({
      message: "Erreur lors de la mise à jour de la référence",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
};

// const updateCommanderef = async (req, res) => {
//   try {
//     const {
//       oldReference,
//       newReference,
//       livraisonDetails,
//       prod,
//       statusPayment,
//     } = req.body;
//     console.log({ oldReference,
//       newReference,
//       livraisonDetails,
//       // prod,
//       statusPayment,});

//     const data = req.body;

//     // Vérifier que la commande existe avec l'ancienne référence
//     const commande = await Commande.findOne({ reference: oldReference });
//     if (!commande) {
//       console.error("Commande non trouvée pour la référence:", oldReference);
//       return res.status(404).json({
//         message: "Commande non trouvée",
//       });
//     }

//     // Gérer la réactivation des transactions si nécessaire
//     let reactivationResult = null;
//     try {
//       reactivationResult = await gererRelanceCommande(commande._id, newReference);
//     } catch (financialError) {
//       console.error("Erreur lors de la réactivation financière:", financialError);
//       // On continue même si la partie financière échoue
//     }

//     // Mettre à jour la référence de la commande
//     const dataUpdate = {
//       clefUser: data.clefUser,
//       nbrProduits: data.nbrProduits,
//       prix: data.prix,
//       codePro: data.codePro,
//       idCodePro: data.idCodePro,
//       reference: newReference,
//       livraisonDetails: livraisonDetails,
//       prod: prod,
//       statusLivraison: "en cours",
//       etatTraitement:"traitement"
//     };

//     // if (statusPayment && statusPayment === "payé à la livraison") {
//     //   dataUpdate.statusPayment = statusPayment;
//     // }

//     if (statusPayment) {
//   dataUpdate.statusPayment = statusPayment;
// }


//     await Commande.findOneAndUpdate({ reference: oldReference }, dataUpdate);

//     console.log("Référence mise à jour:", { oldReference, newReference });

//     // Réponse incluant les informations de réactivation
//     const response = {
//       message: "Référence mise à jour avec succès",
//       commande: {
//         reference: newReference,
//       }
//     };

//     if (reactivationResult && reactivationResult.count > 0) {
//       response.financialReactivation = reactivationResult;
//       response.message += ` et ${reactivationResult.count} transaction(s) réactivée(s)`;
//     }

//     res.status(200).json(response);

//   } catch (error) {
//     console.error("Erreur lors de la mise à jour de la référence:", error);
//     res.status(500).json({
//       message: "Erreur lors de la mise à jour de la référence",
//       error: error.message,
//     });
//   }
// };

// Route pour la redirection en cas d'échec de paiement

const updateEtatTraitement = async (req, res) => {
  try {
    const { commandeId } = req.params;
    const { nouvelEtat } = req.body;


    // Récupérer l'état actuel avant mise à jour
    const currentOrder = await Commande.findById(commandeId);
    if (!currentOrder) {
      return res.status(404).json({
        success: false,
        message: "Commande non trouvée",
      });
    }

    const ancienEtat = currentOrder.etatTraitement;

    // Préparer les champs de mise à jour
    const updateFields = { etatTraitement: nouvelEtat };

    // Si la commande est annulée, restaurer le stock
    if (nouvelEtat === "annulé") {
      console.log('🔄 Annulation de commande - Restauration du stock...');
      
      try {
        const StockService = require('./services/stockService');
        const stockResult = await StockService.incrementStock(currentOrder.nbrProduits);
        console.log('✅ Stock restauré avec succès:', stockResult.operations);
        
        updateFields.stockRestored = true;
        updateFields.stockRestorationDate = new Date();
      } catch (stockError) {
        console.error('❌ Erreur lors de la restauration du stock:', stockError);
        // On continue même si la restauration échoue
        updateFields.stockRestored = false;
        updateFields.stockRestorationError = stockError.message;
      }
    }

    // Mettre à jour l'état de la commande
    const updatedOrder = await Commande.findByIdAndUpdate(
      commandeId,
      updateFields,
      { new: true, runValidators: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({
        success: false,
        message: "Erreur lors de la mise à jour",
      });
    }
    // Gérer les transitions financières avec le nouveau système
    const { gererChangementEtatCommande } = require('./controllers/financeController');
    try {
      await gererChangementEtatCommande(commandeId, ancienEtat, nouvelEtat, updatedOrder);
    } catch (financialError) {
      console.error('❌ Erreur financière:', financialError);
    }

    // Gamification: restituer les points si annulation
    if (nouvelEtat === "annulé" && updatedOrder.clefUser) {
      try {
        const pointsService = require('./services/pointsService');
        await pointsService.revokeOrderPoints({ userId: updatedOrder.clefUser, orderId: updatedOrder._id });
        console.log('✅ Points restitués suite à l\'annulation (etatTraitement)');
      } catch (gErr) {
        console.error('⚠️ Gamification revokeOrderPoints (etatTraitement):', gErr.message);
      }
    }

    res.status(200).json({
      success: true,
      message: "État de traitement mis à jour avec succès",
      data: updatedOrder,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
const updateStatusLivraison = async (req, res) => {
  const StockService = require('./services/stockService');
  const mongoose = require('mongoose');

  try {
    const { commandeId } = req.params;
    const { nouveauStatus } = req.body;

    // Récupérer l'état actuel avant mise à jour
    const currentOrder = await Commande.findById(commandeId);
    if (!currentOrder) {
      return res.status(404).json({
        success: false,
        message: "Commande non trouvée",
      });
    }

    const ancienEtat = currentOrder.statusLivraison;
    const updateFields = { statusLivraison: nouveauStatus };

    if (nouveauStatus === "annule") {
      updateFields.statusPayment = "en cours";
    }

    // Si la commande est annulée, restaurer le stock et le code promo
    if (nouveauStatus === "Annulée" || nouveauStatus === "annulé") {
      console.log('🔄 Annulation de commande - Restauration du stock et promo...');
      
      try {
        // Restauration du stock
        const stockResult = await StockService.incrementStock(currentOrder.nbrProduits);
        console.log('✅ Stock restauré avec succès:', stockResult.operations);
        updateFields.stockRestored = true;
        updateFields.stockRestorationDate = new Date();

        // Restauration du code promo
        if (currentOrder.idCodePro) {
          const promoCodeController = require('./controllers/promoCodeController');
          await promoCodeController.restorePromoUsage(currentOrder.idCodePro, currentOrder._id);
        }
      } catch (error) {
        console.error('❌ Erreur lors de la restauration (stock/promo):', error);
        updateFields.stockRestored = false;
        updateFields.stockRestorationError = error.message;
      }
    }

    const commande = await Commande.findByIdAndUpdate(
      commandeId,
      updateFields,
      { new: true, runValidators: true }
    );

    if (!commande) {
      return res.status(404).json({
        success: false,
        message: "Commande non trouvée",
      });
    }

    // Gérer les transitions financières selon le nouveau statut
    if (nouveauStatus === "Annulée" || nouveauStatus === "annulé") {
      // Annulation: remboursement + restauration stock
      await handleFinancialTransitions(commandeId, ancienEtat, nouveauStatus, isDelete = true);

      // Gamification: retirer les points d'achat attribués à cette commande
      if (commande.clefUser) {
        try {
          const pointsService = require('./services/pointsService');
          await pointsService.revokeOrderPoints({ userId: commande.clefUser, orderId: commande._id });
          console.log('✅ Points d\'achat retirés suite à l\'annulation');
        } catch (gErr) {
          console.error('⚠️ Gamification revokeOrderPoints:', gErr.message);
        }
      }
    } else if (nouveauStatus === "livré") {
      // Livraison réussie: confirmer les transactions financières
      const { gererChangementEtatCommande } = require('./controllers/financeController');
      try {
        await gererChangementEtatCommande(commandeId, ancienEtat, nouveauStatus, commande);
        console.log('✅ Transactions confirmées pour livraison réussie');
      } catch (financialError) {
        console.error('❌ Erreur financière lors de la livraison:', financialError);
      }

      // Gamification: créditer les points d'achat + bonus 1ère commande + parrainage
      if (commande.clefUser) {
        try {
          const pointsService = require('./services/pointsService');
          const referralService = require('./services/referralService');
          const orderAmount = Math.max(0, (commande.prix || 0) - (commande.fraisLivraison || 0));

          // Points d'achat (avec multiplicateur de niveau)
          await pointsService.creditPurchasePoints({
            userId: commande.clefUser,
            orderAmountFcfa: orderAmount,
            orderId: commande._id,
          });

          // Bonus première commande (idempotent)
          await pointsService.creditFirstOrderBonus({
            userId: commande.clefUser,
            orderId: commande._id,
          });

          // Parrainage: si c'est la 1ère commande livrée du filleul
          await referralService.handleOrderDelivered({
            userId: commande.clefUser,
            orderId: commande._id,
          });

          console.log('✅ Points gamification crédités pour la livraison');
        } catch (gErr) {
          console.error('⚠️ Gamification creditPoints:', gErr.message);
        }
      }
    }

    res.status(200).json({
      success: true,
      data: commande,
      message: nouveauStatus === "Annulée" || nouveauStatus === "annulé"
        ? "Commande annulée et stock restauré"
        : "Statut de livraison mis à jour"
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};


// Fonction pour récupérer les commandes d'un client avec tous les détails
async function getClientOrdersWithFullDetails(clefUser) {
  try {
    const orders = await Commande.aggregate([
      // Filtrer par clefUser dès le début
      { $match: { clefUser } },

      // Dénormaliser les produits
      { $unwind: "$nbrProduits" },

      // Récupérer les informations des produits
      {
        $lookup: {
          from: "produits",
          localField: "nbrProduits.produit",
          foreignField: "_id",
          as: "productInfo",
        },
      },
      { $unwind: "$productInfo" },

      // Récupérer les informations des vendeurs
      {
        $lookup: {
          from: "users", // ou le nom de votre collection vendeurs
          localField: "productInfo.Clefournisseur",
          foreignField: "_id",
          as: "sellerInfo",
        },
      },
      { $unwind: { path: "$sellerInfo", preserveNullAndEmptyArrays: true } },

      // Regrouper par commande et organiser par vendeur
      {
        $group: {
          _id: "$_id",
          // Informations générales de la commande
          clefUser: { $first: "$clefUser" },
          reference: { $first: "$reference" },
          statusPayment: { $first: "$statusPayment" },
          statusLivraison: { $first: "$statusLivraison" },
          livraisonDetails: { $first: "$livraisonDetails" },
          prix: { $first: "$prix" },
          reduction: { $first: "$reduction" },
          date: { $first: "$date" },
          etatTraitement: { $first: "$etatTraitement" },

          // Regrouper les produits par vendeur
          sellers: {
            $push: {
              sellerId: "$productInfo.Clefournisseur",
              sellerName: "$sellerInfo.firstName", // Adaptez selon votre modèle
              sellerEmail: "$sellerInfo.email",
              product: {
                produitId: "$nbrProduits.produit",
                isValideSeller: "$nbrProduits.isValideSeller",
                quantite: "$nbrProduits.quantite",
                tailles: "$nbrProduits.tailles",
                couleurs: "$nbrProduits.couleurs",
                nom: "$productInfo.name",
                prix: "$productInfo.prix",
                prixPromo: "$productInfo.prixPromo",
                image: "$productInfo.image1",
                totalProduit: {
                  $multiply: [
                    "$nbrProduits.quantite",
                    {
                      $cond: {
                        if: { $gt: ["$productInfo.prixPromo", 0] },
                        then: "$productInfo.prixPromo",
                        else: "$productInfo.prix"
                      }
                    }
                  ]
                }
              }
            }
          },

          // Total général de la commande
          totalCommande: {
            $sum: {
              $multiply: [
                "$nbrProduits.quantite",
                {
                  $cond: {
                    if: { $gt: ["$productInfo.prixPromo", 0] },
                    then: "$productInfo.prixPromo",
                    else: "$productInfo.prix"
                  }
                }
              ]
            }
          }
        }
      },

      // Regrouper les vendeurs et calculer leurs totaux
      {
        $addFields: {
          sellersGrouped: {
            $map: {
              input: { $setUnion: ["$sellers.sellerId"] }, // Liste unique des vendeurs
              as: "sellerId",
              in: {
                sellerId: "$$sellerId",
                sellerName: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: "$sellers",
                        cond: { $eq: ["$$this.sellerId", "$$sellerId"] }
                      }
                    },
                    0
                  ]
                },
                products: {
                  $filter: {
                    input: "$sellers",
                    cond: { $eq: ["$$this.sellerId", "$$sellerId"] }
                  }
                },
                totalSeller: {
                  $sum: {
                    $map: {
                      input: {
                        $filter: {
                          input: "$sellers",
                          cond: { $eq: ["$$this.sellerId", "$$sellerId"] }
                        }
                      },
                      as: "item",
                      in: "$$item.product.totalProduit"
                    }
                  }
                }
              }
            }
          }
        }
      },

      // Lookup des transactions pour chaque vendeur
      {
        $lookup: {
          from: "transactionsellers",
          let: { commandeId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$commandeId", "$$commandeId"] },
                    { $eq: ["$type", "CREDIT_COMMANDE"] }
                  ]
                }
              }
            }
          ],
          as: "transactions"
        }
      },

      // Ajouter les informations de transaction à chaque vendeur
      {
        $addFields: {
          sellersWithTransactions: {
            $map: {
              input: "$sellersGrouped",
              as: "seller",
              in: {
                $mergeObjects: [
                  "$$seller",
                  {
                    transaction: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$transactions",
                            cond: { $eq: ["$$this.sellerId", "$$seller.sellerId"] }
                          }
                        },
                        0
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      },

      // Nettoyer et finaliser les données
      {
        $project: {
          _id: 1,
          clefUser: 1,
          reference: 1,
          statusPayment: 1,
          statusLivraison: 1,
          livraisonDetails: 1,
          prix: 1,
          reduction: 1,
          date: 1,
          etatTraitement: 1,
          totalCommande: 1,
          sellers: {
            $map: {
              input: "$sellersWithTransactions",
              as: "seller",
              in: {
                sellerId: "$$seller.sellerId",
                sellerName: "$$seller.sellerName.sellerName",
                sellerEmail: "$$seller.sellerName.sellerEmail",
                totalSeller: "$$seller.totalSeller",
                products: {
                  $map: {
                    input: "$$seller.products",
                    as: "prod",
                    in: "$$prod.product"
                  }
                },
                // Informations de transaction
                transactionStatus: {
                  $ifNull: ["$$seller.transaction.statut", "AUCUNE"]
                },
                montantNet: {
                  $ifNull: ["$$seller.transaction.montantNet", 0]
                },
                commission: {
                  $ifNull: ["$$seller.transaction.commission", 0]
                },
                estDisponible: {
                  $ifNull: ["$$seller.transaction.estDisponible", false]
                },
                dateDisponibilite: {
                  $ifNull: ["$$seller.transaction.dateDisponibilite", null]
                },
                transactionReference: {
                  $ifNull: ["$$seller.transaction.reference", null]
                }
              }
            }
          }
        }
      },

      { $sort: { date: -1 } }
    ]);

    return orders;
  } catch (error) {
    console.error("Erreur lors de la récupération des commandes du client:", error);
    throw error;
  }
}

// Fonction pour obtenir les statistiques d'achat d'un client
async function getClientPurchaseStatistics(clefUser, periode = 30) {
  try {
    const dateDebut = new Date();
    dateDebut.setDate(dateDebut.getDate() - periode);

    const [commandes, statistiques] = await Promise.all([
      Commande.find({
        clefUser,
        date: { $gte: dateDebut }
      }).sort({ date: -1 }),

      Commande.aggregate([
        { $match: { clefUser } },
        {
          $group: {
            _id: null,
            totalCommandes: { $sum: 1 },
            totalDepense: { $sum: "$prix" },
            moyenneCommande: { $avg: "$prix" },
            commandesLivrees: {
              $sum: {
                $cond: [{ $eq: ["$statusLivraison", "LIVRE"] }, 1, 0]
              }
            },
            commandesAnnulees: {
              $sum: {
                $cond: [{ $eq: ["$etatTraitement", "ANNULE"] }, 1, 0]
              }
            }
          }
        }
      ])
    ]);

    const stats = statistiques[0] || {
      totalCommandes: 0,
      totalDepense: 0,
      moyenneCommande: 0,
      commandesLivrees: 0,
      commandesAnnulees: 0
    };

    return {
      statistiques: stats,
      commandesRecentes: commandes.slice(0, 10),
      tauxLivraison: stats.totalCommandes > 0 ?
        (stats.commandesLivrees / stats.totalCommandes * 100).toFixed(2) : 0,
      tauxAnnulation: stats.totalCommandes > 0 ?
        (stats.commandesAnnulees / stats.totalCommandes * 100).toFixed(2) : 0
    };

  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques client:', error);
    throw error;
  }
}

// Controller mis à jour
const getCommandesByClefUser2 = async (req, res) => {
  try {
    const clefUser = req.params.clefUser;

    const [clientOrders, clientStats] = await Promise.all([
      getClientOrdersWithFullDetails(clefUser),
      getClientPurchaseStatistics(clefUser)
    ]);

    res.status(200).json({
      success: true,
      orders: clientOrders,
      statistics: clientStats
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des commandes client:', error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des commandes du client",
      error: error.message,
    });
  }
};


module.exports = {
  createUser,
  verifyToken,
  getUser,
  creatProfile,
  getUserProfile,
  createCommande,
  deleteCommandeById,
  createOrUpdateAddress,
  getAddressByUserKey,
  createMoyentPayment,
  getMoyentPaymentByClefUser,
  getCommandesByClefUser,
  getAllCommandes,
  getUsers,
  getUserProfiles,
  getAllAddressByUser,
  getCommandesById,
  createUserMessage,
  getUserMessagesByClefUser,
  deleteUserMessageById,
  updateUserMessageAttributeById,
  getUserByName,
  createCodePromo,
  getCodePromoById,
  getCodePromoByClefUser,
  deleteCodePromo,
  Send_email,
  Send_email_freind,
  getCodePromoByHashedCode,
  updateCodePromo,
  lecturUserMessage,
  getAllUserMessages,
  lecturAdminMessage,
  mettreAJourStatuts,
  requette,
  requetteGet,
  saveUserPushToken,
  generate_payment_page,
  payment_callback2,
  payment_callback,
  updateCommanderef,
  updateEtatTraitement,
  updateStatusLivraison,
  getCommandesByClefUser2,
  getCommandeByReference,
  getOrderPaymentStatus
  // getUsers,
  // getUserByEmail
};
