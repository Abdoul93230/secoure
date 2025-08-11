const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: false,
      unique: false,
      validate: {
        validator: function (value) {
          // Vérifier le format de l'e-mail uniquement si la valeur n'est pas null
          if (value === null || value === undefined) {
            return true; // La validation réussit pour null ou undefined
          }

          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          return emailRegex.test(value);
        },
        message: (props) =>
          `${props.value} n'est pas un format d'e-mail valide!`,
      },
    },
    password: {
      type: String,
      required: true,
      minlength: [
        4,
        "Le champ 'password' doit avoir une longueur minimale de 4 caractères",
      ],
    },
    phoneNumber: {
      type: String,
      unique: true,
      required: [false, "un Utilisateur peut ne pas avoir un numero"],
      validate: {
        validator: function (value) {
          // Permettre null ou undefined
          if (value === null || value === undefined || value === "") {
            return true;
          }

          // Valider le format des numéros de téléphone avec indicatif pays
          // Format accepté: +XXX suivi de 8 à 15 chiffres
          const phoneRegex = /^\+[1-9]\d{7,14}$/;
          return phoneRegex.test(value);
        },
        message: (props) =>
          `${props.value} n'est pas un format de numéro de téléphone valide! Format attendu: +XXX suivi de 8-15 chiffres`,
      },
    },
    whatsapp: {
      type: Boolean,
      default: false,
    },
    pushToken: {
      type: String,
      default: null,
    },
  },
  { strict: false }
);

const User = mongoose.model("User", userSchema);

const adminChema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      minlength: [2, "Le nom doit comporter au moins 2 caractères."],
    },
    email: {
      type: String,
      required: true,
      match: [/^\S+@\S+\.\S+$/, "Veuillez fournir une adresse email valide."],
    },
    password: {
      type: String,
      required: true,
      minlength: [8, "Le mot de passe doit comporter au moins 8 caractères."],
      validate: {
        validator: function (value) {
          return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/.test(
            value
          );
        },
        message:
          "Le mot de passe doit comporter au moins une lettre minuscule, une lettre majuscule, un chiffre et un caractère spécial.",
      },
    },
    image: {
      type: String,
      required: false,
      match: [
        /^(http|https):\/\/\S+$/,
        "Veuillez fournir une URL d'image valide.",
      ],
    },
    dateCreating: {
      type: Date,
      default: Date.now,
      required: false,
    },
  },
  { strict: false }
);
const Admin = mongoose.model("Admin", adminChema);

const fournisseursChema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      minlength: [2, "Le nom doit comporter au moins 2 caractères."],
    },
    email: {
      type: String,
      required: false,
      match: [/^\S+@\S+\.\S+$/, "Veuillez fournir une adresse email valide."],
      unique: [true, "ce Email existe deja"],
    },
    numero: {
      type: String,
      required: true,
      validate: {
        validator: function (value) {
          // Valider le format des numéros de téléphone avec indicatif pays
          const phoneRegex = /^\+[1-9]\d{7,14}$/;
          return phoneRegex.test(value);
        },
        message: (props) =>
          `${props.value} n'est pas un format de numéro de téléphone valide! Format attendu: +XXX suivi de 8-15 chiffres`,
      },
    },
    region: {
      type: String,
      required: true,
      minlength: [
        4,
        "Le nom de la region doit comporter au moins 4 caractères.",
      ],
    },

    quartier: {
      type: String,
      required: true,
      minlength: [
        3,
        "Le nom du quartier doit comporter au moins 4 caractères.",
      ],
    },
    image: {
      type: String,
      required: false,
      match: [
        /^(http|https):\/\/\S+$/,
        "Veuillez fournir une URL d'image valide.",
      ],
    },
    dateCreating: {
      type: Date,
      default: Date.now,
      required: false,
    },
  },
  { strict: false }
);

const Fournisseur = mongoose.model("Fournisseur", fournisseursChema);

const zoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      minlength: [2, "Le nom de la zone doit comporter au moins 2 caractères"],
    },
    code: { type: String, required: true, unique: true },
  },
  { strict: false }
);

const transporteurSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    contact: { type: String, required: true },
  },
  { strict: false }
);

const shippingOptionSchema = new mongoose.Schema(
  {
    originZoneId: { type: String, required: true },
    destinationZoneId: { type: String, required: true },
    baseFee: {
      type: Number,
      required: true,
      min: [0, "Les frais de base ne peuvent pas être négatifs"],
    },
    weightFee: {
      type: Number,
      required: true,
      min: [0, "Les frais au poids ne peuvent pas être négatifs"],
    },
    transporteurId: { type: String, required: true },
  },
  { strict: false }
);

const variantSchema = new mongoose.Schema({
  color: {
    type: String,
    required: true,
  },
  colorCode: {
    type: String,
    required: true,
  },
  sizes: [
    {
      type: String,
      required: true,
    },
  ],
  imageUrl: {
    type: String,
    required: false,
    match: [
      /^(http|https):\/\/\S+$/,
      "Veuillez fournir une URL d'image valide.",
    ],
  },
  stock: {
    type: Number,
    required: true,
    default: 2,
    min: [0, "Le stock ne peut pas être négatif"],
  },
});
// Sous-schéma pour les zones d'expédition
const shippingZoneSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Le nom de la zone est requis"],
  },
  transporteurId: {
    type: String,
    required: [true, "Le Id d'expedition est requis"],
  },
  transporteurName: {
    type: String,
    required: [true, "Le nom d'expedition est requis"],
  },
  transporteurContact: {
    type: Number,
    required: [true, "Le numero d'expedition est requis"],
  },
  baseFee: {
    type: Number,
    required: [true, "Les frais de base sont requis"],
    min: [0, "Les frais ne peuvent pas être négatifs"],
  },
  weightFee: {
    type: Number,
    required: [true, "Les frais au kilo sont requis"],
    default: 0,
    min: [0, "Les frais ne peuvent pas être négatifs"],
  },
});

const produitSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      minlength: [2, "Le nom doit comporter au moins 2 caractères."],
    },
    image1: {
      type: String,
      required: true,
      match: [
        /^(http|https):\/\/\S+$/,
        "Veuillez fournir une URL d'image valide.",
      ],
    },
    image2: {
      type: String,
      required: false,
      match: [
        /^(http|https):\/\/\S+$/,
        "Veuillez fournir une URL d'image valide.",
      ],
    },
    image3: {
      type: String,
      required: false,
      match: [
        /^(http|https):\/\/\S+$/,
        "Veuillez fournir une URL d'image valide.",
      ],
    },
    marque: {
      type: String,
      required: false,
      minlength: [
        0,
        "Le nom de la marque doit comporter au moins 3 caractères.",
      ],
    },
    quantite: {
      type: Number,
      required: true,
      min: [1, "Le minimum d'un produit est de 1"],
    },
    prix: {
      type: Number,
      required: true,
      min: [10, "Le minimum d'un produit est de 10fcfa."],
    },
    prixPromo: {
      type: Number,
      required: false,
      min: [0, "Le minimum de la reduction d'un produit est de 0fcfa."],
      default: 0,
    },
    prixf: {
      type: Number,
      required: false,
      min: [0, "Le minimum de la reduction d'un produit est de 0fcfa."],
      default: 0,
    },
    description: {
      type: String,
      required: true,
      minlength: [
        20,
        "La description d'un produit doit comporter au moins 20 caractères.",
      ],
    },
    dateCreating: {
      type: Date,
      default: Date.now,
      required: false,
    },
    variants: [variantSchema],
    // shippingOptions: [shippingOptionSchema],
    ClefType: {
      type: String,
      required: [
        true,
        "Un produit doit comporter la clef du type de produits auquel il appartient.",
      ],
    },
    Clefournisseur: {
      type: String,
      required: [true, "Un produit doit comporter la clef de son fournisseur."],
    },
    prixLivraison: {
      type: Number,
      required: false,
      default: 0,
    },
    pictures: {
      type: [String],
      required: false,
      validate: {
        validator: function (urls) {
          if (!urls || urls.length === 0) return true;
          const urlRegex = /^(http|https):\/\/\S+$/;
          return urls.every((url) => urlRegex.test(url));
        },
        message: "Veuillez fournir des URLs d'images valides.",
      },
    },
    // Informations d'expédition intégrées
    shipping: {
      origine: {
        type: String,
        required: [true, "La zone origine du produit est requis"],
      },
      weight: {
        type: Number,
        required: [true, "Le poids du produit est requis"],
        min: [0, "Le poids ne peut pas être négatif"],
      },
      dimensions: {
        length: { type: Number, default: 0 },
        width: { type: Number, default: 0 },
        height: { type: Number, default: 0 },
      },
      zones: [shippingZoneSchema],
      isPublished: {
        type: String,
        enum: ["Published", "UnPublished", "Attente", "Refuser"],
        default: "Published",
        required: false,
      },
      isDeleted: {
        type: Boolean,
        default: false, // Pour la suppression logique
        required: false,
      },
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        required: false,
      },
      userRole: {
        type: String,
        enum: ["admin", "seller"],
        required: false,
      },
      comments: {
        type: String,
        required: false,
      },
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        required: false,
      },
      isValidated: {
        type: Boolean,
        default: false,
      },
      validatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        required: false,
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
    },
    isValidated: {
      type: Boolean,
      default: false,
    },
    validatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
    },
    comments: {
      type: String,
      default: "Aucun commentaire",
    },
    isPublished: {
      type: String,
      enum: ["Published", "UnPublished", "Attente", "Refuser"],
      default: "Published",
      required: false,
    },
    isDeleted: {
      type: Boolean,
      default: false, // Pour la suppression logique
      required: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    }
  },
  { strict: false }
);

const Produit = mongoose.model("Produit", produitSchema);
////////////////////////////////////////////////////////////////////////////////required message///////////////////////////
const typeProduits = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "un Type de produit doit avoir un nom ."],
    minlength: [2, "Le nom du type doit comporter au moins 2 caractères."],
  },
  clefCategories: {
    type: String,
    required: [true, "le type de produit doit avoir une clef de categorie"],
  },
});

const TypeProduit = mongoose.model("TypeProduit", typeProduits);

const categorie = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "une categorie de produit doit avoir un nom ."],
      minlength: [
        2,
        "Le nom d'une categorie de produits doit comporter au moins 2 caractères.",
      ],
    },
    image: {
      type: String,
      required: true,
      match: [
        /^(http|https):\/\/\S+$/,
        "Veuillez fournir une URL d'image valide.",
      ],
    },
  },
  { strict: false }
);

const Categorie = mongoose.model("Categorie", categorie);

const userMessage = new mongoose.Schema(
  {
    date: {
      type: Date,
      default: Date.now,
      required: false,
      index: { expires: 60 * 60 * 24 * 14 },
    },
    message: {
      type: String,
      required: [true, "un message doit contenir un contenu"],
      minlength: [2, "Le message doit comporter au moins 2 caractères."],
    },
    messageType: {
      type: String,
      enum: ["text", "audio"],
      default: "text",
    },
    audioContent: {
      url: String,
      duration: Number,
    },
    clefUser: {
      type: String,
      required: [true, "un message doit comporter la clef de son créateur."],
    },
    provenance: {
      type: Boolean,
      default: true, //true==> client, false ==> admin
    },
    use: {
      type: Boolean,
      default: true,
    },
    ad: {
      type: Boolean,
      default: true,
    },
    lusUser: {
      type: Boolean,
      default: false,
    },
    lusAdmin: {
      type: Boolean,
      default: false,
    },
  },
  { strict: false }
);

const UserMessage = mongoose.model("UserMessage", userMessage);

const adminMessage = new mongoose.Schema(
  {
    date: {
      type: Date,
      default: Date.now,
      required: true,
    },
    message: {
      type: String,
      required: [true, "un message doit contenir un contenue"],
      minlength: [2, "Le message doit comporter au moins 2 caractères."],
    },
    clefAdmin: {
      type: String,
      required: [true, "un message doit comporter la cleft de sont createur."],
    },
  },
  { strict: false }
);

const AdminMessage = mongoose.model("AdminMessage", adminMessage);

const carteBancaire = new mongoose.Schema(
  {
    numeroCarte: {
      type: String,
      required: [true, "une carte bancaire doit comporter un numero"],
    },
    dateExpiration: {
      type: Date,
      required: [true, "une carte bancaire doit avoir une date d'expiration"],
    },
    cvc: {
      type: String,
      required: [true, "une carte bancaire doit avoir un code cvc"],
    },
    clefUser: {
      type: String,
      required: [
        true,
        "une carte Bancaire doit comporter la cleft de sont createur.",
      ],
    },
  },
  { strict: false }
);

const CarteBancaire = mongoose.model("CarteBancaire", carteBancaire);

const mobileMoney = new mongoose.Schema(
  {
    numero: {
      type: String,
      required: [true, "un mobileMoney doit avoir un numero"],
      validate: {
        validator: function (value) {
          // Valider le format des numéros de téléphone avec indicatif pays
          const phoneRegex = /^\+[1-9]\d{7,14}$/;
          return phoneRegex.test(value);
        },
        message: (props) =>
          `${props.value} n'est pas un format de numéro de téléphone valide! Format attendu: +XXX suivi de 8-15 chiffres`,
      },
    },
    operateur: {
      type: String,
      required: [true, "On doit connaitre l'operateur de votre numero"],
    },
    clefUser: {
      type: String,
      required: [
        true,
        "un mobileMoney doit comporter la cleft de sont createur.",
      ],
    },
  },
  { strict: false }
);

const MobileMoney = mongoose.model("MobileMoney", mobileMoney);

const paymentMethode = new mongoose.Schema(
  {
    type: {
      type: String,
      required: [true, "On doit connaitre type de moyent de payment."],
    },
    numeroCard: {
      type: Number,
      required: [false, "On doit connaitre type de moyent de payment."],
    },
    cvc: {
      type: String,
      required: [false, "On doit connaitre type de moyent de payment."],
    },
    phone: {
      type: String,
      required: [false, "On doit connaitre type de moyent de payment."],
    },
    expire: {
      type: Date,
      required: [false, "On doit connaitre type de moyent de payment."],
    },
    operateur: {
      type: String,
      required: [false, "On doit connaitre type de moyent de payment."],
    },
  },
  { strict: false }
);

const PaymentMethode = mongoose.model("PaymentMethode", paymentMethode);

const profile = new mongoose.Schema(
  {
    clefUser: {
      type: String,
      required: [true, "On doit connaitre la clef de ce Profile."],
    },
    clefMethodePayment: {
      type: String,
      required: [
        false,
        "On doit connaitre la clef de la methode de payment de ce Profile.",
      ],
    },
    numero: {
      type: String,
      required: [false, "un profile peut ne pas avoir un numero"],
      validate: {
        validator: function (value) {
          // Permettre null, undefined ou string vide
          if (value === null || value === undefined || value === "") {
            return true;
          }

          // Valider le format des numéros de téléphone avec indicatif pays
          const phoneRegex = /^\+[1-9]\d{7,14}$/;
          return phoneRegex.test(value);
        },
        message: (props) =>
          `${props.value} n'est pas un format de numéro de téléphone valide! Format attendu: +XXX suivi de 8-15 chiffres`,
      },
    },
    image: {
      type: String,
      // required: [true, "un profile doit avoir un image"],
      match: [
        /^(http|https):\/\/\S+$/,
        "Veuillez fournir une URL d'image valide.",
      ],
      default: "https://chagona.onrender.com/images/image-1688253105925-0.jpeg",
    },
  },
  { strict: true }
);

const Profile = mongoose.model("Profile", profile);

const adressShipping = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: false,
      unique: false,
      default: "default@gmail.com",
      validate: {
        validator: function (value) {
          // Vérifier le format de l'e-mail uniquement si la valeur n'est pas null
          if (value === null || value === undefined) {
            return true; // La validation réussit pour null ou undefined
          }
          // Expression régulière pour valider le format de l'e-mail
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          return emailRegex.test(value);
        },
        message: (props) =>
          `${props.value} n'est pas un format d'e-mail valide!`,
      },
    },
    region: {
      type: String,
      required: [true, "On doit connaitre le nom de la region de la livraison"],
      minlength: [
        4,
        "Le nom de la region doit comporter au moins 4 caractères.",
      ],
    },
    // ville: {
    //   type: String,
    //   required: [true, "On doit connaitre le nom de la ville de la livraison"],
    //   minlength: [
    //     4,
    //     "Le nom de la ville doit comporter au moins 4 caractères.",
    //   ],
    // },
    quartier: {
      type: String,
      required: [
        true,
        "On doit connaitre le nom du quartier pour la livraison",
      ],
      minlength: [
        2,
        "Le nom du quartier doit comporter au moins 2 caractères.",
      ],
    },
    numero: {
      type: String,
      required: [true, "un profile doit avoir un numero"],
      validate: {
        validator: function (value) {
          // Valider le format des numéros de téléphone avec indicatif pays
          const phoneRegex = /^\+[1-9]\d{7,14}$/;
          return phoneRegex.test(value);
        },
        message: (props) =>
          `${props.value} n'est pas un format de numéro de téléphone valide! Format attendu: +XXX suivi de 8-15 chiffres`,
      },
    },

    clefUser: {
      type: String,
      required: [true, "On doit connaitre la clef du Profile. a livrer"],
    },
    description: {
      type: String,
      required: false,
    },
  },
  { strict: false }
);

const AdressShipping = mongoose.model("AdressShipping", adressShipping);

const commandeSchema = new mongoose.Schema(
  {
    clefUser: {
      type: String,
      required: [
        true,
        "On doit connaître la clé du propriétaire de cette commande.",
      ],
    },
    date: {
      type: Date,
      default: Date.now,
    },
    nbrProduits: {
      type: [
        {
          produit: { type: mongoose.Schema.Types.ObjectId, required: true },
          quantite: { type: Number, required: true, min: 1 },
          tailles: { type: [String], required: false },
          couleurs: { type: [String], required: false },
          isValideSeller: { type: Boolean, required: false, default: false },
        },
      ],
      required: true,
      validate: {
        validator: function (value) {
          return Array.isArray(value) && value.length >= 1;
        },
        message: "La commande doit contenir au moins un produit.",
      },
    },

    statusPayment: {
      type: String,
      required: [
        false,
        "On doit connaître le statut de paiement de cette commande.",
      ],
      default: "en cours",
    },
    statusLivraison: {
      type: String,
      required: [
        false,
        "On doit connaître le statut de livraison de cette commande.",
      ],
      default: "en cours",
    },
    paymentDetails: {
      customerName: String,
      msisdn: String,
      reference: String, // Référence iPay
      publicReference: String, // Référence publique iPay
      paymentDate: Date,
      amount: Number,
      failureDetails: Object, // Détails complets en cas d'échec
    },
    livraisonDetails: {
      customerName: String,
      email: String,
      region: String, // Référence iPay
      quartier: String, // Référence publique iPay
      numero: String,
      description: String,
    },
    prix: {
      type: Number,
      required: false,
    },
    reduction: {
      type: Number,
      required: false,
      default: 0,
    },
    codePro: {
      type: Boolean,
      default: false,
    },
    idCodePro: {
      type: String,
      required: false,
    },
    traitement: {
      type: Boolean,
      default: false,
    },
    reference: {
      type: String,
      default: "none",
    },
    etatTraitement: {
      type: String,
      enum: [
        "traitement",
        "reçu par le livreur",
        "en cours de livraison",
        "livraison reçu",
        "Traité",
      ],
      default: "traitement",
      required: [
        true,
        "L'état de traitement de la commande doit être spécifié.",
      ],
    },
    prod: Object,
  },
  { strict: false }
);

const Commande = mongoose.model("Commande", commandeSchema);

const productComment = new mongoose.Schema(
  {
    description: {
      type: String,
      required: [true, "un commentaire doit avoir du contenut"],
    },
    userName: {
      type: String,
    },
    clefProduct: {
      type: String,
      required: [true, "On doit connaitre la clef du produit."],
    },
    clefType: {
      type: String,
      required: [true, "On doit connaitre la clef du type de produit."],
    },
    date: {
      type: Date,
      default: Date.now,
    },
    etoil: {
      type: Number,
      default: 5,
    },
  },
  { strict: false }
);

const ProductComment = mongoose.model("productComment", productComment);

const codepromo = new mongoose.Schema(
  {
    date: {
      type: Date,
      default: Date.now(),
    },
    code: {
      type: String,
      required: [true, "vous n'avez pas fournit de code promo."],
    },
    dateExpirate: {
      type: Date,
      required: [true, "vous avez pas fournit de date d'expiration."],
    },
    prixReduiction: {
      type: Number,
      required: [true, "vous avez pas fourni le prix de reduction."],
    },
    isValide: {
      type: Boolean,
      default: false,
    },
    clefUser: {
      type: String,
      required: [true, "vous avez pas fourni le cleUser de ce code."],
    },
    isWelcomeCode: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, strict: false }
);

const store = new mongoose.Schema(
  {
    date: {
      type: Date,
      default: Date.now(),
    },
    clefFournisseur: {
      type: String,
      required: [
        true,
        "vous avez pas  fourni le clefFournisseur de cette store",
      ],
    },
    name: {
      type: String,
      required: [true, "vous avez pas  fourni le nom de la boutique."],
    },
    slug: {
      type: String,
      required: [true, "vous avez pas  fourni le slug de la boutique."],
    },
    image: {
      type: String,
      required: false,
      match: [
        /^(http|https):\/\/\S+$/,
        "Veuillez fournir une URL d'image valide.",
      ],
    },
  },
  { strict: false }
);

const Store = mongoose.model("Store", store);

const productPub = new mongoose.Schema(
  {
    date: {
      type: Date,
      default: Date.now(),
    },
    pub: {
      type: Boolean,
      default: false,
    },
    clefCategorie: {
      type: String,
      required: [true, "vous avez pas  fourni le clefCategorie de cette pub"],
    },
    image: {
      type: String,
      required: true,
      match: [
        /^(http|https):\/\/\S+$/,
        "Veuillez fournir une URL d'image valide.",
      ],
    },
  },
  { strict: false }
);

const ProductPub = mongoose.model("ProductPub", productPub);

codepromo.statics.updateIsValideAsync = async function () {
  const currentDate = new Date();
  await this.updateMany(
    { dateExpirate: { $lt: currentDate } },
    { isValide: false }
  );
};

const PromoCode = mongoose.model("CodePromo", codepromo);

const sellerRequestSchema = new mongoose.Schema(
  {
    // Informations de base
    email: {
      type: String,
      required: false,
      unique: true,
      validate: {
        validator: (v) =>
          /^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(v),
        message: "Format d'email invalide",
      },
    },
    emailp: {
      type: String,
      required: false,
      unique: false,
      validate: {
        validator: function (value) {
          // Vérifier le format de l'e-mail uniquement si la valeur n'est pas null
          if (value === null || value === undefined) {
            return true; // La validation réussit pour null ou undefined
          }
          // Expression régulière pour valider le format de l'e-mail
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          return emailRegex.test(value);
        },
        message: (props) =>
          `${props.value} n'est pas un format d'e-mail valide!`,
      },
    },
    name: {
      type: String,
      required: true,
      minLength: [3, "Le nom doit contenir au moins 3 caractères"],
    },
    userName2: {
      type: String,
      required: true,
      minLength: [2, "Le prénom doit contenir au moins 2 caractères"],
    },
    password: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: (v) => /^\+[1-9]\d{7,14}$/.test(v),
        message: "Format de numéro de téléphone invalide",
      },
    },

    // Informations boutique
    storeName: {
      type: String,
      required: true,
      unique: true,
    },
    storeDescription: {
      type: String,
      required: true,
      minLength: [20, "La description doit contenir au moins 20 caractères"],
    },
    category: {
      type: String,
      required: true,
      enum: [
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
      ],
    },
    storeType: {
      type: String,
      required: true,
      enum: ["physique", "enligne", "hybride"],
    },

    // Localisation
    region: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    postalCode: String,

    // Contact et réseaux sociaux
    businessPhone: {
      type: String,
      required: true,
    },
    whatsapp: String,
    facebook: String,
    instagram: String,
    website: String,

    // Documents et média
    ownerIdentity: {
      type: String,
      required: true,
    },
    logo: String,

    // Informations opérationnelles
    openingHours: String,
    minimumOrder: String,
    isvalid: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },

    // Nouveaux champs pour les fonctionnalités sociales
    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // Référence à ton modèle d'utilisateur
      },
    ],
    followersCount: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 0,
    },
    reviewsCount: {
      type: Number,
      default: 0,
    },
    likesCount: {
      type: Number,
      default: 0,
    },
  },
  { strict: false }
);

const SellerRequest = mongoose.model("SellerRequest", sellerRequestSchema);

// Schéma pour les plans tarifaires
// Schéma pour les plans tarifaires
const pricingPlanSchema = new mongoose.Schema({
  // Référence au store
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SellerRequest",
    required: true,
  },

  // Type de plan
  planType: {
    type: String,
    required: true,
    enum: ["Starter", "Pro", "Business"],
  },

  // Informations générées automatiquement selon le type
  price: {
    monthly: {
      type: Number,
      required: true,
    },
    annual: {
      type: Number,
      required: true,
    },
  },
  commission: {
    type: Number,
    required: true,
  },
  productLimit: {
    type: Number,
    required: true,
  },

  // Fonctionnalités activées
  features: {
    productManagement: {
      maxProducts: Number,
      maxVariants: Number,
      maxCategories: Number,
      catalogImport: Boolean,
    },
    paymentOptions: {
      manualPayment: Boolean,
      mobileMoney: Boolean,
      cardPayment: Boolean,
      customPayment: Boolean,
    },
    support: {
      responseTime: Number,
      channels: [
        {
          type: String,
          enum: ["email", "chat", "phone", "vip"],
        },
      ],
      onboarding: String,
    },
    marketing: {
      marketplaceVisibility: {
        type: String,
        enum: ["standard", "prioritaire", "premium"],
      },
      maxActiveCoupons: Number,
      emailMarketing: Boolean,
      abandonedCartRecovery: Boolean,
    },
  },

  // Statut et dates
  status: {
    type: String,
    enum: ["active", "inactive", "pending"],
    default: "active",
  },
  startDate: {
    type: Date,
    default: Date.now,
  },
  endDate: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
  },
});

// Middleware pre-save
pricingPlanSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const PricingPlan = mongoose.model("PricingPlan", pricingPlanSchema);

const Zone = mongoose.model("Zone", zoneSchema);
const Transporteur = mongoose.model("Transporteur", transporteurSchema);
const transactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0, "Le montant ne peut pas être négatif"],
    },
    status: {
      type: String,
      enum: ["en_attente", "complete", "echec"],
      default: "en_attente",
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: [
        "Visa",
        "master Card",
        "Mobile Money",
        "zeyna",
        "nita",
        "amana",
        "Payment a domicile",
        "payé à la livraison",
      ],
    },
    orderId: {
      type: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { strict: false }
);

const Transaction = mongoose.model("Transaction", transactionSchema);

const likeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    produit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Produit",
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { strict: false }
);

// Index composé pour éviter les doublons de likes
likeSchema.index({ user: 1, produit: 1 }, { unique: true });

const Like = mongoose.model("Like", likeSchema);

module.exports = {
  User,
  Admin,
  Fournisseur,
  Produit,
  TypeProduit,
  Categorie,
  UserMessage,
  AdminMessage,
  CarteBancaire,
  MobileMoney,
  PaymentMethode,
  Profile,
  AdressShipping,
  Commande,
  ProductComment,
  PromoCode,
  ProductPub,
  Store,
  SellerRequest,
  Zone,
  Transporteur,
  PricingPlan,
  Transaction,
  Like,
};
