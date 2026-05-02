const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const { User, SellerRequest } = require("../Models");
const lafricaSms = require("../services/lafricaMobileSmsService");

const OTP_EXPIRY_MS   = 10 * 60 * 1000; // 10 minutes
const OTP_COOLDOWN_MS = 60 * 1000;       // 60 secondes entre deux envois
const MAX_VERIFY_ATTEMPTS = 5;           // tentatives max de vérification

// Stockage en mémoire : email/phone → { otp, expiresAt, attempts, lastSentAt }
const otpStore = new Map();

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const getTransporter = () =>
  nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.MAIL_USER || "HabouNiger227@gmail.com",
      pass: process.env.MAIL_PASS || "lctrgorwycvjrqcv",
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
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    // Réponse générique pour éviter l'énumération d'utilisateurs
    if (!user) return res.status(200).json({ message: "Si cet email existe, un code vous a été envoyé" });

    const prev = otpStore.get(email);
    if (prev && Date.now() - prev.sentAt < OTP_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_COOLDOWN_MS - (Date.now() - prev.sentAt)) / 1000);
      return res.status(429).json({ message: `Veuillez attendre ${wait} seconde(s) avant de renvoyer.` });
    }

    const otp = generateOtp();
    otpStore.set(email, { otp, expiresAt: Date.now() + OTP_EXPIRY_MS, sentAt: Date.now(), attempts: 0 });

    await getTransporter().sendMail({
      from: `"IhamBaobab" <${process.env.MAIL_USER || "HabouNiger227@gmail.com"}>`,
      to: email,
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
    let seller = null;
    let key = null;
    let sendMethod = null;

    if (email) {
      seller = await SellerRequest.findOne({ email: email.toLowerCase().trim() });
      key = email.toLowerCase().trim();
      sendMethod = "email";
    } else {
      const normalized = phone.replace(/\s+/g, "").trim();
      seller = await SellerRequest.findOne({ phone: normalized });
      key = normalized;
      sendMethod = "sms";
    }

    // Réponse générique anti-énumération
    if (!seller) {
      return res.status(200).json({ message: "Si ce compte existe, un code vous a été envoyé" });
    }

    const prev = otpStore.get(key);
    if (prev && Date.now() - prev.sentAt < OTP_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_COOLDOWN_MS - (Date.now() - prev.sentAt)) / 1000);
      return res.status(429).json({ message: `Veuillez attendre ${wait} seconde(s) avant de renvoyer.` });
    }

    const otp = generateOtp();
    otpStore.set(key, { otp, expiresAt: Date.now() + OTP_EXPIRY_MS, sentAt: Date.now(), attempts: 0 });

    if (sendMethod === "email") {
      await getTransporter().sendMail({
        from: `"IhamBaobab" <${process.env.MAIL_USER || "HabouNiger227@gmail.com"}>`,
        to: email,
        subject: "Code de récupération de mot de passe — IhamBaobab Vendeurs",
        html: buildHtml(otp),
      });
    } else {
      const smsText = `Votre code IhamBaobab est ${otp}. Il expire dans 10 minutes. Ne le partagez jamais.`;
      await lafricaSms.sendSms({ to: key, message: smsText });
    }

    return res.status(200).json({
      message: sendMethod === "sms"
        ? "Code OTP envoyé par SMS avec succès"
        : "Code OTP envoyé par e-mail avec succès",
      method: sendMethod,
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
