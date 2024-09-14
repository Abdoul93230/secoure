const jwt = require("jsonwebtoken");

const privateKey = require("./clef");
const privateKeSeller = require("./clefSeller");
const ADMIN_PRIVATe_KEY = require("./clefAdmin");

const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
cloudinary.config({
  cloud_name: "dkfddtykk",
  api_key: "577594384978177",
  api_secret: "kGQ99p3O0iFASZZHEmFelHPVt0I",
});

const cloudinaryStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "images",
    format: async (req, file) => file.mimetype.split("/")[1], // Utilise le format MIME de l'image pour déterminer le format
    public_id: (req, file) => `${file.originalname}-${Date.now()}`,
  },
});

const storage = multer.diskStorage({
  filename: function (req, file, cb) {
    // Générez le nom de fichier souhaité ici
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileName = file.originalname + "-" + uniqueSuffix;
    cb(null, fileName);
  },
});

const upload = multer({ storage: storage });

const storage2 = multer.diskStorage({
  filename: function (req, file, cb) {
    if (file) {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random());

      cb(
        null,
        file.originalname + "-" + uniqueSuffix + "." + file.mimetype.slice(6)
      );
    }
  },
});

const upload2 = multer({
  storage: storage2,
  limits: {
    files: 8, // Limiter à 3 fichiers maximum
  },
});

const auth = (req, res, next) => {
  const authorizationHeader = req.headers.authorization;

  if (!authorizationHeader) {
    const message =
      "Vous n'avez pas fourni de jeton d'authentification. Ajoutez-en un dans l'en-tête de la requête.";
    return res.status(401).json({ message });
  }

  const token = authorizationHeader.split(" ")[1];
  try {
    const decodedToken = jwt.verify(token, privateKey, {
      ignoreExpiration: false,
    });
    const userId = decodedToken.userId;
    req.userId = userId;

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      // The access token has expired
      const refreshToken = req.cookies.refreshToken;

      if (!refreshToken) {
        const message = "Votre session a expiré. Veuillez vous reconnecter.";
        return res.status(400).json({ message });
      }

      try {
        const decodedRefreshToken = jwt.verify(refreshToken, privateKey);
        const userId = decodedRefreshToken.userId;
        req.userId = userId;

        // Generate a new access token
        const newAccessToken = jwt.sign({ userId }, privateKey, {
          expiresIn: "1h",
        });

        // Set the new access token in the response header
        res.set("Authorization", `Bearer ${newAccessToken}`);

        next();
      } catch (refreshError) {
        const message = "Erreur de vérification du token de rafraîchissement.";
        return res.status(400).json({ message, data: refreshError });
      }
    } else {
      // Another error occurred during token verification
      const message =
        "Erreur de vérification du token. Vous n'êtes pas autorisé à accéder à cette ressource.";
      return res.status(400).json({ message, data: error });
    }
  }
};

//////////////////////////////////////////////////////////////////////////////////////////////

const authAdmin = (req, res, next) => {
  const authorizationHeader = req.headers.authorization;

  if (!authorizationHeader) {
    const message =
      "Vous n'avez pas fourni de jeton d'authentification. Ajoutez-en un dans l'en-tête de la requête.";
    return res.status(401).json({ message });
  }

  const token = authorizationHeader.split(" ")[1];
  try {
    const decodedToken = jwt.verify(token, ADMIN_PRIVATe_KEY, {
      ignoreExpiration: false,
    });
    const userId = decodedToken.userId;
    req.userId = userId;

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      // The access token has expired
      const refreshToken = req.cookies.refreshAdminToken;

      if (!refreshToken) {
        const message = "Votre session a expiré. Veuillez vous reconnecter.";
        return res.status(400).json({ message });
      }

      try {
        const decodedRefreshToken = jwt.verify(refreshToken, ADMIN_PRIVATe_KEY);
        const userId = decodedRefreshToken.userId;
        req.userId = userId;

        // Generate a new access token
        const newAccessToken = jwt.sign({ userId }, ADMIN_PRIVATe_KEY, {
          expiresIn: "1h",
        });

        // Set the new access token in the response header
        res.set("Authorization", `Bearer ${newAccessToken}`);

        next();
      } catch (refreshError) {
        const message = "Erreur de vérification du token de rafraîchissement.";
        return res.status(400).json({ message, data: refreshError });
      }
    } else {
      // Another error occurred during token verification
      const message =
        "Erreur de vérification du token. Vous n'êtes pas autorisé à accéder à cette ressource.";
      return res.status(400).json({ message, data: error });
    }
  }
};

const authSeller = (req, res, next) => {
  const authorizationHeader = req.headers.authorization;

  if (!authorizationHeader) {
    const message =
      "Vous n'avez pas fourni de jeton d'authentification. Ajoutez-en un dans l'en-tête de la requête.";
    return res.status(401).json({ message });
  }

  const token = authorizationHeader.split(" ")[1];
  try {
    const decodedToken = jwt.verify(token, privateKeSeller);
    const userId = decodedToken.userId;
    req.userId = userId;

    next();
  } catch (error) {
    const message =
      "Erreur de vérification du token. Vous n'êtes pas autorisé à accéder à cette ressource.";
    return res.status(400).json({ message, error: error.message });
  }
};

module.exports = {
  auth,
  authAdmin,
  upload,
  upload2,
  authSeller,
};
