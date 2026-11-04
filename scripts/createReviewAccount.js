/**
 * Compte de test pour les équipes de validation Apple (App Store) et Google (Play Store).
 *
 * Crée le compte client (ou le met à jour s'il existe déjà) exactement comme une inscription
 * dans l'app, mais sans code SMS : les testeurs se connectent avec le numéro + le mot de passe.
 * Le compte peut tout utiliser : panier, commande, messagerie, favoris, Baobab Points, profil.
 *
 * Usage (sur le serveur, dans le conteneur du backend) :
 *   node scripts/createReviewAccount.js --phone +22790000000 --email test@ihambaobab.com --password MotDePasse123 [--name "Testeur Ihambaobab"]
 *
 * Relancer le script avec le même numéro ou le même e-mail remet le mot de passe à jour.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const fail = (msg) => {
  console.error(`❌ ${msg}`);
  process.exit(1);
};

(async () => {
  const phone = String(arg("phone") || "").replace(/[\s.()-]/g, "");
  const email = String(arg("email") || "").trim().toLowerCase();
  const password = String(arg("password") || "");
  const name = String(arg("name") || "Testeur Ihambaobab").trim();

  if (!/^\+[1-9]\d{7,14}$/.test(phone)) fail("Numéro invalide : format international sans espace, ex. +22790000000");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("E-mail invalide.");
  if (password.length < 6) fail("Mot de passe trop court (6 caractères minimum).");
  if (name.length < 2) fail("Nom trop court.");

  const uri = process.env.MONGODB_URI;
  if (!uri) fail("MONGODB_URI manquant (lancer le script dans le conteneur du backend).");
  await mongoose.connect(uri);

  const { User } = require("../src/Models");
  const { ensureMinimalProfile } = require("../src/auth/quickAuthController");

  // Le numéro ou l'e-mail ne doit pas appartenir à deux comptes différents
  const [byPhone, byEmail] = await Promise.all([User.findOne({ phoneNumber: phone }), User.findOne({ email })]);
  if (byPhone && byEmail && String(byPhone._id) !== String(byEmail._id)) {
    fail(`Le numéro et l'e-mail appartiennent à deux comptes différents (${byPhone._id} / ${byEmail._id}).`);
  }

  const user = byPhone || byEmail || new User();
  const created = user.isNew;
  user.name = name;
  user.email = email;
  user.phoneNumber = phone;
  user.password = await bcrypt.hash(password, 10);
  user.isActive = true;
  user.isMinimalAccount = false;
  user.needsPasswordChange = false;
  user.quickAuthPending = false;
  user.quickAuthOtp = undefined;
  user.isReviewAccount = true; // repère pour l'équipe (compte de validation des stores)
  await user.save();

  await ensureMinimalProfile(user._id, phone);

  // Portefeuille Baobab Points (créé à l'inscription dans l'app)
  try {
    await require("../src/services/pointsService").getOrCreateWallet(String(user._id));
  } catch (e) {
    console.warn("⚠️ Portefeuille de points non créé :", e.message);
  }

  console.log(`✅ Compte de test ${created ? "créé" : "mis à jour"}`);
  console.log(`   Nom         : ${name}`);
  console.log(`   Téléphone   : ${phone}`);
  console.log(`   E-mail      : ${email}`);
  console.log(`   Mot de passe: ${password}`);
  console.log(`   Identifiant : ${user._id}`);
  console.log("\nDans l'app : Profil → Se connecter → numéro → mot de passe (aucun SMS).");
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => fail(e.message));
