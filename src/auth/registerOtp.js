/**
 * registerOtp.js — OTP d'inscription vendeur
 *
 * Flux :
 *   1. POST /auth/register-otp/send   { identifier, method }
 *      → envoie un OTP 6 chiffres par email ou SMS
 *      → retourne { sent: true, method, cooldown }
 *
 *   2. POST /auth/register-otp/verify { identifier, otp }
 *      → vérifie l'OTP
 *      → retourne { verified: true, verifiedToken }   (JWT 15 min)
 *
 * Le verifiedToken est ensuite joint à POST /createSeller pour prouver
 * que l'identifiant a été vérifié. createSeller le valide et en extrait
 * l'identifiant vérifié.
 *
 * Restrictions SMS : Niger (+227) et Bénin (+229) uniquement (coût réel).
 */

const nodemailer  = require('nodemailer');
const jwt         = require('jsonwebtoken');
const { SellerRequest } = require('../Models');
const lafricaSms  = require('../services/lafricaMobileSmsService');

const SECRET          = require('./clefSeller');
const OTP_TTL_MS      = 10 * 60 * 1000;   // 10 min
const TOKEN_TTL_MS    = 15 * 60 * 1000;   // 15 min (verifiedToken)
const COOLDOWN_EMAIL  = 60 * 1000;        // 60 s
const COOLDOWN_SMS    = 120 * 1000;       // 120 s
const MAX_ATTEMPTS    = 5;
const SMS_ALLOWED     = ['+227', '+229'];

// Stockage en mémoire { key → { otp, expiresAt, sentAt, attempts } }
const store = new Map();

const gen6 = () => Math.floor(100000 + Math.random() * 900000).toString();

const normalizeIdentifier = (raw, method) =>
  method === 'email'
    ? raw.toLowerCase().trim()
    : raw.replace(/\s+/g, '').trim();

// ─── Email OTP ────────────────────────────────────────────────────────────────
const transporter = () =>
  nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER || process.env.MAIL_USER,
      pass: process.env.EMAIL_PASS || process.env.MAIL_PASS,
    },
    tls: { rejectUnauthorized: false },
  });

const buildEmailHtml = (otp) => `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f7fafc;margin:0;padding:0}
  .wrap{max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.08)}
  .header{background:linear-gradient(135deg,#30A08B,#B2905F);padding:32px 24px;text-align:center}
  .header h1{color:#fff;font-size:22px;margin:0}
  .body{padding:32px 24px;text-align:center}
  .otp{display:inline-block;background:linear-gradient(135deg,#30A08B,#B2905F);color:#fff;font-size:36px;font-weight:700;letter-spacing:8px;padding:16px 32px;border-radius:12px;margin:24px 0}
  .note{color:#718096;font-size:14px;line-height:1.6}
  .footer{background:#f7fafc;padding:16px 24px;text-align:center;color:#a0aec0;font-size:12px}
</style></head>
<body><div class="wrap">
  <div class="header"><h1>IhamBaobab — Vérification</h1></div>
  <div class="body">
    <p class="note">Votre code de vérification pour créer votre compte vendeur :</p>
    <div class="otp">${otp}</div>
    <p class="note">Ce code expire dans <strong>10 minutes</strong>.<br>Ne le partagez avec personne.</p>
  </div>
  <div class="footer">IhamBaobab &mdash; Niamey, Niger</div>
</div></body></html>`;

// ─── sendOtp ──────────────────────────────────────────────────────────────────
const sendOtp = async (req, res) => {
  const { identifier, method } = req.body;

  if (!identifier || !['email', 'phone'].includes(method)) {
    return res.status(400).json({ message: 'Paramètres invalides (identifier + method requis).' });
  }

  const key = normalizeIdentifier(identifier, method);

  // ── Validation format ──────────────────────────────────────────────────────
  if (method === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) {
      return res.status(400).json({ message: 'Adresse email invalide.' });
    }
  } else {
    if (!/^\+\d{8,15}$/.test(key)) {
      return res.status(400).json({ message: 'Numéro invalide (format international : +22787...).' });
    }
    if (!SMS_ALLOWED.some(p => key.startsWith(p))) {
      return res.status(403).json({
        message: 'SMS disponible uniquement pour Niger (+227) et Bénin (+229). Utilisez votre email.',
        suggestEmail: true,
      });
    }
  }

  // ── Unicité : l'identifiant est-il déjà pris ? ────────────────────────────
  const query = method === 'email' ? { email: key } : { phone: key };
  const exists = await SellerRequest.findOne(query).select('_id').lean();
  if (exists) {
    const label = method === 'email' ? 'email' : 'téléphone';
    return res.status(409).json({ message: `Ce ${label} est déjà associé à un compte.`, field: method });
  }

  // ── Cooldown ───────────────────────────────────────────────────────────────
  const prev    = store.get(key);
  const cooldown = method === 'email' ? COOLDOWN_EMAIL : COOLDOWN_SMS;
  if (prev && Date.now() - prev.sentAt < cooldown) {
    const wait = Math.ceil((cooldown - (Date.now() - prev.sentAt)) / 1000);
    return res.status(429).json({ message: `Attendez ${wait}s avant de renvoyer.`, wait });
  }

  const otp = gen6();
  store.set(key, { otp, expiresAt: Date.now() + OTP_TTL_MS, sentAt: Date.now(), attempts: 0 });

  // ── Envoi ──────────────────────────────────────────────────────────────────
  try {
    if (method === 'email') {
      await transporter().sendMail({
        from: `"IhamBaobab" <${process.env.EMAIL_USER || process.env.MAIL_USER}>`,
        to:   key,
        subject: 'Code de vérification — IhamBaobab',
        html: buildEmailHtml(otp),
      });
    } else {
      await lafricaSms.sendSms({
        to:   key,
        text: `IhamBaobab: votre code est ${otp}. Expire dans 10 min. Ne partagez jamais ce code.`,
      });
    }
  } catch (err) {
    store.delete(key);
    console.error('registerOtp sendOtp error:', err);
    return res.status(500).json({ message: "Erreur lors de l'envoi du code." });
  }

  return res.status(200).json({
    sent:     true,
    method,
    cooldown: Math.ceil(cooldown / 1000),
    message:  method === 'email' ? 'Code envoyé par email.' : 'Code envoyé par SMS.',
  });
};

// ─── resendOtp ────────────────────────────────────────────────────────────────
const resendOtp = async (req, res) => {
  // Même logique que sendOtp — le store.get cooldown gère la limitation
  return sendOtp(req, res);
};

// ─── verifyOtp ────────────────────────────────────────────────────────────────
const verifyOtp = async (req, res) => {
  const { identifier, method, otp } = req.body;

  if (!identifier || !method || !otp) {
    return res.status(400).json({ message: 'Paramètres manquants.' });
  }

  const key   = normalizeIdentifier(identifier, method);
  const entry = store.get(key);

  if (!entry) {
    return res.status(400).json({ message: 'Code OTP invalide ou expiré.' });
  }
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return res.status(400).json({ message: 'Code OTP expiré. Demandez-en un nouveau.' });
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    store.delete(key);
    return res.status(429).json({ message: 'Trop de tentatives. Demandez un nouveau code.' });
  }
  if (entry.otp !== String(otp).trim()) {
    entry.attempts += 1;
    const left = MAX_ATTEMPTS - entry.attempts;
    return res.status(401).json({ message: `Code incorrect. ${left} tentative(s) restante(s).` });
  }

  // OTP correct → supprimer du store, émettre verifiedToken
  store.delete(key);

  const verifiedToken = jwt.sign(
    { identifier: key, method, purpose: 'register_verified' },
    SECRET,
    { expiresIn: '15m' }
  );

  return res.status(200).json({
    verified: true,
    verifiedToken,
    message: 'Identifiant vérifié avec succès.',
  });
};

module.exports = { sendOtp, resendOtp, verifyOtp };
