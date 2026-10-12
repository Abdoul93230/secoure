/**
 * SÉCURITÉ — Authenticité des callbacks de paiement iPay.
 *
 * iPay signe ses webhooks avec l'en-tête `secret-hash` (valeur « Secret Hash » du
 * tableau de bord marchand iPay). Sans cette vérification, n'importe qui peut
 * déclarer une commande « payée » en appelant /payment_callback2.
 *
 * Variables d'environnement :
 *   IPAY_WEBHOOK_SECRET   Secret Hash copié depuis le tableau de bord iPay
 *   IPAY_WEBHOOK_ENFORCE  "true" pour REFUSER tout callback non signé.
 *                         Sinon : mode observation (journalise seulement) — à utiliser
 *                         le temps de confirmer que les vrais webhooks iPay portent bien l'en-tête.
 */
const crypto = require("crypto");

const HEADER_NAMES = ["secret-hash", "x-secret-hash", "ipay-secret-hash"];

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

const verifyIpayWebhook = (req, res, next) => {
  const secret = process.env.IPAY_WEBHOOK_SECRET;
  const enforce = String(process.env.IPAY_WEBHOOK_ENFORCE || "").toLowerCase() === "true";
  const received = HEADER_NAMES.map((h) => req.headers[h]).find(Boolean);

  if (!secret) {
    console.warn("[iPay webhook] IPAY_WEBHOOK_SECRET non configuré : callback accepté SANS vérification d'authenticité.");
    req.ipayVerified = false;
    return next();
  }

  const valid = received ? safeEqual(received, secret) : false;
  req.ipayVerified = valid;

  if (!valid) {
    console.warn("[iPay webhook] Signature absente ou invalide", {
      enforce,
      ip: req.ip,
      hasHeader: Boolean(received),
      headerNames: Object.keys(req.headers),
    });
    if (enforce) {
      return res.status(401).json({ message: "Callback non authentifié." });
    }
  }
  return next();
};

module.exports = { verifyIpayWebhook };
