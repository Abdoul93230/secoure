// ─── WhatsApp OTP Service — DÉSACTIVÉ ────────────────────────────────────────
// Réactiver quand le template Meta est approuvé :
//   1. Décommenter le bloc ci-dessous
//   2. Supprimer les stubs en bas du fichier
//   3. Configurer WHATSAPP_TEMPLATE_NAME + régénérer le token dans .env
// ─────────────────────────────────────────────────────────────────────────────

/*
const axios = require("axios");

const getConfig = () => ({
  token:        process.env.WHATSAPP_ACCESS_TOKEN || "",
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  apiVersion:   process.env.WHATSAPP_API_VERSION || "v19.0",
  enabled:      String(process.env.WHATSAPP_ENABLED || "false").toLowerCase() === "true",
  templateName: process.env.WHATSAPP_TEMPLATE_NAME || "",
  templateLang: process.env.WHATSAPP_TEMPLATE_LANG || "fr",
});

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

const sendOtp = async (to, code, expiryMinutes = 10) => {
  const cfg = assertReady();
  const recipient = String(to).replace(/\s+/g, "").replace(/^\+/, "");
  let body;
  if (cfg.templateName) {
    body = {
      messaging_product: "whatsapp",
      to: recipient,
      type: "template",
      template: {
        name: cfg.templateName,
        language: { code: cfg.templateLang },
        components: [
          { type: "body", parameters: [{ type: "text", text: code }] },
        ],
      },
    };
  } else {
    body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "text",
      text: {
        preview_url: false,
        body: `🔐 *IhamBaobab* — Votre code de vérification est *${code}*.\n\nIl expire dans ${expiryMinutes} minutes.\n\n_Ne le partagez jamais._`,
      },
    };
  }
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
    e.providerBody = response.data;
    throw e;
  }
  return { messageId: response.data?.messages?.[0]?.id || null, raw: response.data };
};

const getErrorMessage = (error) => {
  if (!error) return "Erreur WhatsApp inconnue";
  if (error.code === "WA_DISABLED") return "Service WhatsApp désactivé";
  if (error.code === "WA_MISSING_TOKEN") return "Configuration WhatsApp incomplète (token manquant)";
  if (error.code === "WA_MISSING_PHONE_ID") return "Configuration WhatsApp incomplète (phone number ID manquant)";
  if (error.code === "WA_API_ERROR") return `WhatsApp API error ${error.status}: ${error.providerBody?.error?.message || error.message}`;
  return error.message || "Erreur WhatsApp";
};

module.exports = { sendOtp, getErrorMessage };
*/

// ── Stubs (service désactivé) ─────────────────────────────────────────────────
const sendOtp = async () => {
  const e = new Error("WhatsApp OTP désactivé — template en attente d'approbation Meta");
  e.code = "WA_DISABLED";
  throw e;
};
const getErrorMessage = () => "Service WhatsApp OTP temporairement désactivé";

module.exports = { sendOtp, getErrorMessage };
