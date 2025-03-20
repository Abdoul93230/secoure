require("dotenv").config();
const axios = require("axios");

const KOMIPAY_BASE_URL = process.env.KOMIPAY_BASE_URL;
const KOMIPAY_API_KEY = process.env.KOMIPAY_API_KEY;
const KOMIPAY_LOGIN = process.env.KOMIPAY_LOGIN;
const KOMIPAY_PASSWORD = process.env.KOMIPAY_PASSWORD;
const KOMIPAY_KEYPASS = process.env.KOMIPAY_KEYPASS;

// Vérification des variables d'environnement requises
function checkEnvironmentVariables() {
  const requiredVars = [
    "KOMIPAY_BASE_URL",
    "KOMIPAY_API_KEY",
    "KOMIPAY_LOGIN",
    "KOMIPAY_PASSWORD",
    "KOMIPAY_KEYPASS", // Nouvelle variable nécessaire pour les paiements par carte
  ];

  const missingVars = requiredVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    return {
      success: false,
      message: `Variables d'environnement manquantes: ${missingVars.join(
        ", "
      )}`,
      code: 500,
    };
  }

  return { success: true };
}

// Fonction pour générer un token d'authentification
async function generateToken() {
  const envCheck = checkEnvironmentVariables();
  if (!envCheck.success) {
    return envCheck;
  }

  try {
    const response = await axios.post(
      `https://www.komipay.com/APIs/mobile_money.php/generateToken`,
      {
        login: KOMIPAY_LOGIN,
        password: KOMIPAY_PASSWORD,
        api_key: KOMIPAY_API_KEY,
      },
      {
        timeout: 60000,
      }
    );

    if (response.data.code === 200) {
      return {
        success: true,
        token: response.data.token,
      };
    } else {
      return {
        success: false,
        message: `Erreur API KomiPay: ${
          response.data.message || "Erreur inconnue"
        } (code: ${response.data.code})`,
        code: response.data.code || 500,
      };
    }
  } catch (error) {
    if (error.response) {
      return {
        success: false,
        message: `Erreur serveur KomiPay: ${error.response.status} - ${
          error.response.data?.message || error.message
        }`,
        code: error.response.status || 500,
      };
    } else if (error.request) {
      return {
        success: false,
        message: `Erreur de connexion au serveur KomiPay: ${error.message}`,
        code: 503,
      };
    } else {
      return {
        success: false,
        message: `Erreur de configuration de la requête KomiPay: ${error.message}`,
        code: 400,
      };
    }
  }
}

// Fonction pour crypter le CVV
async function encryptCVV(cvv, token) {
  if (!token) {
    return {
      success: false,
      message: "Token d'authentification invalide ou manquant",
      code: 401,
    };
  }

  if (!cvv || cvv.length !== 3 || !/^\d{3}$/.test(cvv)) {
    return {
      success: false,
      message: "Le CVV doit être composé de 3 chiffres",
      code: 400,
    };
  }

  try {
    const response = await axios.post(
      `${KOMIPAY_BASE_URL}/crypt-cvv`,
      {
        api_key: KOMIPAY_API_KEY,
        cvv_number: cvv,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          keypass: KOMIPAY_KEYPASS,
        },
        timeout: 10000,
      }
    );

    if (response.data.code === 200 && response.data.statut === true) {
      return {
        success: true,
        encryptedCVV: response.data.cvv_encrpyt,
      };
    } else {
      return {
        success: false,
        message: `Erreur de cryptage du CVV: ${response.data.message}`,
        code: response.data.code || 500,
      };
    }
  } catch (error) {
    if (error.response) {
      return {
        success: false,
        message: `Erreur serveur pour le cryptage du CVV: ${
          error.response.status
        } - ${error.response.data?.message || error.message}`,
        code: error.response.status || 500,
      };
    } else if (error.request) {
      return {
        success: false,
        message: `Erreur de connexion pour le cryptage du CVV: ${error.message}`,
        code: 503,
      };
    } else {
      return {
        success: false,
        message: `Erreur de configuration pour le cryptage du CVV: ${error.message}`,
        code: 400,
      };
    }
  }
}

// Fonction pour valider les paramètres de paiement par carte
function validateCardPaymentParams(params) {
  const {
    cardNumber,
    expiryDate,
    cvv,
    amount,
    payerName,
    externalRef,
    browserInfo,
  } = params;

  const errors = [];

  // Validation des données de carte
  if (!cardNumber) errors.push("Numéro de carte requis");
  else if (!/^\d{4}-\d{4}-\d{4}-\d{4}$/.test(cardNumber))
    errors.push(
      "Format de numéro de carte invalide (format attendu: XXXX-XXXX-XXXX-XXXX)"
    );

  if (!expiryDate) errors.push("Date d'expiration requise");
  else if (!/^\d{2}\/\d{2}$/.test(expiryDate))
    errors.push("Format de date d'expiration invalide (format attendu: MM/YY)");

  if (!cvv) errors.push("CVV requis");
  else if (!/^\d{3}$/.test(cvv))
    errors.push("Format de CVV invalide (3 chiffres attendus)");

  // Validation des autres paramètres
  if (!amount) errors.push("Montant requis");
  else if (isNaN(amount) || amount <= 0)
    errors.push("Le montant doit être un nombre positif");

  if (!payerName) errors.push("Nom du payeur requis");
  if (!externalRef) errors.push("Référence externe requise");

  // Validation des informations du navigateur
  if (!browserInfo) errors.push("Informations du navigateur requises");
  else {
    if (typeof browserInfo.javaEnabled !== "boolean")
      errors.push("javaEnabled doit être un booléen");
    if (typeof browserInfo.javascriptEnabled !== "boolean")
      errors.push("javascriptEnabled doit être un booléen");
    if (!browserInfo.screenHeight) errors.push("Hauteur d'écran requise");
    if (!browserInfo.screenWidth) errors.push("Largeur d'écran requise");
    if (browserInfo.TZ === undefined) errors.push("Fuseau horaire (TZ) requis");
    if (
      !browserInfo.challengeWindowSize ||
      !["01", "02", "03", "04", "05"].includes(browserInfo.challengeWindowSize)
    )
      errors.push(
        "Taille de fenêtre de défi invalide (valeurs acceptées: 01, 02, 03, 04, 05)"
      );
  }

  if (errors.length > 0) {
    return {
      success: false,
      message: `Erreurs de validation: ${errors.join(", ")}`,
      code: 400,
    };
  }

  return { success: true };
}

// Fonction pour payer par carte bancaire
async function payWithBankCard(
  cardNumber,
  expiryDate,
  encryptedCVV,
  amount,
  payerName,
  externalRef,
  browserInfo,
  token
) {
  if (!token) {
    return {
      success: false,
      message: "Token d'authentification invalide ou manquant",
      code: 401,
    };
  }

  try {
    const response = await axios.post(
      `${KOMIPAY_BASE_URL}/b2c_standard`,
      {
        mobile_money: "bank_card",
        api_key: KOMIPAY_API_KEY,
        nom_prenom_payeur: payerName,
        numero_carte_bancaire: cardNumber,
        date_expiration: expiryDate,
        cvv_number: encryptedCVV,
        montant_a_payer: amount,
        reference_externe: externalRef,
        javaEnabled: browserInfo.javaEnabled,
        javascriptEnabled: browserInfo.javascriptEnabled,
        screenHeight: browserInfo.screenHeight,
        screenWidth: browserInfo.screenWidth,
        TZ: browserInfo.TZ,
        challengeWindowSize: browserInfo.challengeWindowSize,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          keypass: KOMIPAY_KEYPASS,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const errorMsg = error.response.data?.message || "Erreur inconnue";

      if (status === 401) {
        return {
          success: false,
          message: `Authentification échouée: ${errorMsg}`,
          code: 401,
        };
      } else if (status === 400) {
        return {
          success: false,
          message: `Requête invalide: ${errorMsg}`,
          code: 400,
        };
      } else if (status >= 500) {
        return {
          success: false,
          message: `Erreur serveur KomiPay: ${errorMsg}`,
          code: status,
        };
      } else {
        return {
          success: false,
          message: `Erreur de paiement (${status}): ${errorMsg}`,
          code: status,
        };
      }
    } else if (error.request) {
      return {
        success: false,
        message: `Aucune réponse du serveur de paiement: ${error.message}`,
        code: 503,
      };
    } else {
      return {
        success: false,
        message: `Erreur de configuration du paiement: ${error.message}`,
        code: 500,
      };
    }
  }
}

// Fonction principale pour traiter le paiement par carte bancaire
const processBankCardPayment = async (req, res) => {
  try {
    const {
      cardNumber,
      expiryDate,
      cvv,
      amount,
      payerName,
      externalRef,
      browserInfo,
    } = req.body;

    // 1. Validation des paramètres
    const validationResult = validateCardPaymentParams({
      cardNumber,
      expiryDate,
      cvv,
      amount,
      payerName,
      externalRef,
      browserInfo,
    });

    if (!validationResult.success) {
      return res.status(validationResult.code).json(validationResult);
    }

    // 2. Génération du token
    const tokenResult = await generateToken();
    if (!tokenResult.success) {
      return res.status(tokenResult.code).json(tokenResult);
    }
    const token = tokenResult.token;

    // 3. Cryptage du CVV
    const cvvResult = await encryptCVV(cvv, token);
    if (!cvvResult.success) {
      return res.status(cvvResult.code).json(cvvResult);
    }
    const encryptedCVV = cvvResult.encryptedCVV;

    // 4. Paiement par carte
    const paymentResult = await payWithBankCard(
      cardNumber,
      expiryDate,
      encryptedCVV,
      amount,
      payerName,
      externalRef,
      browserInfo,
      token
    );

    if (!paymentResult.success) {
      return res.status(paymentResult.code).json(paymentResult);
    }

    const paymentResponse = paymentResult.data;

    // 5. Traitement de la réponse
    if (paymentResponse.code === 200) {
      // Journaliser le succès sans exposer de données sensibles
      console.log(
        `Paiement carte initié pour ${payerName}, référence: ${externalRef}, état: ${paymentResponse.etat}`
      );

      // En fonction de l'état, on peut avoir différentes réponses
      if (paymentResponse.etat === "ATTENTE") {
        // Authentification 3DS requise
        return res.status(200).json({
          success: true,
          status: "pending",
          message: "Authentification 3DS requise",
          redirectUrl: paymentResponse.redirect_portail_auth,
          transactionData: {
            reference: paymentResponse.dataTransaction.reference_transaction,
            externalReference:
              paymentResponse.dataTransaction.reference_externe,
            amount: paymentResponse.dataTransaction.montant_total,
            cardType: paymentResponse.dataTransaction.carte,
          },
        });
      } else if (paymentResponse.etat === "SUCCESS") {
        // Transaction réussie immédiatement (sans 3DS)
        return res.status(200).json({
          success: true,
          status: "complete",
          message: "Paiement effectué avec succès",
          transactionData: {
            reference: paymentResponse.dataTransaction.reference_transaction,
            externalReference:
              paymentResponse.dataTransaction.reference_externe,
            amount: paymentResponse.dataTransaction.montant_total,
            cardType: paymentResponse.dataTransaction.carte,
          },
        });
      } else {
        // État inattendu
        return res.status(200).json({
          success: true,
          status: "unknown",
          message: paymentResponse.message,
          rawResponse: paymentResponse,
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: `Erreur de paiement: ${paymentResponse.message}`,
        code: paymentResponse.code || 400,
      });
    }
  } catch (error) {
    // Journaliser l'erreur sans exposer de données sensibles
    console.error(`Erreur inattendue de paiement par carte: ${error.message}`);

    // Fallback pour les erreurs non gérées
    return res.status(500).json({
      success: false,
      message: `Une erreur inattendue s'est produite: ${error.message}`,
      code: 500,
    });
  }
};

// Fonction pour vérifier le statut d'un paiement
const checkPaymentStatus = async (externalRef, token) => {
  if (!externalRef) {
    return {
      success: false,
      message: "Référence externe requise",
      code: 400,
    };
  }

  if (!token) {
    return {
      success: false,
      message: "Token d'authentification invalide ou manquant",
      code: 401,
    };
  }

  try {
    const response = await axios.post(
      `${KOMIPAY_BASE_URL}/check-transaction-status`,
      {
        apikey: KOMIPAY_API_KEY,
        reference_transaction: externalRef,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          keypass: KOMIPAY_KEYPASS,
        },
        timeout: 312000,
      }
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    if (error.response) {
      return {
        success: false,
        message: `Erreur de vérification du statut: ${
          error.response.data?.message || error.message
        } (${error.response.status})`,
        code: error.response.status || 500,
      };
    } else {
      return {
        success: false,
        message: `Erreur de connexion lors de la vérification du statut: ${error.message}`,
        code: 503,
      };
    }
  }
};

const checkPaymentStatusReq = async (req, res) => {
  try {
    if (!req.query.externalRef) {
      return res.status(400).json({
        success: false,
        message: "Référence externe requise",
        code: 400,
      });
    }

    const externalRef = req.query.externalRef;

    // Génération du token
    const tokenResult = await generateToken();
    if (!tokenResult.success) {
      return res.status(tokenResult.code).json(tokenResult);
    }

    // Vérification du statut de paiement
    const statusResult = await checkPaymentStatus(
      externalRef,
      tokenResult.token
    );
    if (!statusResult.success) {
      return res.status(statusResult.code).json(statusResult);
    }

    const paymentStatus = statusResult.data;

    if (paymentStatus.etat === "SUCCESS") {
      return res.status(200).json({
        success: true,
        status: "complete",
        message: "Paiement effectué avec succès",
        transactionData: {
          reference: paymentStatus.dataTransaction.reference_transaction,
          externalReference: paymentStatus.dataTransaction.reference_externe,
          amount: paymentStatus.dataTransaction.montant_total,
          cardType: paymentStatus.dataTransaction.carte,
        },
      });
    } else {
      return res.status(200).json({
        success: true,
        status: paymentStatus.etat,
        message: paymentStatus.message,
        rawResponse: paymentStatus,
      });
    }
  } catch (error) {
    console.error(
      `Erreur inattendue lors de la vérification du statut: ${error.message}`
    );

    return res.status(500).json({
      success: false,
      message: `Une erreur inattendue s'est produite: ${error.message}`,
      code: 500,
    });
  }
};

// Fonction utilitaire pour générer les informations du navigateur côté client
const getBrowserInfoScript = `
function getCodeFromDimensions(width, height) {
    if (width <= 250 && height <= 400) {
        return '01'; // 250 x 400
    } else if (width <= 390 && height <= 400) {
        return '02'; // 390 x 400
    } else if (width <= 500 && height <= 600) {
        return '03'; // 500 x 600
    } else if (width <= 600 && height <= 400) {
        return '04'; // 600 x 400
    } else {
        return '05'; // Full screen
    }
}

function getBrowserInfo() {
    var info = {
        javaEnabled: navigator.javaEnabled(),
        javascriptEnabled: (navigator && navigator.userAgent && navigator.userAgent.indexOf("JS_DISABLED") === -1),
        screenHeight: screen.height,
        screenWidth: screen.width,
        TZ: new Date().getTimezoneOffset() / -60,
        challengeWindowSize: getCodeFromDimensions(screen.width, screen.height)
    };
    return info;
}
`;

module.exports = {
  generateToken,
  encryptCVV,
  payWithBankCard,
  processBankCardPayment,
  checkPaymentStatus,
  getBrowserInfoScript,
  checkPaymentStatusReq,
};
