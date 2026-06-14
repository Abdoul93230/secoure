const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const { User, SellerRequest } = require("../Models");
const lafricaSms = require("../services/lafricaMobileSmsService");

const OTP_EXPIRY_MS        = 10 * 60 * 1000;  // 10 min
const OTP_COOLDOWN_EMAIL_MS = 60 * 1000;        // 60s entre deux envois email
const OTP_COOLDOWN_SMS_MS   = 120 * 1000;       // 120s entre deux envois SMS
const MAX_VERIFY_ATTEMPTS   = 5;
const SMS_MAX_PER_WINDOW    = 2;                // max 2 SMS par numéro sur 24h
const SMS_WINDOW_MS         = 24 * 60 * 60 * 1000; // fenêtre 24h
// Préfixes autorisés pour SMS (Niger + Bénin uniquement — coût élevé)
const SMS_ALLOWED_PREFIXES  = ['+227', '+229'];

// Stockage : key → { otp, expiresAt, sentAt, attempts, smsCount, smsWindowStart }
const otpStore = new Map();

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const getTransporter = () =>
  nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER || process.env.MAIL_USER,
      pass: process.env.EMAIL_PASS || process.env.MAIL_PASS,
    },
    tls: { rejectUnauthorized: false },
  });

const buildHtml = (otp) => `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Récupération de mot de passe — IhamBaobab</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f7fafc; margin: 0; padding: 0; }
    .wrap { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,.08); }
    .header { background: linear-gradient(135deg, #30A08B, #B2905F); padding: 32px 24px; text-align: center; }
    .header h1 { color: #fff; font-size: 24px; margin: 0; letter-spacing: 1px; }
    .body { padding: 32px 24px; text-align: center; }
    .otp { display: inline-block; background: linear-gradient(135deg, #30A08B, #B2905F); color: #fff; font-size: 36px; font-weight: 700; letter-spacing: 8px; padding: 16px 32px; border-radius: 12px; margin: 24px 0; }
    .note { color: #718096; font-size: 14px; line-height: 1.6; }
    .footer { background: #f7fafc; padding: 16px 24px; text-align: center; color: #a0aec0; font-size: 12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header"><h1>IhamBaobab</h1></div>
    <div class="body">
      <p class="note">Voici votre code de récupération de mot de passe :</p>
      <div class="otp">${otp}</div>
      <p class="note">Ce code expire dans <strong>10 minutes</strong>.<br>Ne le partagez avec personne.</p>
    </div>
    <div class="footer">IhamBaobab &mdash; Niamey, Niger &mdash; +227 87 72 75 01</div>
  </div>
</body>
</html>`;

// ─── Utilitaire commun de vérification OTP ─────────────────────────────────

const verifyOtpEntry = (key, inputOtp) => {
  const entry = otpStore.get(key);
  if (!entry) return { error: "Code OTP invalide ou expiré", status: 400 };
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return { error: "Code OTP expiré. Veuillez en demander un nouveau.", status: 400 };
  }
  if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
    otpStore.delete(key);
    return { error: "Trop de tentatives. Veuillez demander un nouveau code.", status: 429 };
  }
  if (entry.otp !== inputOtp) {
    entry.attempts += 1;
    const remaining = MAX_VERIFY_ATTEMPTS - entry.attempts;
    return { error: `Code OTP incorrect. ${remaining} tentative(s) restante(s).`, status: 401 };
  }
  otpStore.delete(key);
  return { ok: true };
};

// ─── CLIENT — mot de passe oublié par email ────────────────────────────────

const forgot_password = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email requis" });

  try {
    const key = email.toLowerCase().trim();

    // 1. Validation format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) {
      return res.status(400).json({ message: "Adresse email invalide." });
    }

    // 2. Vérification existence AVANT cooldown
    const user = await User.findOne({ email: key }).select("_id").lean();
    if (!user) return res.status(200).json({ message: "Si cet email existe, un code vous a été envoyé" });

    // 3. Cooldown
    const prev = otpStore.get(key);
    if (prev && Date.now() - prev.sentAt < OTP_COOLDOWN_EMAIL_MS) {
      const wait = Math.ceil((OTP_COOLDOWN_EMAIL_MS - (Date.now() - prev.sentAt)) / 1000);
      return res.status(429).json({ message: `Veuillez attendre ${wait} seconde(s) avant de renvoyer.` });
    }

    const otp = generateOtp();
    otpStore.set(key, { otp, expiresAt: Date.now() + OTP_EXPIRY_MS, sentAt: Date.now(), attempts: 0 });

    await getTransporter().sendMail({
      from: `"IhamBaobab" <${process.env.EMAIL_USER || process.env.MAIL_USER}>`,
      to: key,
      subject: "Code de récupération de mot de passe — IhamBaobab",
      html: buildHtml(otp),
    });

    return res.status(200).json({ message: "Code OTP envoyé par e-mail avec succès" });
  } catch (error) {
    console.error("forgot_password error:", error);
    return res.status(500).json({ message: "Erreur lors de l'envoi du code OTP" });
  }
};

const reset_password = async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) return res.status(400).json({ message: "Paramètres manquants" });
  if (newPassword.length < 6) return res.status(400).json({ message: "Mot de passe trop court (min 6 caractères)" });

  const check = verifyOtpEntry(email, otp);
  if (!check.ok) return res.status(check.status).json({ message: check.error });

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });
    await User.updateOne({ email: email.toLowerCase().trim() }, { password: await bcrypt.hash(newPassword, 10) });
    return res.status(200).json({ message: "Mot de passe mis à jour avec succès" });
  } catch (error) {
    console.error("reset_password error:", error);
    return res.status(500).json({ message: "Erreur lors de la mise à jour du mot de passe" });
  }
};

// ─── VENDEUR — mot de passe oublié par email OU SMS ───────────────────────

const forgot_password_seller = async (req, res) => {
  const { email, phone } = req.body;
  if (!email && !phone) return res.status(400).json({ message: "Email ou téléphone requis" });

  try {
    const sendMethod = email ? "email" : "sms";
    const key        = email
      ? email.toLowerCase().trim()
      : phone.replace(/\s+/g, "").trim();

    // ── ÉTAPE 1 : validation du format ───────────────────────────────────
    if (sendMethod === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) {
        return res.status(400).json({ message: "Adresse email invalide." });
      }
    } else {
      if (!/^\+\d{8,15}$/.test(key)) {
        return res.status(400).json({ message: "Numéro de téléphone invalide (format international requis)." });
      }
      // Préfixe pays autorisé — vérification avant toute lookup BDD
      if (!SMS_ALLOWED_PREFIXES.some(p => key.startsWith(p))) {
        return res.status(403).json({
          message: "Réinitialisation par SMS disponible uniquement pour les numéros Niger (+227) et Bénin (+229). Utilisez votre email.",
          suggestEmail: true,
        });
      }
    }

    // ── ÉTAPE 2 : vérification existence du compte ───────────────────────
    // On vérifie AVANT tout cooldown ou quota pour ne pas consumer de ressources
    // sur des identifiants inexistants. Réponse générique anti-énumération.
    const query  = sendMethod === "email" ? { email: key } : { phone: key };
    const seller = await SellerRequest.findOne(query).select("_id").lean();
    if (!seller) {
      return res.status(200).json({ message: "Si ce compte existe, un code vous a été envoyé" });
    }

    // ── ÉTAPE 3 : garde-fous anti-abus (compte vérifié existant) ─────────
    if (sendMethod === "sms") {
      const prev = otpStore.get(key);
      if (prev) {
        // Quota 24h par numéro
        const windowAge = Date.now() - (prev.smsWindowStart || prev.sentAt);
        const inWindow  = windowAge < SMS_WINDOW_MS;
        const count     = inWindow ? (prev.smsCount || 1) : 0;
        if (inWindow && count >= SMS_MAX_PER_WINDOW) {
          const resetIn = Math.ceil((SMS_WINDOW_MS - windowAge) / 3600000);
          return res.status(429).json({
            message: `Quota SMS atteint (${SMS_MAX_PER_WINDOW} SMS/24h). Réessayez dans ~${resetIn}h ou utilisez votre email.`,
            suggestEmail: true,
            quotaExceeded: true,
          });
        }
        // Cooldown 120s entre deux SMS
        if (Date.now() - prev.sentAt < OTP_COOLDOWN_SMS_MS) {
          const wait = Math.ceil((OTP_COOLDOWN_SMS_MS - (Date.now() - prev.sentAt)) / 1000);
          return res.status(429).json({ message: `Veuillez attendre ${wait} seconde(s) avant de renvoyer.` });
        }
      }
    } else {
      // Cooldown 60s email
      const prev = otpStore.get(key);
      if (prev && Date.now() - prev.sentAt < OTP_COOLDOWN_EMAIL_MS) {
        const wait = Math.ceil((OTP_COOLDOWN_EMAIL_MS - (Date.now() - prev.sentAt)) / 1000);
        return res.status(429).json({ message: `Veuillez attendre ${wait} seconde(s) avant de renvoyer.` });
      }
    }

    const otp  = generateOtp();
    const prev = otpStore.get(key);

    // Conserver le compteur SMS et la fenêtre 24h
    const smsWindowStart = sendMethod === "sms"
      ? (prev && prev.smsWindowStart && (Date.now() - prev.smsWindowStart) < SMS_WINDOW_MS
          ? prev.smsWindowStart
          : Date.now())
      : undefined;
    const smsCount = sendMethod === "sms"
      ? ((prev && prev.smsWindowStart && (Date.now() - prev.smsWindowStart) < SMS_WINDOW_MS)
          ? (prev.smsCount || 1) + 1
          : 1)
      : undefined;

    otpStore.set(key, {
      otp,
      expiresAt:      Date.now() + OTP_EXPIRY_MS,
      sentAt:         Date.now(),
      attempts:       0,
      ...(sendMethod === "sms" && { smsCount, smsWindowStart }),
    });

    if (sendMethod === "email") {
      await getTransporter().sendMail({
        from:    `"IhamBaobab" <${process.env.EMAIL_USER || process.env.MAIL_USER}>`,
        to:      email,
        subject: "Code de récupération de mot de passe — IhamBaobab Vendeurs",
        html:    buildHtml(otp),
      });
    } else {
      const smsText = `IhamBaobab: votre code est ${otp}. Expire dans 10 min. Ne partagez jamais ce code.`;
      await lafricaSms.sendSms({ to: key, text: smsText });
    }

    return res.status(200).json({
      message:    sendMethod === "sms" ? "Code OTP envoyé par SMS" : "Code OTP envoyé par e-mail",
      method:     sendMethod,
      ...(sendMethod === "sms" && { smsRemaining: SMS_MAX_PER_WINDOW - (smsCount ?? 1) }),
    });
  } catch (error) {
    console.error("forgot_password_seller error:", error);
    return res.status(500).json({ message: "Erreur lors de l'envoi du code OTP" });
  }
};

const reset_password_seller = async (req, res) => {
  const { email, phone, otp, newPassword } = req.body;
  const key = email ? email.toLowerCase().trim() : (phone ? phone.replace(/\s+/g, "").trim() : null);
  if (!key || !otp || !newPassword) return res.status(400).json({ message: "Paramètres manquants" });
  if (newPassword.length < 6) return res.status(400).json({ message: "Mot de passe trop court (min 6 caractères)" });

  const check = verifyOtpEntry(key, otp);
  if (!check.ok) return res.status(check.status).json({ message: check.error });

  try {
    const query = email ? { email: key } : { phone: key };
    const seller = await SellerRequest.findOne(query);
    if (!seller) return res.status(404).json({ message: "Compte vendeur non trouvé" });
    await SellerRequest.updateOne(query, { password: await bcrypt.hash(newPassword, 10) });
    return res.status(200).json({ message: "Mot de passe mis à jour avec succès" });
  } catch (error) {
    console.error("reset_password_seller error:", error);
    return res.status(500).json({ message: "Erreur lors de la mise à jour du mot de passe" });
  }
};

module.exports = {
  forgot_password,
  reset_password,
  forgot_password_seller,
  reset_password_seller,
};
