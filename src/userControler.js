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
const { Expo } = require('expo-server-sdk');
const mongoose = require("mongoose");
const axios = require("axios");
const fs = require("fs");
const cloudinary = require("cloudinary").v2;
const nodemailer = require("nodemailer");

cloudinary.config({
  cloud_name: "dkfddtykk",
  api_key: "577594384978177",
  api_secret: "kGQ99p3O0iFASZZHEmFelHPVt0I",
});

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
  const data = req.headers;
  const refreshToken = req.cookies;
  const message = "reusit!";
  // console.log(refreshToken);

  res.json({ data, message, ref: refreshToken });
  // console.log(data.authorization);
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
        const publicId = `images/${
          profile.image.split("/").pop().split(".")[0]
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

  try {
    const commande = new Commande({
      clefUser: data.clefUser,
      nbrProduits: data.nbrProduits,
      prix: data.prix,
      codePro: data.codePro,
      idCodePro: data.idCodePro,
      reference: data.reference,
    });

    await commande.save();

    const message = "Commande créée avec succès.";
    return res.json({ message });
  } catch (error) {
    const message = "Erreur lors de la création de la commande.";
    return res.status(500).json({ message, error });
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
    const commandes = await Commande.find();

    return res.json({ commandes });
  } catch (error) {
    const message = "Erreur lors de la récupération des commandes.";
    return res.status(500).json({ message, error });
  }
};

const deleteCommandeById = async (req, res) => {
  const commandeId = req.params.commandeId;

  try {
    const deletedCommande = await Commande.findByIdAndDelete(commandeId);

    if (!deletedCommande) {
      const message = "La commande spécifiée n'a pas été trouvée.";
      return res.status(404).json({ message });
    }

    const message = "La commande a été supprimée avec succès.";
    return res.json({ message });
  } catch (error) {
    const message = "Erreur lors de la suppression de la commande.";
    return res.status(500).json({ message, error });
  }
};

const mettreAJourStatuts = (req, res) => {
  const commandeId = req.params.commandeId;
  Commande.findOneAndUpdate(
    { _id: commandeId },
    { $set: { statusPayment: "recu", statusLivraison: "recu" } },
    { new: true }
  )
    .then((updatedCommande) => {
      if (updatedCommande) {
        res.status(200).json(updatedCommande);
      } else {
        res.status(404).json({ message: "Commande non trouvée" });
      }
    })
    .catch((error) => {
      res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour de la commande" });
    });
};

function createOrUpdateAddress(req, res) {
  const { clefUser, ...newAddressData } = req.body;

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
  const { date, message, clefUser, provenance } = req.body;

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
        console.error(`Push token ${user.pushToken} is not a valid Expo push token`);
        return res.status(201).json("message envoyé mais notification impossible");
      }

      // Préparer le message de notification
      const messages = [{
        to: user.pushToken,
        sound: 'default',
        title: 'IHAM Baobab message',
        body: message.length > 70 ? message.substring(0, 47) + '...' : message,
        data: {
          messageId: newUserMessage._id,
          clefUser: clefUser,
          provenance: provenance
        },
      }];

      try {
        // Envoyer les notifications en chunks (Expo recommande des chunks de 100 notifications max)
        const chunks = expo.chunkPushNotifications(messages);
        const tickets = [];

        for (let chunk of chunks) {
          try {
            const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
            tickets.push(...ticketChunk);
          } catch (error) {
            console.error('Erreur lors de l\'envoi des notifications:', error);
          }
        }

        console.log('Notifications envoyées:', tickets);
      } catch (error) {
        console.error('Erreur lors de la préparation des notifications:', error);
      }
    }

    res.status(201).json("message envoyé");

  } catch (error) {
    console.error('Erreur lors de la création du message:', error);
    res.status(400).json({ error: error.message });
  }
};

// Ajoutez cette fonction pour sauvegarder le token de notification
const saveUserPushToken = async (req, res) => {
  const { userId, pushToken } = req.body;
  console.log('oui1')

  try {
    // Vérifier si le token est valide
    if (!Expo.isExpoPushToken(pushToken)) {
      return res.status(400).json({ error: 'Token invalide' });
    }

    // Mettre à jour l'utilisateur avec le nouveau token
    await User.findByIdAndUpdate(userId, { pushToken: pushToken });

    res.status(200).json({ message: 'Token sauvegardé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la sauvegarde du token:', error);
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

function getCodePromoByHashedCode(req, res) {
  // const id = req.query.id;
  const hashedCode = req.query.hashedCode;
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
  saveUserPushToken
  // getUsers,
  // getUserByEmail
};
