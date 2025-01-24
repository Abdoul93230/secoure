const { Fournisseur, Produit } = require("./Models");
const nodemailer = require("nodemailer");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: "dkfddtykk",
  api_key: "577594384978177",
  api_secret: "kGQ99p3O0iFASZZHEmFelHPVt0I",
});

const createFournisseur = async (req, res) => {
  try {
    const data = req.body;

    let picture = null;
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "images", // Le nom du dossier dans lequel vous souhaitez stocker les images
      });
      picture = result.secure_url;
    }

    const existingFournisseur = await Fournisseur.findOne({
      email: data.email,
    });
    if (existingFournisseur) {
      return res
        .status(400)
        .json({ message: "Cette adresse e-mail est déjà utilisée." });
    }
    let fournisseur;
    if (picture) {
      fournisseur = new Fournisseur({
        name: data.name,
        email: data.email,
        region: data.region,
        quartier: data.quartier,
        numero: data.phone,
        image: picture,
      });
    } else {
      fournisseur = new Fournisseur({
        name: data.name,
        email: data.email,
        region: data.region,
        quartier: data.quartier,
        numero: data.phone,
        image: picture,
      });
    }

    await fournisseur.save();
    const message = `Vous venez de créer le fournisseur : ${data.name}`;
    return res.json({ message: message });
  } catch (error) {
    return res.status(500).json({
      message: "Erreur lors de la création du fournisseur",
      error: error.message,
    });
  }
};

const getAll = (req, res) => {
  Fournisseur.find()
    .then((re) => {
      const message = "vous avez demander tous les founisseurs";
      return res.json({ message: message, data: re });
    })
    .catch((error) => {
      const message = "error lord de la recuperation des fournisseurs";
      return res.status(500).json({ message: message, data: error });
    });
};

const getByid = (req, res) => {
  const id = req.params.id;

  Fournisseur.findById(id)
    .then((re) => {
      const message = "vous avez demander le founisseur";
      return res.json({ message: message, data: re });
    })
    .catch((error) => {
      const message = "error lord de la recuperation du fournisseur";
      return res.status(500).json({ message: message, data: error });
    });
};

const searchProductBySupplier = async (req, res) => {
  const supplierId = req.params.supplierId;

  try {
    const products = await Produit.find({ Clefournisseur: supplierId });

    if (!products || products.length == 0) {
      return res
        .status(404)
        .json({ message: "Aucun produit trouvé pour ce fournisseur" });
    }

    return res.json({ data: products });
  } catch (error) {
    // console.error("Une erreur s'est produite lors de la recherche des produits par fournisseur", error);
    return res.status(500).json({
      message:
        "Une erreur s'est produite lors de la recherche des produits par fournisseur",
    });
  }
};

const sendmail = (req, res) => {
  const data = req.body;
  var transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "abdoulRazak9323@gmail.com",
      pass: "AbdoulRazak01",
    },
  });

  const mailOptions = {
    from: "abdoulRazak9323@gmail.com",
    to: data.email,
    subject: "Haboucom",
    text: "Ceci est un e-mail de test envoyé depuis Node.js avec Nodemailer.",
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      const message = "Erreur lors de l'envoi de l'e-mail :";
      return res.status(500).json({ message: message, data: error });
    } else {
      const message = "E-mail envoyé avec succès. Réponse du serveur :";
      return res.json({ message: message, data: info.response });
    }
  });
};

const updateFournisseur = async (req, res) => {
  try {
    const fournisseurId = req.params.id;
    const data = req.body;

    const existingFournisseur = await Fournisseur.findOne({
      _id: fournisseurId,
    });

    if (!existingFournisseur) {
      return res.status(404).json({ message: "Fournisseur non trouvé." });
    }

    let picture = null;
    if (req.file) {
      // If an existing image exists, delete it from Cloudinary first
      if (existingFournisseur.image) {
        // Extract the public ID from the existing image URL
        const publicId = existingFournisseur.image
          .split("/")
          .pop()
          .split(".")[0];
        await cloudinary.uploader.destroy(`images/${publicId}`);
      }

      // Upload new image
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "images",
      });
      picture = result.secure_url;
    }

    // Update fournisseur details
    existingFournisseur.name = data.name;
    existingFournisseur.email = data.email;
    existingFournisseur.region = data.region;
    existingFournisseur.quartier = data.quartier;
    existingFournisseur.numero = data.phone;

    if (picture) {
      existingFournisseur.image = picture;
    }

    await existingFournisseur.save();

    const message = `Le fournisseur ${existingFournisseur.name} a été mis à jour.`;
    return res.json({ message: message });
  } catch (error) {
    return res.status(500).json({
      message: "Erreur lors de la mise à jour du fournisseur",
      error: error.message,
    });
  }
};

const findFournisseurByName = async (req, res) => {
  try {
    const name = req.params.name;

    const fournisseur = await Fournisseur.find({
      name: { $regex: new RegExp(name, "i") },
    });

    if (!fournisseur) {
      return res.status(404).json({ message: "Fournisseur non trouvé." });
    }

    return res.json({ data: fournisseur });
  } catch (error) {
    return res.status(500).json({
      message: "Erreur lors de la recherche du fournisseur",
      error: error.message,
    });
  }
};

module.exports = {
  createFournisseur,
  getAll,
  getByid,
  searchProductBySupplier,
  sendmail,
  updateFournisseur,
  findFournisseurByName,
};
