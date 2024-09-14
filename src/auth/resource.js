const adminData = [
  {
    name: "John Doe",
    email: "john.doe@example.com",
    password: "Password123!",
    image: "https://example.com/image1.jpg",
    dateCreating: new Date("2022-01-01"),
  },
  {
    name: "Jane Smith",
    email: "jane.smith@example.com",
    password: "SecurePassword123!",
    image: "https://example.com/image2.jpg",
    dateCreating: new Date("2022-02-15"),
  },
  // Ajoutez d'autres données d'administrateur ici
];

const fournisseursData = [
  {
    name: "Fournisseur 1",
    email: "fournisseur1@example.com",
    numero: 12345678,
    region: "Region 1",
    ville: "Ville 1",
    quartier: "Quartier 1",
    dateCreating: new Date("2022-01-01"),
  },
  {
    name: "Fournisseur 2",
    email: "fournisseur2@example.com",
    numero: 87654321,
    region: "Region 2",
    ville: "Ville 2",
    quartier: "Quartier 2",
    dateCreating: new Date("2022-02-15"),
  },
  // Ajoutez d'autres données de fournisseurs ici
];

const produitData = [
  {
    name: "Produit 1",
    image1: "https://example.com/image1.jpg",
    image2: "https://example.com/image2.jpg",
    image3: "https://example.com/image3.jpg",
    marque: "Marque 1",
    quantite: 10,
    prix: 50,
    prixPromo: 0,
    description: "Lorem ipsum dolor sit amet...",
    taille: ["S", "M", "L"],
    couleur: ["Rouge", "Bleu"],
    ClefType: "Type 1",
    Clefournisseur: "Fournisseur 1",
    dateCreating: new Date("2022-01-01"),
  },
  {
    name: "Produit 2",
    image1: "https://example.com/image4.jpg",
    image2: "https://example.com/image5.jpg",
    image3: "https://example.com/image6.jpg",
    marque: "Marque 2",
    quantite: 5,
    prix: 100,
    prixPromo: 80,
    description: "Lorem ipsum dolor sit amet...",
    taille: ["M", "L", "XL"],
    couleur: ["Noir", "Blanc"],
    ClefType: "Type 2",
    Clefournisseur: "Fournisseur 2",
    dateCreating: new Date("2022-02-15"),
  },
  // Ajoutez d'autres données de produits ici
];

const typeProduitsData = [
  {
    name: "Type 1",
    clefCategories: "Categorie 1",
  },
  {
    name: "Type 2",
    clefCategories: "Categorie 2",
  },
  // Ajoutez d'autres données de types de produits ici
];

const userMessageData = [
  {
    date: new Date(),
    message: "Premier message",
    clefUser: "123456789",
  },
  {
    date: new Date(),
    message: "Deuxième message",
    clefUser: "987654321",
  },
  // Ajoutez d'autres données de messages utilisateur ici
];

const adminMessageData = [
  {
    date: new Date(),
    message: "Premier message",
    clefAdmin: "admin123",
  },
  {
    date: new Date(),
    message: "Deuxième message",
    clefAdmin: "admin456",
  },
  // Ajoutez d'autres données de messages admin ici
];

const carteBancaireData = [
  {
    numeroCarte: "1234567890123456",
    dateExpiration: new Date("2023-12-31"),
    cvc: "123",
    clefUser: "user123",
  },
  {
    numeroCarte: "9876543210987654",
    dateExpiration: new Date("2024-06-30"),
    cvc: "456",
    clefUser: "user456",
  },
  // Ajoutez d'autres données de cartes bancaires ici
];

const mobileMoneyData = [
  {
    numero: 12345678,
    operateur: "Orange",
    clefUser: "user123",
  },
  {
    numero: 98765432,
    operateur: "MTN",
    clefUser: "user456",
  },
  // Ajoutez d'autres données de mobile money ici
];

const paymentMethodeData = [
  {
    type: "Carte bancaire",
    clefMoyen: "carte123",
  },
  {
    type: "Mobile Money",
    clefMoyen: "mm456",
  },
  // Ajoutez d'autres données de méthode de paiement ici
];

const profileData = [
  {
    clefUser: "user123",
    clefMethodePayment: "payment456",
    numero: 12345678,
    image: "https://example.com/profile_image1.jpg",
  },
  {
    clefUser: "user456",
    clefMethodePayment: "payment789",
    numero: 98765432,
    image: "https://example.com/profile_image2.jpg",
  },
  // Ajoutez d'autres données de profil ici
];

const addressShippingData = [
  {
    region: "Region1",
    ville: "Ville1",
    quartier: "Quartier1",
    clefProfile: "profile123",
    description: "Description de l'adresse de livraison 1",
  },
  {
    region: "Region2",
    ville: "Ville2",
    quartier: "Quartier2",
    clefProfile: "profile456",
    description: "Description de l'adresse de livraison 2",
  },
  // Ajoutez d'autres données d'adresse de livraison ici
];

const commandeData = [
  {
    clefUser: "user123",
    nbrProduits: 3,
    statusPayment: "en cours",
    statusLivraison: "en cours",
    prix: 25000,
    idsProducts: ["product1", "product2", "product3"],
  },
  {
    clefUser: "user456",
    nbrProduits: 1,
    statusPayment: "validé",
    statusLivraison: "en cours",
    prix: 15000,
    idsProducts: ["product4"],
  },
  // Ajoutez d'autres données de commande ici
];

////////////////////////////// Ajout ////////////////////////////////////////////////
const express = require("express");
const multer = require("multer");
const fs = require("fs");

const app = express();
const upload = multer({ dest: "uploads/" }); // Spécifie le répertoire de destination pour les images

app.post("/upload", upload.single("image"), (req, res) => {
  // Gère l'upload de l'image
  const tempPath = req.file.path; // Chemin temporaire de l'image uploadée
  const targetPath = "uploads/" + req.file.originalname; // Chemin de destination final pour l'image

  // Vérifie si le répertoire de destination existe, sinon le crée
  if (!fs.existsSync("uploads/")) {
    fs.mkdirSync("uploads/");
  }

  // Déplace l'image du répertoire temporaire vers le répertoire de destination final
  fs.rename(tempPath, targetPath, (err) => {
    if (err) {
      console.error(err);
      res.status(500).send("Erreur lors du téléchargement de l'image.");
    } else {
      res.status(200).send("Image téléchargée avec succès.");
    }
  });
});

app.listen(3000, () => {
  console.log("Serveur en écoute sur le port 3000");
});

///////////////////////////////////////////// supprimer //////////////////////////////

const fs = require("fs");

// Chemin de l'image à supprimer
const imagePath = "uploads/nom_de_l_image.jpg";

// Vérifie si le fichier existe avant de le supprimer
fs.access(imagePath, fs.constants.F_OK, (err) => {
  if (err) {
    console.error(err);
    return;
  }

  // Supprime le fichier
  fs.unlink(imagePath, (err) => {
    if (err) {
      console.error(err);
      return;
    }

    console.log("Image supprimée avec succès.");
  });
});

////////////////////////////Modifier ////////////////////////////////////////

const fs = require("fs");
const multer = require("multer");

// Chemin de l'image d'origine à modifier
const imagePath1 = "uploads/nom_de_l_image.jpg";

// Configuration de Multer pour l'upload de la nouvelle image
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, "nouveau_nom_de_l_image.jpg");
  },
});

const upload1 = multer({ storage: storage }).single("image");

// Vérifie si le fichier d'origine existe avant de le supprimer
fs.access(imagePath, fs.constants.F_OK, (err) => {
  if (err) {
    console.error(err);
    return;
  }

  // Supprime le fichier d'origine
  fs.unlink(imagePath, (err) => {
    if (err) {
      console.error(err);
      return;
    }

    // Télécharge la nouvelle image en utilisant Multer
    upload(req, res, function (err) {
      if (err) {
        console.error(err);
        return;
      }

      console.log("Image modifiée avec succès.");
    });
  });
});

////////////////////////////////// Ajout Modifier  /////////////////////////////////////
const fs = require("fs");
const multer = require("multer");

// Fonction pour générer un nom de fichier unique avec la date et l'heure
function generateUniqueFileName(file) {
  const timestamp = Date.now();
  const fileName = file.originalname.replace(/\.([^.]+)$/, `_${timestamp}.$1`);
  return fileName;
}

// Configuration de Multer pour l'upload de la nouvelle image
const storage1 = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const fileName = generateUniqueFileName(file);
    cb(null, fileName);
  },
});

const upload2 = multer({ storage: storage }).single("image");

// ...

// Télécharge la nouvelle image en utilisant Multer
upload(req, res, function (err) {
  if (err) {
    console.error(err);
    return;
  }

  console.log("Image ajoutée avec succès.");
});

////////////////////////// dataform /////////////////////

// Création d'une instance de FormData
const formData = new FormData();

// Ajout de champs de formulaire
formData.append("nom", "John Doe");
formData.append("email", "johndoe@example.com");

// Ajout d'un fichier
const fileInput = document.getElementById("fileInput");
const file = fileInput.files[0];
formData.append("image", file);

// Envoi de la requête AJAX
const xhr = new XMLHttpRequest();
xhr.open("POST", "/url-de-votre-endpoint");
xhr.onreadystatechange = function () {
  if (xhr.readyState === XMLHttpRequest.DONE) {
    if (xhr.status === 200) {
      console.log("Requête réussie");
    } else {
      console.error("Erreur lors de la requête");
    }
  }
};
xhr.send(formData);



//////////////////////////////////////// bien ////////////////////////////////
Si vous souhaitez stocker l'image dans un dossier côté serveur à partir des données envoyées via FormData, vous pouvez utiliser une combinaison de Multer et du module fs (file system) en Node.js. Voici un exemple de code pour accomplir cela :

Installez les dépendances nécessaires :

npm install multer fs




const express = require('express');
const multer = require('multer');
const fs = require('fs');


Configurez Multer pour spécifier le
 dossier de destination des images et le nom de fichier unique pour éviter les collisions :




 const storage = multer.diskStorage({
    destination: 'chemin/vers/le/dossier/images',
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + '-' + uniqueSuffix);
    }
  });
  const upload = multer({ storage: storage });

  


  Définissez une route sur votre serveur pour gérer la requête d'envoi de l'image :




  const app = express();

app.post('/upload', upload.single('image'), (req, res) => {
  // Le fichier a été téléchargé et stocké avec succès
  res.status(200).json({ message: 'Image uploaded successfully' });
});





Assurez-vous d'ajuster le chemin vers le dossier d'images dans la configuration de Multer (destination) et d'utiliser le même nom de champ (image dans cet exemple) que celui utilisé dans votre formulaire de données.

Enregistrez le fichier sur le serveur en utilisant le module fs dans la route de téléchargement :










app.post('/upload', upload.single('image'), (req, res) => {
    // Le fichier a été téléchargé et stocké avec succès
    const file = req.file;
    const imagePath = file.path;
  
    // Déplacez le fichier vers le dossier final de destination
    const destinationPath = 'chemin/vers/le/dossier/final' + file.filename;
    fs.rename(imagePath, destinationPath, (err) => {
      if (err) {
        console.error('Erreur lors du déplacement du fichier', err);
        res.status(500).json({ error: 'Error uploading image' });
      } else {
        res.status(200).json({ message: 'Image uploaded successfully' });
      }
    });
  });

  












  Assurez-vous de spécifier le bon chemin vers le dossier final de destination où vous souhaitez stocker l'image.

Démarrez votre serveur Node.js et envoyez la requête depuis le client avec les données et l'image incluses dans le FormData. L'image sera téléchargée, stockée dans le dossier spécifié et renommée avec un nom de fichier unique.

Assurez-vous d'ajuster les chemins de dossier dans les configurations de Multer et dans la logique de déplacement du fichier selon votre structure de dossier et vos besoins spécifiques.



















plus d'explication sur cette partie :  const storage = multer.diskStorage({
    destination: 'chemin/vers/le/dossier/images',
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + '-' + uniqueSuffix);
    }
  });
  const upload = multer({ storage: storage });
  ChatGPT
  Bien sûr, voici une explication détaillée de cette partie du code :
  
  multer.diskStorage() est une fonction de Multer qui vous permet de spécifier le système de stockage des fichiers téléchargés. Dans cet exemple, nous utilisons diskStorage pour stocker les fichiers sur le disque.
  
  destination est la propriété qui spécifie le dossier de destination où les fichiers téléchargés doivent être enregistrés. Vous devez fournir le chemin absolu vers le dossier où vous souhaitez stocker les images.
  
  filename est une fonction qui vous permet de spécifier le nom du fichier. Dans cet exemple, nous utilisons une combinaison de l'horodatage actuel (obtenu via Date.now()) et d'un suffixe unique généré en utilisant Math.round(Math.random() * 1e9). Cela garantit que chaque fichier téléchargé aura un nom unique et évite les collisions de noms de fichiers. Le nom de fichier final est composé en concaténant le nom du champ d'envoi (file.fieldname) avec le suffixe unique.
  
  Une fois que vous avez configuré le système de stockage avec multer.diskStorage, vous créez une instance de multer en passant la configuration de stockage que vous avez définie. Cela crée un middleware Multer que vous pouvez utiliser pour gérer les téléchargements de fichiers.
  
  En résumé, cette partie du code configure Multer pour spécifier le dossier de destination des images téléchargées (destination) et génère un nom de fichier unique pour chaque fichier téléchargé (filename). L'instance de Multer créée est ensuite utilisée comme middleware pour gérer les téléchargements de fichiers dans votre route spécifiée.