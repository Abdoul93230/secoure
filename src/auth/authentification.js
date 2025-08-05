const { User, Admin } = require("../Models");
const praviteKey = require("../auth/clef");
const ADMIN_PRIVATe_KEY = require("./clefAdmin");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

/////////////////////fonction  loginUser et creation du jeton JWT///////////////////////

const login = async (req, res) => {
  const data = req.body;

  try {
    let user = null;
    
    // Nouveau format : on reçoit un 'identifier' qui peut être email ou téléphone avec indicatif
    if (data.identifier) {
      // Vérifier si c'est un email (contient @)
      if (data.identifier.includes('@')) {
        user = await User.findOne({ email: data.identifier });
      } else {
        // C'est un numéro de téléphone avec indicatif (ex: +22787727501)
        user = await User.findOne({ phoneNumber: data.identifier });
      }
    } else {
      // Format ancien : recherche par email ou phoneNumber séparés (rétrocompatibilité)
      if (data.email) {
        user = await User.findOne({ email: data.email });
      }
      // Si l'utilisateur n'est pas trouvé par email, recherche par numéro de téléphone
      if (!user && data.phoneNumber) {
        user = await User.findOne({ phoneNumber: data.phoneNumber });
      }
    }

    if (!user) {
      const message = "Cet email ou numéro de téléphone n'est pas enregistré !";
      return res.status(400).json({ message });
    }

    // Vérification du mot de passe
    const isValidPassword = await bcrypt.compare(data.password, user.password);

    if (!isValidPassword) {
      const message = "Votre mot de passe est incorrect !";
      return res.status(400).json({ message });
    }

    // Si tout est correct, générer le token JWT et gérer la réponse
    const jeton = jwt.sign({ userId: user._id, role: "user" }, praviteKey, {
      expiresIn: "7d",
    });
    const refreshToken = jwt.sign(
      { userId: user._id, role: "user" },
      praviteKey,
      {
        expiresIn: "30d",
      }
    );
    // Stockage du token dans un cookie avec l'attribut "HttpOnly"
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: false,
    });
    const message = "Connexion réussie !";
    return res.json({
      message,
      token: jeton,
      id: user._id,
      name: user.name,
    });
  } catch (error) {
    const message =
      "Désolé, la connexion n'a pas pu être établie. Veuillez réessayer !";
    res.status(500).json({ message, data: error });
  }
};

/////////////////////fin fonction  loginUser et creation du jeton JWT///////////////////////

/////////////////////fonction  loginUser et creation du jeton JWT///////////////////////

const AdminLogin = async (req, res) => {
  data = req.body;
  // const hash = await bcrypt.hash(data.password, 10);
  // console.log(hash);
  Admin.findOne({ email: data.email })
    .then((user) => {
      if (!user) {
        const message = "Cet Email N'est Pas Inscrit !";
        return res.status(400).json({ message: message });
      } else {
        bcrypt
          .compare(data.password, user.password)
          .then((isValidPassword) => {
            if (!isValidPassword) {
              const message = "votre mot de passe est incorrect !";

              return res.status(400).json({ message: message });
            } else {
              const jeton = jwt.sign(
                { userId: user._id, role: "admin" },
                ADMIN_PRIVATe_KEY,
                {
                  expiresIn: "1h",
                }
              );
              const refreshAdminToken = jwt.sign(
                { userId: user._id, role: "admin" },
                ADMIN_PRIVATe_KEY,
                {
                  expiresIn: "7d",
                }
              );
              // Stockage du token dans un cookie avec l'attribut "HttpOnly"
              res.cookie("refreshAdminToken", refreshAdminToken, {
                httpOnly: true,
                secure: false,
              });
              const message = "Connexion reusit !";
              return res.json({
                message: message,
                token: jeton,
                id: user._id,
                name: user.name,
              });
            }
          })
          .catch((error) => {
            const message =
              "desoler la connexion na pas pu etre etablit veuiller reessayer !";
            res.status(500).json({ message: message, data: error });
          });
      }
    })
    .catch((error) => {
      const message =
        "desoler la requette na pas pu etre etablit veuiller reessayer !";
      res.status(500).json({ message: message, data: error });
    });
};
/////////////////////fin fonction  loginUser et creation du jeton JWT///////////////////////

module.exports = {
  login,
  AdminLogin,
};
