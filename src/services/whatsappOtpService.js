// ─── WhatsApp OTP Service — ACTIF ─────────────────────────────────────────────
// Envoi des codes OTP via la WhatsApp Cloud API (Meta Business).
//
// Configuration (.env) :
//   WHATSAPP_ENABLED=true
//   WHATSAPP_ACCESS_TOKEN=...            (token Meta Business)
//   WHATSAPP_PHONE_NUMBER_ID=...         (ID du numéro expéditeur)
//   WHATSAPP_API_VERSION=v26.0
//   WHATSAPP_TEMPLATE_NAME=clef_01       (template approuvé, catégorie Authentification)
//   WHATSAPP_TEMPLATE_LANG=fr
//   WHATSAPP_TEMPLATE_BUTTON_INDEX=0     (index du bouton URL dynamique ;
//                                         "none" si le template n'a pas de bouton)
//
// ⚠️ Le template `clef_01` possède un bouton URL dynamique : son paramètre est
//    OBLIGATOIRE dans l'appel API, sinon Meta renvoie une erreur de paramètres.
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config();
const axios = require("axios");

const getConfig = () => ({
  token:         process.env.WHATSAPP_ACCESS_TOKEN || "",
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  apiVersion:    process.env.WHATSAPP_API_VERSION || "v19.0",
  enabled:       String(process.env.WHATSAPP_ENABLED || "false").toLowerCase() === "true",
  templateName:  process.env.WHATSAPP_TEMPLATE_NAME || "",
  templateLang:  process.env.WHATSAPP_TEMPLATE_LANG || "fr",
  buttonIndex:   process.env.WHATSAPP_TEMPLATE_BUTTON_INDEX !== undefined
    ? String(process.env.WHATSAPP_TEMPLATE_BUTTON_INDEX).trim()
    : "0",
});

// Un index "none"/"off"/"false"/"no"/"-1" désactive le composant bouton
const isButtonDisabled = (value) => /^(none|off|false|no|-1)$/i.test(String(value || "").trim());


const assertReady = () => {
  const cfg = getConfig();
  if (!cfg.enabled) {
    const e = new Error("WhatsApp OTP désactivé (WHATSAPP_ENABLED=false)");
    e.code = "WA_DISABLED";
    throw e;
  }
  if (!cfg.token) {
    const e = new Error("WHATSAPP_ACCESS_TOKEN manquant");
    e.code = "WA_MISSING_TOKEN";
    throw e;
  }
  if (!cfg.phoneNumberId) {
    const e = new Error("WHATSAPP_PHONE_NUMBER_ID manquant");
    e.code = "WA_MISSING_PHONE_ID";
    throw e;
  }
  return cfg;
};

// "+227 87 72 75 01" → "22787727501" (format attendu par l'API Meta)
const normalizeRecipient = (to) => String(to || "").replace(/\s+/g, "").replace(/^\+/, "");

// Payload avec template approuvé : body + bouton URL dynamique (si configuré)
const buildTemplatePayload = (cfg, recipient, code) => {
  const components = [
    { type: "body", parameters: [{ type: "text", text: code }] },
  ];

  // Le template clef_01 possède un bouton URL dynamique : le paramètre est requis
  if (!isButtonDisabled(cfg.buttonIndex)) {
    components.push({
      type: "button",
      sub_type: "url",
      index: String(cfg.buttonIndex),
      parameters: [{ type: "text", text: code }],
    });
  }

  return {
    messaging_product: "whatsapp",
    to: recipient,
    type: "template",
    template: {
      name: cfg.templateName,
      language: { code: cfg.templateLang },
      components,
    },
  };
};

// Payload message texte (utilisable uniquement dans la fenêtre de 24h sans template)
const buildTextPayload = (recipient, code, expiryMinutes) => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to: recipient,
  type: "text",
  text: {
    preview_url: false,
    body: `🔐 *IhamBaobab* — Votre code de vérification est *${code}*.\n\nIl expire dans ${expiryMinutes} minutes.\n\n_Ne le partagez jamais._`,
  },
});

/**
 * Envoyer un code OTP par WhatsApp.
 * @param {string} to   Numéro au format international (+22787... ou 22787...)
 * @param {string} code Code OTP à 6 chiffres
 * @param {number} expiryMinutes Durée de validité (message texte hors template)
 * @returns {{ messageId: string|null, messageStatus: string|null, template: string|null, recipient: string, raw: object }}
 */
const sendOtp = async (to, code, expiryMinutes = 10) => {
  const cfg = assertReady();
  const recipient = normalizeRecipient(to);

  if (!recipient || !/^\d{6,15}$/.test(recipient)) {
    const e = new Error("Numéro de téléphone invalide pour WhatsApp");
    e.code = "WA_INVALID_RECIPIENT";
    throw e;
  }

  const body = cfg.templateName
    ? buildTemplatePayload(cfg, recipient, code)
    : buildTextPayload(recipient, code, expiryMinutes);

  const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;
  const response = await axios.post(url, body, {
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    timeout: 10000,
    validateStatus: () => true,
  });
  if (response.status >= 400) {
    const errData = response.data?.error || response.data;
    const e = new Error(errData?.message || "Erreur WhatsApp Cloud API");
    e.code = "WA_API_ERROR";
    e.status = response.status;
    e.providerCode = errData?.code;
    e.providerSubcode = errData?.error_subcode;
    e.providerBody = response.data;
    throw e;
  }

  return {
    messageId: response.data?.messages?.[0]?.id || null,
    messageStatus: response.data?.messages?.[0]?.message_status || null,
    template: cfg.templateName || null,
    recipient,
    raw: response.data,
  };
};

/**
 * Récupérer le statut de livraison d'un message envoyé (debug/QA).
 * @param {string} messageId wamid retourné par sendOtp
 */
const getMessageStatus = async (messageId) => {
  const cfg = getConfig();
  if (!cfg.token) {
    const e = new Error("WHATSAPP_ACCESS_TOKEN manquant");
    e.code = "WA_MISSING_TOKEN";
    throw e;
  }
  const url = `https://graph.facebook.com/${cfg.apiVersion}/${messageId}?fields=status,error`;
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${cfg.token}` },
    timeout: 10000,
    validateStatus: () => true,
  });
  if (response.status >= 400) {
    const e = new Error(response.data?.error?.message || "Erreur lecture statut WhatsApp");
    e.code = "WA_API_ERROR";
    e.status = response.status;
    e.providerBody = response.data;
    throw e;
  }
  return response.data;
};

/** Résumé de configuration (token masqué) — utile pour le diagnostic */
const getConfigSummary = () => {
  const cfg = getConfig();
  const token = cfg.token || "";
  return {
    enabled: cfg.enabled,
    apiVersion: cfg.apiVersion,
    phoneNumberId: cfg.phoneNumberId || "(manquant)",
    templateName: cfg.templateName || "(aucun → message texte)",
    templateLang: cfg.templateLang,
    buttonIndex: isButtonDisabled(cfg.buttonIndex) ? "(désactivé)" : cfg.buttonIndex,
    token: token ? `${token.slice(0, 8)}...${token.slice(-4)} (${token.length} car.)` : "(manquant)",
  };
};

const getErrorMessage = (error) => {
  if (!error) return "Erreur WhatsApp inconnue";
  if (error.code === "WA_DISABLED") return "Service WhatsApp désactivé";
  if (error.code === "WA_MISSING_TOKEN") return "Configuration WhatsApp incomplète (token manquant)";
  if (error.code === "WA_MISSING_PHONE_ID") return "Configuration WhatsApp incomplète (phone number ID manquant)";
  if (error.code === "WA_INVALID_RECIPIENT") return "Numéro de téléphone invalide pour WhatsApp";
  if (error.code === "WA_API_ERROR") {
    const detail = error.providerBody?.error?.message || error.message;
    const codeInfo = error.providerCode
      ? ` (code ${error.providerCode}${error.providerSubcode ? `/${error.providerSubcode}` : ""})`
      : "";
    // OAuthException code 1 / 190 : cause la plus fréquente → scope de messagerie
    // (whatsapp_business_messaging) non rattaché au WABA propriétaire du numéro.
    let hint = "";
    if (error.providerCode === 1 || error.providerCode === 190) {
      hint = " — vérifiez que WHATSAPP_ACCESS_TOKEN a bien le scope whatsapp_business_messaging rattaché au WABA du numéro (token d'Utilisateur système recommandé)";
    }
    return `WhatsApp API error ${error.status}${codeInfo}: ${detail}${hint}`;
  }
  if (error.code === "ECONNABORTED" || /timeout/i.test(error.message || "")) {
    return "Délai dépassé lors de l'appel WhatsApp Cloud API";
  }
  return error.message || "Erreur WhatsApp";
};

module.exports = { sendOtp, getMessageStatus, getConfigSummary, getErrorMessage, normalizeRecipient };
