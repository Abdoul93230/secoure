/**
 * Commande sans compte (invité), suivi partageable et création du compte après coup.
 *
 *   POST /api/guest/session      { phone, name }       → jeton invité NON vérifié (paiement en ligne seulement)
 *   POST /api/guest/send-otp     { phone, name }       → 1 SMS court (limites communes)
 *   POST /api/guest/verify-otp   { phone, code }       → jeton invité vérifié (90 jours)
 *   GET  /api/guest/orders                            → commandes du numéro (jeton invité vérifié)
 *   POST /api/guest/claim        { password, name? }   → devient un vrai compte (aucun nouveau SMS)
 *   GET  /api/track/:reference?k=…                     → suivi public (lien partageable)
 *   GET  /api/orders/:id/share                         → lien de suivi d'une commande (propriétaire)
 */
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { User, Commande } = require("../Models");
const USER_KEY = require("../auth/clef");
const quick = require("../auth/quickAuthController");
const { signGuestToken, newTrackingToken } = require("../auth/guestAuth");

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const isFullAccount = (u) => !!u && u.isActive === true && !u.isGuest;
const cleanName = (n) => String(n || "").replace(/\s+/g, " ").trim().slice(0, 80);

function readPhone(req) {
  const phone = quick.normalizePhone(String(req.body?.phone || ""));
  return quick.phoneRegex.test(phone) ? phone : null;
}

/** Compte invité du numéro (créé au besoin, sans mot de passe utilisable) */
async function findOrCreateGuest(phone, name) {
  let user = await User.findOne({ phoneNumber: phone });
  if (!user) {
    user = new User({
      name: cleanName(name) || "Client",
      phoneNumber: phone,
      password: await bcrypt.hash(`guest-${crypto.randomBytes(12).toString("hex")}`, 10),
      isActive: false,
      isMinimalAccount: true,
      isGuest: true,
    });
    await user.save();
  } else if (!isFullAccount(user) && name && (!user.name || user.name === "Client" || user.name === "Utilisateur")) {
    user.name = cleanName(name);
    await user.save();
  }
  return user;
}

const publicUser = (u) => ({ id: String(u._id), name: u.name, phoneNumber: u.phoneNumber, isGuest: !isFullAccount(u) });

/** Démarrer sans compte : aucun SMS. Le jeton ne permet que le paiement en ligne. */
const startSession = async (req, res) => {
  try {
    const phone = readPhone(req);
    if (!phone) return fail(res, 400, "Numéro de téléphone invalide.");
    const existing = await User.findOne({ phoneNumber: phone });
    if (isFullAccount(existing)) {
      // Un compte existe : connexion (mot de passe) ou vérification par SMS pour commander sans s'y connecter
      return res.json({ success: true, data: { accountExists: true, needsOtp: true } });
    }
    const user = await findOrCreateGuest(phone, req.body?.name);
    return res.json({ success: true, data: { accountExists: false, verified: false, token: signGuestToken(user, { verified: false }), user: publicUser(user) } });
  } catch (e) {
    console.error("[guest/session]", e);
    return fail(res, 500, "Impossible de démarrer la commande. Réessayez.");
  }
};

const sendOtp = async (req, res) => {
  try {
    const phone = readPhone(req);
    if (!phone) return fail(res, 400, "Numéro de téléphone invalide.");
    const existing = await User.findOne({ phoneNumber: phone });
    const user = isFullAccount(existing) ? existing : await findOrCreateGuest(phone, req.body?.name);
    const r = await quick.deliverOtpTo(user, phone, { purpose: "guest-order" });
    // Code envoyé ou SMS en échec : si rien n'arrive, l'invité peut commander avec confirmation par appel
    if ((r.status === 200 || r.status === 502) && !isFullAccount(user)) {
      await User.updateOne({ _id: user._id }, { $set: { guestCallbackEligibleAt: new Date() } });
      r.body = { ...r.body, data: { ...(r.body?.data || {}), callbackAvailable: true } };
    }
    return res.status(r.status).json(r.body);
  } catch (e) {
    console.error("[guest/send-otp]", e);
    return fail(res, 500, "Envoi du code impossible.");
  }
};

const verifyOtp = async (req, res) => {
  try {
    const phone = readPhone(req);
    const code = String(req.body?.code || "").trim();
    if (!phone || !/^\d{4,8}$/.test(code)) return fail(res, 400, "Numéro et code requis.");
    const user = await User.findOne({ phoneNumber: phone });
    const otp = user?.quickAuthOtp;
    if (!otp?.code) return fail(res, 404, "Aucun code en cours pour ce numéro. Demandez un nouveau code.");
    if (!otp.expiresAt || new Date(otp.expiresAt) < new Date()) return fail(res, 410, "Ce code a expiré. Demandez-en un nouveau.");
    const attempts = otp.verifyAttempts || 0;
    if (attempts >= quick.OTP_MAX_VERIFY_ATTEMPTS) return fail(res, 429, "Trop d'essais. Demandez un nouveau code.");
    if (otp.code !== code) {
      user.quickAuthOtp.verifyAttempts = attempts + 1;
      await user.save();
      return fail(res, 401, "Code incorrect.", { data: { attemptsRemaining: Math.max(0, quick.OTP_MAX_VERIFY_ATTEMPTS - attempts - 1) } });
    }
    user.quickAuthOtp = undefined;
    user.guestVerifiedAt = new Date();
    await user.save();
    // Numéro vérifié : les commandes en attente d'appel sont confirmées
    await Commande.updateMany({ clefUser: String(user._id), phoneConfirmation: "pending" }, { $set: { phoneConfirmation: "confirmed" } });
    return res.json({
      success: true,
      data: { verified: true, token: signGuestToken(user, { verified: true }), user: publicUser(user), accountExists: isFullAccount(user) },
    });
  } catch (e) {
    console.error("[guest/verify-otp]", e);
    return fail(res, 500, "Vérification impossible.");
  }
};

/** Vue d'une commande sans données sensibles (suivi public, liste invité) */
function safeOrder(c, { owner = false } = {}) {
  const ld = c.livraisonDetails || {};
  const phone = String(ld.numero || "");
  return {
    _id: owner ? String(c._id) : undefined,
    reference: c.reference,
    date: c.date || c.createdAt,
    etatTraitement: c.etatTraitement,
    statusLivraison: c.statusLivraison,
    statusPayment: c.statusPayment,
    prix: c.prix,
    prixTotal: c.prixTotal,
    fraisLivraison: c.fraisLivraison,
    reduction: c.reduction,
    isGuestOrder: !!c.isGuestOrder,
    phoneConfirmation: c.phoneConfirmation || "none",
    shippingByStore: (c.shippingByStore || []).map((s) => ({ storeName: s.storeName, shippingCost: s.shippingCost, delay: s.delay || null, relation: s.relation || null })),
    items: (c.prod || []).map((p) => ({
      _id: String(p._id || ""),
      name: p.name,
      image: p.colorImage || p.imageUrl || p.image1 || null,
      quantite: Number(p.quantite || p.quantity) || 1,
      prix: p.prixSnapshot || p.prixPromo || p.prix || 0,
      color: p.color || (p.colors || [])[0] || null,
      taille: p.taille || (p.sizes || [])[0] || null,
    })),
    livraison: {
      customerName: owner ? ld.customerName : (ld.customerName || "").split(" ")[0] || null,
      zone: ld.quartier || null,
      region: ld.region || null,
      phoneMasked: phone ? `${phone.slice(0, 4)} •• •• ${phone.slice(-4, -2)} ${phone.slice(-2)}` : null,
      ...(owner ? { numero: ld.numero, landmark: ld.landmark || null, description: ld.description || null } : {}),
    },
    ...(owner && c.trackingToken ? { trackingToken: c.trackingToken } : {}),
  };
}

const myOrders = async (req, res) => {
  try {
    if (!req.actor || (req.actor.kind === "guest" && !req.actor.verified)) return fail(res, 403, "Vérifiez votre numéro pour voir vos commandes.", { code: "GUEST_OTP_REQUIRED" });
    const orders = await Commande.find({ clefUser: req.actor.userId }).sort({ date: -1, _id: -1 }).limit(100).lean();
    // Lien de suivi pour les anciennes commandes qui n'en ont pas encore
    for (const c of orders) {
      if (!c.trackingToken) {
        c.trackingToken = newTrackingToken();
        await Commande.updateOne({ _id: c._id, trackingToken: { $exists: false } }, { $set: { trackingToken: c.trackingToken } });
      }
    }
    return res.json({ success: true, data: orders.map((c) => safeOrder(c, { owner: true })) });
  } catch (e) {
    console.error("[guest/orders]", e);
    return fail(res, 500, "Commandes indisponibles.");
  }
};

/** Invité vérifié → vrai compte : mot de passe choisi, aucun nouveau SMS, historique et points conservés */
const claimAccount = async (req, res) => {
  try {
    if (req.actor?.kind !== "guest" || !req.actor.verified) return fail(res, 403, "Vérifiez d'abord votre numéro.", { code: "GUEST_OTP_REQUIRED" });
    const password = String(req.body?.password || "");
    if (password.length < 6) return fail(res, 400, "Le mot de passe doit contenir au moins 6 caractères.");
    const user = await User.findById(req.actor.userId);
    if (!user) return fail(res, 404, "Compte introuvable.");
    if (isFullAccount(user)) return fail(res, 409, "Ce numéro a déjà un compte : connectez-vous.", { code: "ACCOUNT_EXISTS" });

    user.password = await bcrypt.hash(password, 10);
    if (req.body?.name) user.name = cleanName(req.body.name);
    user.isActive = true;
    user.isGuest = false;
    user.isMinimalAccount = true;
    user.quickAuthPending = false;
    await user.save();
    await quick.ensureMinimalProfile(user._id, user.phoneNumber || null);
    try {
      await require("../services/referralService").attachReferralOnRegister({ userId: user._id, refCode: req.body?.refCode });
    } catch (gErr) {
      console.error("[guest/claim] parrainage:", gErr.message);
    }
    let points = 0;
    try {
      points = (await require("../services/pointsService").getWallet(user._id))?.balance || 0;
    } catch (_) { /* portefeuille facultatif */ }

    const token = jwt.sign({ userId: user._id, role: "user" }, USER_KEY, { expiresIn: "7d" });
    return res.json({
      success: true,
      message: "Votre compte est créé",
      token,
      user: { id: user._id, name: user.name, email: user.email || null, phoneNumber: user.phoneNumber, isMinimalAccount: true },
      data: { points },
    });
  } catch (e) {
    console.error("[guest/claim]", e);
    return fail(res, 500, "Création du compte impossible.");
  }
};

/** Suivi public par lien : référence + jeton (comparaison à temps constant) */
const trackOrder = async (req, res) => {
  try {
    const reference = String(req.params.reference || "").slice(0, 64);
    const k = String(req.query.k || "");
    if (!reference || k.length < 16) return fail(res, 400, "Lien de suivi invalide.");
    const c = await Commande.findOne({ reference }).lean();
    const ok = c?.trackingToken && c.trackingToken.length === k.length
      && crypto.timingSafeEqual(Buffer.from(c.trackingToken), Buffer.from(k));
    if (!ok) return fail(res, 404, "Commande introuvable ou lien expiré.");
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, data: safeOrder(c) });
  } catch (e) {
    console.error("[track]", e);
    return fail(res, 500, "Suivi indisponible.");
  }
};

/** Lien de partage d'une commande (propriétaire, invité vérifié ou admin) */
const shareLink = async (req, res) => {
  try {
    const c = await Commande.findById(req.params.id, { clefUser: 1, reference: 1, trackingToken: 1 }).lean();
    if (!c) return fail(res, 404, "Commande introuvable.");
    const isOwner = req.actor && String(c.clefUser) === String(req.actor.userId);
    if (!(isOwner || req.actor?.kind === "admin")) return fail(res, 403, "Action non autorisée.");
    let token = c.trackingToken;
    if (!token) {
      token = newTrackingToken();
      await Commande.updateOne({ _id: c._id }, { $set: { trackingToken: token } });
    }
    const site = (process.env.SITE_URL || "https://ihambaobab.com").replace(/\/+$/, "");
    return res.json({ success: true, data: { reference: c.reference, token, url: `${site}/suivi/${encodeURIComponent(c.reference)}?k=${token}` } });
  } catch (e) {
    console.error("[orders/share]", e);
    return fail(res, 500, "Lien indisponible.");
  }
};

module.exports = { startSession, sendOtp, verifyOtp, myOrders, claimAccount, trackOrder, shareLink, safeOrder };
