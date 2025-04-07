require("dotenv").config();
const axios = require("axios");

const KOMIPAY_BASE_URL = process.env.KOMIPAY_BASE_URL;
const KOMIPAY_API_KEY = process.env.KOMIPAY_API_KEY;
const KOMIPAY_LOGIN = process.env.KOMIPAY_LOGIN;
const KOMIPAY_PASSWORD = process.env.KOMIPAY_PASSWORD;

// Vérification des variables d'environnement requises
function checkEnvironmentVariables() {
  const requiredVars = [
    "KOMIPAY_BASE_URL",
    "KOMIPAY_API_KEY",
    "KOMIPAY_LOGIN",
    "KOMIPAY_PASSWORD",
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
  // Vérifier les variables d'environnement avant de faire l'appel
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
        timeout: 10000, // Timeout de 10 secondes
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
        code: 400,
      };
    }
  } catch (error) {
    if (error.response) {
      // Erreur de réponse du serveur (4xx, 5xx)
      return {
        success: false,
        message: `Erreur serveur KomiPay: ${error.response.status} - ${
          error.response.data?.message || error.message
        }`,
        code: error.response.status || 500,
      };
    } else if (error.request) {
      // Pas de réponse reçue du serveur
      return {
        success: false,
        message: `Erreur de connexion au serveur KomiPay: ${error.message}`,
        code: 503,
      };
    } else {
      // Erreur lors de la configuration de la requête
      return {
        success: false,
        message: `Erreur de configuration de la requête KomiPay: ${error.message}`,
        code: 500,
      };
    }
  }
}

// Fonction pour valider les paramètres de paiement
function validatePaymentParams(params) {
  const { operator, amount, phoneNumber, payerName, externalRef } = params;
  const errors = [];

  if (!operator) errors.push("operator est requis");
  if (!amount) errors.push("amount est requis");
  else if (isNaN(amount) || amount <= 0)
    errors.push("amount doit être un nombre positif");

  if (!phoneNumber) errors.push("phoneNumber est requis");
  else if (!/^\d{8,15}$/.test(phoneNumber))
    errors.push("format de phoneNumber invalide");

  if (!payerName) errors.push("payerName est requis");
  if (!externalRef) errors.push("externalRef est requis");

  if (errors.length > 0) {
    return {
      success: false,
      message: `Erreurs de validation: ${errors.join(", ")}`,
      code: 400,
    };
  }

  return { success: true };
}

// Fonction pour initier un paiement Mobile Money
const payWithMobileMoney = async (
  operator,
  amount,
  phoneNumber,
  payerName,
  externalRef,
  token
) => {
  if (!token) {
    return {
      success: false,
      message: "Token d'authentification invalide ou manquant",
      code: 401,
    };
  }

  try {
    // console.log({
    //   mobile_money: `${operator}_money`,
    //   api_key: KOMIPAY_API_KEY,
    //   montant_a_payer: amount,
    //   numero_telephone_payeur: phoneNumber,
    //   nom_prenom_payeur: payerName,
    //   reference_externe: externalRef,
    // });
    const response = await axios.post(
      `${KOMIPAY_BASE_URL}/b2c_standard`,
      {
        mobile_money: `${operator}_money`,
        api_key: KOMIPAY_API_KEY,
        montant_a_payer: amount,
        numero_telephone_payeur: phoneNumber,
        nom_prenom_payeur: payerName,
        reference_externe: externalRef,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 300000, // Timeout de 5 minutes
      }
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.log(error);
    if (error.response) {
      // Gérer les différents codes d'erreur HTTP
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
          code: 502,
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
};

// Fonction pour gérer le paiement Mobile Money
const processMobilePayment = async (req, res) => {
  try {
    const { operator, amount, phoneNumber, payerName, externalRef } = req.body;
    // console.log({ operator, amount, phoneNumber, payerName, externalRef });
    // Valider les paramètres
    const validationResult = validatePaymentParams({
      operator,
      amount,
      phoneNumber,
      payerName,
      externalRef,
    });

    if (!validationResult.success) {
      return res.status(validationResult.code).json(validationResult);
    }

    // Obtenir le token avec retry (3 tentatives max)
    let tokenResult = null;
    let attempts = 0;
    const maxAttempts = 3;

    while ((!tokenResult || !tokenResult.success) && attempts < maxAttempts) {
      attempts++;
      tokenResult = await generateToken();

      if (!tokenResult.success && attempts < maxAttempts) {
        // Attendre avant de réessayer (300ms, 600ms, etc.)
        await new Promise((resolve) => setTimeout(resolve, 300 * attempts));
      }
    }

    if (!tokenResult.success) {
      return res.status(tokenResult.code).json({
        success: false,
        message: `Échec d'authentification après ${maxAttempts} tentatives: ${tokenResult.message}`,
        code: tokenResult.code,
      });
    }

    // Effectuer le paiement
    const paymentResponse = await payWithMobileMoney(
      operator,
      amount,
      phoneNumber,
      payerName,
      externalRef,
      tokenResult.token
    );

    if (!paymentResponse.success) {
      return res.status(paymentResponse.code).json(paymentResponse);
    }

    // Journaliser le succès sans exposer de données sensibles
    console.log(`Paiement réussi pour ${payerName}, référence: ${externalRef}`);

    return res.status(200).json(paymentResponse.data);
  } catch (error) {
    // Journaliser l'erreur sans exposer de données sensibles
    console.error(`Erreur de paiement: ${error.message}`);

    // Retourner une erreur générique
    return res.status(500).json({
      success: false,
      message:
        "Une erreur inattendue s'est produite lors du traitement du paiement",
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
    const response = await axios.get(
      `${KOMIPAY_BASE_URL}/payment/status/${externalRef}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 10000,
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

module.exports = {
  generateToken,
  payWithMobileMoney,
  processMobilePayment,
  checkPaymentStatus,
};
