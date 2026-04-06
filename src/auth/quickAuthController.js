const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { User } = require("../Models");
const privateKey = require("./clef");

const OTP_EXPIRY_MINUTES = 10;
const OTP_COOLDOWN_SECONDS = 60;
const OTP_MAX_SEND_ATTEMPTS = 3;
const OTP_SEND_WINDOW_MINUTES = 15;
const OTP_MAX_VERIFY_ATTEMPTS = 5;

const phoneRegex = /^\+[1-9]\d{7,14}$/;

const normalizePhone = (value = "") => value.replace(/\s+/g, "").trim();
const shouldExposeDevOtp =
  process.env.SHOW_DEV_OTP === "true" || process.env.NODE_ENV !== "production";

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const getContactSelector = ({ phone }) => {
  if (phone) return { phoneNumber: normalizePhone(phone) };
  return null;
};

const buildOtpPayload = (previousOtp = {}) => {
  const now = new Date();
  const otpCode = generateOtp();

  const windowStartedAt = previousOtp.windowStartedAt
    ? new Date(previousOtp.windowStartedAt)
    : now;

  const isOutsideWindow = now.getTime() - windowStartedAt.getTime() > OTP_SEND_WINDOW_MINUTES * 60 * 1000;
  const sendCount = isOutsideWindow ? 1 : (previousOtp.sendCount || 0) + 1;

  return {
    code: otpCode,
    expiresAt: new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000),
    verified: false,
    sendCount,
    lastSentAt: now,
    windowStartedAt: isOutsideWindow ? now : windowStartedAt,
    verifyAttempts: 0,
  };
};

const checkPhone = async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone || "");

    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Format de numero invalide. Utilisez un format international (+22790123456).",
      });
    }

    const user = await User.findOne({ phoneNumber: phone });
    const exists = !!user && user.quickAuthPending !== true;

    return res.status(200).json({
      success: true,
      message: "Verification du numero effectuee",
      data: {
        exists,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Erreur lors de la verification du numero",
      error: error.message,
    });
  }
};

const sendOtp = async (req, res) => {
  try {
    const rawPhone = req.body?.phone;
    const name = req.body?.name || "Utilisateur";

    const phone = rawPhone ? normalizePhone(rawPhone) : null;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Un numero de telephone est requis",
      });
    }

    if (phone && !phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Format de numero invalide",
      });
    }

    const selector = getContactSelector({ phone });
    if (!selector) {
      return res.status(400).json({
        success: false,
        message: "Contact invalide",
      });
    }

    let user = await User.findOne(selector);

    if (user && user.password && user.isActive === true) {
      return res.status(409).json({
        success: false,
        message: "Un compte actif existe deja pour ce contact. Utilisez la connexion.",
      });
    }

    if (!user) {
      // Le mot de passe sera défini après vérification OTP (étape finale).
      const tempPassword = await bcrypt.hash(`temp-${Date.now()}`, 10);
      user = new User({
        name,
        phoneNumber: phone || undefined,
        password: tempPassword,
        isActive: false,
        isMinimalAccount: true,
      });
    }

    const previousOtp = user.quickAuthOtp || {};
    const now = new Date();

    if (previousOtp.lastSentAt) {
      const secondsSinceLast = Math.floor((now.getTime() - new Date(previousOtp.lastSentAt).getTime()) / 1000);
      if (secondsSinceLast < OTP_COOLDOWN_SECONDS) {
        return res.status(429).json({
          success: false,
          message: `Veuillez patienter ${OTP_COOLDOWN_SECONDS - secondsSinceLast}s avant de redemander un code.`,
          data: {
            cooldownSeconds: OTP_COOLDOWN_SECONDS - secondsSinceLast,
          },
        });
      }
    }

    const windowStartedAt = previousOtp.windowStartedAt ? new Date(previousOtp.windowStartedAt) : now;
    const inWindow = now.getTime() - windowStartedAt.getTime() <= OTP_SEND_WINDOW_MINUTES * 60 * 1000;
    const currentAttempts = inWindow ? previousOtp.sendCount || 0 : 0;

    if (currentAttempts >= OTP_MAX_SEND_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        message: "Limite de demandes OTP atteinte. Reessayez plus tard.",
        data: {
          attemptsRemaining: 0,
          retryAfterMinutes: OTP_SEND_WINDOW_MINUTES,
        },
      });
    }

    const otpPayload = buildOtpPayload(previousOtp);
    user.quickAuthOtp = otpPayload;
    user.quickAuthPending = true;
    await user.save();

    const response = {
      success: true,
      message: "Code OTP genere avec succes",
      data: {
        attemptsRemaining: Math.max(0, OTP_MAX_SEND_ATTEMPTS - otpPayload.sendCount),
        cooldownSeconds: OTP_COOLDOWN_SECONDS,
        expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
      },
    };

    if (shouldExposeDevOtp) {
      response.data.devOTP = otpPayload.code;
    }

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Erreur lors de l'envoi OTP",
      error: error.message,
    });
  }
};

const resendOtp = async (req, res) => sendOtp(req, res);

const verifyOtp = async (req, res) => {
  try {
    const rawPhone = req.body?.phone;
    const code = (req.body?.code || req.body?.otp || "").trim();

    const phone = rawPhone ? normalizePhone(rawPhone) : null;

    const selector = getContactSelector({ phone });
    if (!selector || !code) {
      return res.status(400).json({
        success: false,
        message: "Contact et code OTP sont requis",
      });
    }

    const user = await User.findOne(selector);
    if (!user || !user.quickAuthOtp) {
      return res.status(404).json({
        success: false,
        message: "Aucun OTP actif trouve pour ce contact",
      });
    }

    const now = new Date();
    const otpData = user.quickAuthOtp;

    if (!otpData.expiresAt || new Date(otpData.expiresAt).getTime() < now.getTime()) {
      return res.status(410).json({
        success: false,
        message: "Le code OTP a expire",
      });
    }

    const verifyAttempts = otpData.verifyAttempts || 0;
    if (verifyAttempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        message: "Nombre maximum de tentatives OTP atteint. Demandez un nouveau code.",
        data: {
          attemptsRemaining: 0,
        },
      });
    }

    if (otpData.code !== code) {
      user.quickAuthOtp.verifyAttempts = verifyAttempts + 1;
      await user.save();

      return res.status(401).json({
        success: false,
        message: "Code OTP incorrect",
        data: {
          attemptsRemaining: Math.max(0, OTP_MAX_VERIFY_ATTEMPTS - (verifyAttempts + 1)),
        },
      });
    }

    user.quickAuthOtp.verified = true;
    user.quickAuthOtp.verifiedAt = now;
    user.quickAuthOtp.verifyAttempts = 0;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Code OTP verifie avec succes",
      data: {
        verified: true,
        attemptsRemaining: OTP_MAX_VERIFY_ATTEMPTS,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Erreur lors de la verification OTP",
      error: error.message,
    });
  }
};

const quickRegister = async (req, res) => {
  try {
    const rawPhone = req.body?.phone;
    const name = (req.body?.name || "").trim();
    const password = req.body?.password || "";

    const phone = rawPhone ? normalizePhone(rawPhone) : null;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Un numero de telephone est requis",
      });
    }

    if (phone && !phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Format de numero invalide",
      });
    }

    if (!name || name.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Le nom est requis (minimum 2 caracteres)",
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Le mot de passe doit contenir au moins 6 caracteres",
      });
    }

    const selector = getContactSelector({ phone });
    const user = await User.findOne(selector);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur temporaire introuvable",
      });
    }

    if (!user.quickAuthOtp || user.quickAuthOtp.verified !== true) {
      return res.status(403).json({
        success: false,
        message: "Verification OTP requise avant finalisation du compte",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    user.name = name;
    user.password = hashedPassword;
    user.isActive = true;
    user.isMinimalAccount = true;
    user.needsPasswordChange = false;
    user.quickAuthPending = false;
    user.quickAuthOtp = undefined;

    if (phone) {
      user.phoneNumber = phone;
    }

    await user.save();

    const token = jwt.sign({ userId: user._id, role: "user" }, privateKey, {
      expiresIn: "7d",
    });
    const refreshToken = jwt.sign({ userId: user._id, role: "user" }, privateKey, {
      expiresIn: "30d",
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: false,
    });

    return res.status(200).json({
      success: true,
      message: "Inscription rapide terminee",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email || null,
        phoneNumber: user.phoneNumber,
        isMinimalAccount: true,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Erreur lors de l'inscription rapide",
      error: error.message,
    });
  }
};

const requestPasswordResetOtp = async (req, res) => {
  try {
    const rawPhone = req.body?.phone;
    const phone = rawPhone ? normalizePhone(rawPhone) : null;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Un numero de telephone est requis",
      });
    }

    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Format de numero invalide",
      });
    }

    const user = await User.findOne({ phoneNumber: phone });
    if (!user || user.quickAuthPending === true || user.isActive === false) {
      return res.status(404).json({
        success: false,
        message: "Aucun compte actif trouve pour ce numero",
      });
    }

    const previousOtp = user.quickAuthOtp || {};
    const now = new Date();

    if (previousOtp.lastSentAt) {
      const secondsSinceLast = Math.floor((now.getTime() - new Date(previousOtp.lastSentAt).getTime()) / 1000);
      if (secondsSinceLast < OTP_COOLDOWN_SECONDS) {
        return res.status(429).json({
          success: false,
          message: `Veuillez patienter ${OTP_COOLDOWN_SECONDS - secondsSinceLast}s avant de redemander un code.`,
          data: {
            cooldownSeconds: OTP_COOLDOWN_SECONDS - secondsSinceLast,
          },
        });
      }
    }

    const windowStartedAt = previousOtp.windowStartedAt ? new Date(previousOtp.windowStartedAt) : now;
    const inWindow = now.getTime() - windowStartedAt.getTime() <= OTP_SEND_WINDOW_MINUTES * 60 * 1000;
    const currentAttempts = inWindow ? previousOtp.sendCount || 0 : 0;

    if (currentAttempts >= OTP_MAX_SEND_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        message: "Limite de demandes OTP atteinte. Reessayez plus tard.",
        data: {
          attemptsRemaining: 0,
          retryAfterMinutes: OTP_SEND_WINDOW_MINUTES,
        },
      });
    }

    const otpPayload = buildOtpPayload(previousOtp);
    otpPayload.purpose = "password-reset";
    user.quickAuthOtp = otpPayload;
    await user.save();

    const response = {
      success: true,
      message: "Code OTP de reinitialisation genere avec succes",
      data: {
        attemptsRemaining: Math.max(0, OTP_MAX_SEND_ATTEMPTS - otpPayload.sendCount),
        cooldownSeconds: OTP_COOLDOWN_SECONDS,
        expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
      },
    };

    if (shouldExposeDevOtp) {
      response.data.devOTP = otpPayload.code;
    }

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Erreur lors de la demande OTP de reinitialisation",
      error: error.message,
    });
  }
};

const resetPasswordWithPhoneOtp = async (req, res) => {
  try {
    const rawPhone = req.body?.phone;
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    const code = (req.body?.code || req.body?.otp || "").trim();
    const newPassword = req.body?.newPassword || "";

    if (!phone || !code || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Numero, code OTP et nouveau mot de passe sont requis",
      });
    }

    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Format de numero invalide",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Le mot de passe doit contenir au moins 6 caracteres",
      });
    }

    const user = await User.findOne({ phoneNumber: phone });
    if (!user || !user.quickAuthOtp) {
      return res.status(404).json({
        success: false,
        message: "Aucun OTP actif trouve pour ce numero",
      });
    }

    const otpData = user.quickAuthOtp;
    const now = new Date();

    if (otpData.purpose !== "password-reset") {
      return res.status(400).json({
        success: false,
        message: "Ce code OTP n'est pas valide pour une reinitialisation de mot de passe",
      });
    }

    if (!otpData.expiresAt || new Date(otpData.expiresAt).getTime() < now.getTime()) {
      return res.status(410).json({
        success: false,
        message: "Le code OTP a expire",
      });
    }

    if (otpData.code !== code) {
      const verifyAttempts = otpData.verifyAttempts || 0;
      user.quickAuthOtp.verifyAttempts = verifyAttempts + 1;
      await user.save();
      return res.status(401).json({
        success: false,
        message: "Code OTP incorrect",
        data: {
          attemptsRemaining: Math.max(0, OTP_MAX_VERIFY_ATTEMPTS - (verifyAttempts + 1)),
        },
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.needsPasswordChange = false;
    user.quickAuthOtp = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Mot de passe reinitialise avec succes",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Erreur lors de la reinitialisation du mot de passe",
      error: error.message,
    });
  }
};

module.exports = {
  checkPhone,
  sendOtp,
  resendOtp,
  verifyOtp,
  quickRegister,
  requestPasswordResetOtp,
  resetPasswordWithPhoneOtp,
};
