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
    "KOMIPAY_KEYPASS",
  ];

  const missingVars = requiredVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    return {
      success: false,
      code: 500,
      message: `Variables d'environnement manquantes: ${missingVars.join(
        ", "
      )}`,
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
        timeout: 40000,
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
        code: response.data.code || 500,
        message: `Erreur API KomiPay: ${
          response.data.message || "Erreur inconnue"
        }`,
      };
    }
  } catch (error) {
    let errorMessage = "Erreur inconnue";
    let statusCode = 500;

    if (error.response) {
      statusCode = error.response.status;
      errorMessage = `Erreur serveur KomiPay: ${statusCode} - ${
        error.response.data?.message || error.message
      }`;
    } else if (error.request) {
      errorMessage = `Erreur de connexion au serveur KomiPay: ${error.message} veuiller verifier votre connexion et reessayer`;
    } else {
      errorMessage = `Erreur de configuration de la requête KomiPay: ${error.message}`;
    }

    return {
      success: false,
      code: statusCode,
      message: errorMessage,
    };
  }
}

// Fonction pour valider les paramètres de paiement STA
function validateSTAPaymentParams(params) {
  const { staType, phoneNumber, country, amount, externalRef, securityCode } =
    params;
  const errors = [];

  // Validation du type de STA
  if (!staType) errors.push("Type de STA requis");
  else if (!["nita", "amana", "zeyna"].includes(staType.toLowerCase()))
    errors.push("Type de STA invalide (valeurs acceptées: nita, amana, zeyna)");

  // Validation du numéro de téléphone
  if (!phoneNumber) errors.push("Numéro de téléphone requis");
  else if (!/^\+\d{1,3}\d{8,}$/.test(phoneNumber))
    errors.push(
      "Format de numéro de téléphone invalide (format attendu: +XXX...)"
    );

  // Validation du pays
  if (!country) errors.push("Pays requis");

  // Validation du montant
  if (!amount) errors.push("Montant requis");
  else if (isNaN(parseFloat(amount.toString().replace(/\s/g, ""))))
    errors.push("Le montant doit être un nombre");

  // Validation de la référence externe
  if (!externalRef) errors.push("Référence externe requise");

  // Validation du code de sécurité pour ZeynaCash
  if (staType?.toLowerCase() === "zeynacash") {
    if (!securityCode) errors.push("Code de sécurité requis pour ZeynaCash");
    else if (!/^\d{5}$/.test(securityCode))
      errors.push(
        "Le code de sécurité doit être composé de 5 chiffres pour ZeynaCash"
      );
  }

  if (errors.length > 0) {
    return {
      success: false,
      code: 400,
      message: `Erreurs de validation: ${errors.join(", ")}`,
    };
  }

  return { success: true };
}

// Fonction pour demander un code de sécurité (ZeynaCash uniquement)
async function requestSecurityCode(phoneNumber, token) {
  if (!token) {
    return {
      success: false,
      code: 401,
      message: "Token d'authentification invalide ou manquant",
    };
  }

  try {
    const response = await axios.post(
      `${KOMIPAY_BASE_URL}/before-integration-b2c-payment-sta`,
      {
        mobile_money: "zeyna_transfert",
        numero_telephone: phoneNumber,
        api_key: KOMIPAY_API_KEY,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          keypass: KOMIPAY_KEYPASS,
        },
        timeout: 40000,
      }
    );

    if (response.data.code === 200 && response.data.statut === true) {
      return {
        success: true,
        message: response.data.message,
        attempts: response.data.tentative,
      };
    } else {
      return {
        success: false,
        code: response.data.code || 400,
        message: `Erreur lors de la demande du code de sécurité: ${response.data.message}`,
      };
    }
  } catch (error) {
    let errorMessage = "Erreur inconnue";
    let statusCode = 500;

    if (error.response) {
      statusCode = error.response.status;
      errorMessage = `Erreur serveur pour la demande du code de sécurité: ${statusCode} - ${
        error.response.data?.message || error.message
      }`;
    } else if (error.request) {
      errorMessage = `Erreur de connexion pour la demande du code de sécurité: ${error.message}`;
    } else {
      errorMessage = `Erreur de configuration pour la demande du code de sécurité: ${error.message}`;
    }

    return {
      success: false,
      code: statusCode,
      message: errorMessage,
    };
  }
}

// Fonction pour initier un paiement STA
async function initiateSTAPayment(
  staType,
  phoneNumber,
  country,
  amount,
  externalRef,
  securityCode,
  token
) {
  if (!token) {
    return {
      success: false,
      code: 401,
      message: "Token d'authentification invalide ou manquant",
    };
  }

  // Convertir le type de STA au format attendu par l'API
  const mobileMoney = `${staType.toLowerCase()}_transfert`;

  // Préparer les données de la requête
  const requestData = {
    mobile_money: mobileMoney,
    api_key: KOMIPAY_API_KEY,
    montant_a_payer: amount.toString(),
    numero_telephone_payeur: phoneNumber,
    pays_payeur: country.toUpperCase(),
    reference_externe: externalRef,
  };

  // Ajouter le code de sécurité pour ZeynaCash
  if (staType.toLowerCase() === "zeyna" && securityCode) {
    requestData.security_code = securityCode;
  }

  try {
    const response = await axios.post(
      `${KOMIPAY_BASE_URL}/b2c_standard`,
      requestData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          keypass: KOMIPAY_KEYPASS,
          "Content-Type": "application/json",
        },
        timeout: 40000,
      }
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    let errorMessage = "Erreur inconnue";
    let statusCode = 500;

    if (error.response) {
      statusCode = error.response.status;
      const errorMsg = error.response.data?.message || "Erreur inconnue";

      if (statusCode === 401) {
        errorMessage = `Authentification échouée: ${errorMsg}`;
      } else if (statusCode === 400) {
        errorMessage = `Requête invalide: ${errorMsg}`;
      } else if (statusCode >= 500) {
        errorMessage = `Erreur serveur KomiPay: ${errorMsg}`;
      } else {
        errorMessage = `Erreur de paiement (${statusCode}): ${errorMsg}`;
      }
    } else if (error.request) {
      errorMessage = `Aucune réponse du serveur de paiement: ${error.message}`;
    } else {
      errorMessage = `Erreur de configuration du paiement: ${error.message}`;
    }
    console.log({ error });
    return {
      success: false,
      code: statusCode,
      message: errorMessage,
    };
  }
}

// Fonction pour vérifier le statut d'une transaction
async function checkTransactionStatus(referenceTransaction, token) {
  if (!token) {
    return {
      success: false,
      code: 401,
      message: "Token d'authentification invalide ou manquant",
    };
  }

  try {
    const response = await axios.post(
      `${KOMIPAY_BASE_URL}/check-transaction-status`,
      {
        apikey: KOMIPAY_API_KEY,
        reference_transaction: referenceTransaction,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          keypass: KOMIPAY_KEYPASS,
          "Content-Type": "application/json",
        },
        timeout: 60000, // Timeout de 60 secondes car l'API peut attendre jusqu'à 5 minutes
      }
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    let errorMessage = "Erreur inconnue";
    let statusCode = 500;

    if (error.response) {
      statusCode = error.response.status;
      errorMessage = `Erreur lors de la vérification du statut: ${
        error.response.data?.message || error.message
      } (${statusCode})`;
    } else if (error.request) {
      if (error.code === "ECONNABORTED") {
        return {
          success: true,
          data: {
            code: 408,
            statut: false,
            message:
              "La requête a expiré, la transaction est toujours en attente de validation",
            data: {
              transactionStatus: "Pending",
            },
          },
        };
      }
      errorMessage = `Erreur de connexion lors de la vérification du statut: ${error.message}`;
    } else {
      errorMessage = `Erreur de configuration lors de la vérification du statut: ${error.message}`;
    }

    return {
      success: false,
      code: statusCode,
      message: errorMessage,
    };
  }
}

// Fonction principale pour traiter le paiement STA
const processSTAPayment = async (req, res) => {
  const { staType, phoneNumber, country, amount, externalRef, securityCode } =
    req.body;

  // 1. Validation des paramètres
  const validationResult = validateSTAPaymentParams({
    staType,
    phoneNumber,
    country,
    amount,
    externalRef,
    securityCode,
  });

  if (!validationResult.success) {
    return res.status(validationResult.code).json({
      success: false,
      message: validationResult.message,
      code: validationResult.code,
    });
  }

  // 2. Génération du token
  const tokenResult = await generateToken();
  if (!tokenResult.success) {
    return res.status(tokenResult.code).json({
      success: false,
      message: tokenResult.message,
      code: tokenResult.code,
    });
  }

  // 3. Paiement STA
  const paymentResponse = await initiateSTAPayment(
    staType,
    phoneNumber,
    country,
    amount,
    externalRef,
    securityCode,
    tokenResult.token
  );

  if (!paymentResponse.success) {
    return res.status(paymentResponse.code).json({
      success: false,
      message: paymentResponse.message,
      code: paymentResponse.code,
    });
  }

  // 4. Traitement de la réponse
  const responseData = paymentResponse.data;
  if (responseData.code === 200) {
    // Journaliser le succès sans exposer de données sensibles
    console.log(
      `Paiement ${staType} initié pour ${phoneNumber}, référence: ${externalRef}, état: en attente`
    );

    // Construction de la réponse
    const responseObj = {
      success: true,
      status: "pending",
      message: responseData.message,
      transactionReference: responseData.reference_transaction,
      externalReference: externalRef,
      code_validation: staType == "nita" ? responseData.code_validation : null,
    };

    // Ajouter le code de validation pour MyNita
    if (staType.toLowerCase() === "mynita" && responseData.code_validation) {
      responseObj.validationCode = responseData.code_validation;
    }

    return res.status(200).json(responseObj);
  } else {
    return res.status(400).json({
      success: false,
      message: `Erreur de paiement: ${responseData.message}`,
      code: responseData.code || 400,
    });
  }
};

// Fonction pour demander un code de sécurité ZeynaCash
const requestZeynaCashSecurityCode = async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({
      success: false,
      message: "Numéro de téléphone requis",
      code: 400,
    });
  }

  if (!/^\+\d{1,3}\d{8,}$/.test(phoneNumber)) {
    return res.status(400).json({
      success: false,
      message:
        "Format de numéro de téléphone invalide (format attendu: +XXX...)",
      code: 400,
    });
  }

  // Génération du token
  const tokenResult = await generateToken();
  if (!tokenResult.success) {
    return res.status(tokenResult.code).json({
      success: false,
      message: tokenResult.message,
      code: tokenResult.code,
    });
  }

  // Demande du code de sécurité
  const securityCodeResponse = await requestSecurityCode(
    phoneNumber,
    tokenResult.token
  );

  if (!securityCodeResponse.success) {
    return res.status(securityCodeResponse.code).json({
      success: false,
      message: securityCodeResponse.message,
      code: securityCodeResponse.code,
    });
  }

  return res.status(200).json({
    success: true,
    message: securityCodeResponse.message,
    attempts: securityCodeResponse.attempts,
  });
};

// Fonction pour vérifier le statut d'une transaction
const checkPaymentStatus = async (req, res) => {
  const { referenceTransaction } = req.params;

  if (!referenceTransaction) {
    return res.status(400).json({
      success: false,
      message: "Référence de transaction requise",
      code: 400,
    });
  }

  // Génération du token
  const tokenResult = await generateToken();
  if (!tokenResult.success) {
    return res.status(tokenResult.code).json({
      success: false,
      message: tokenResult.message,
      code: tokenResult.code,
    });
  }

  // Vérification du statut
  const statusResponse = await checkTransactionStatus(
    referenceTransaction,
    tokenResult.token
  );

  if (!statusResponse.success) {
    return res.status(statusResponse.code).json({
      success: false,
      message: statusResponse.message,
      code: statusResponse.code,
    });
  }

  const responseData = statusResponse.data;

  if (responseData.code === 200 && responseData.statut === true) {
    return res.status(200).json({
      success: true,
      status: "success",
      message: responseData.message,
      transactionStatus: responseData.data?.transactionStatus,
    });
  } else if (responseData.code === 408) {
    // Transaction toujours en attente (timeout)
    return res.status(200).json({
      success: true,
      status: "pending",
      message: responseData.message,
      transactionStatus: "Pending",
    });
  } else {
    return res.status(200).json({
      success: false,
      status: "failed",
      message: responseData.message,
      transactionStatus: responseData.data?.transactionStatus || "Failed",
    });
  }
};

module.exports = {
  generateToken,
  requestSecurityCode,
  initiateSTAPayment,
  checkTransactionStatus,
  processSTAPayment,
  requestZeynaCashSecurityCode,
  checkPaymentStatus,
};
