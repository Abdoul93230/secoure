/**
 * Compte de test pour les équipes de validation Apple (App Store) et Google (Play Store).
 *
 * Crée le compte client (ou le met à jour s'il existe déjà) exactement comme une inscription
 * dans l'app, mais sans code SMS : les testeurs se connectent avec le numéro + le mot de passe.
 * Le compte peut tout utiliser : panier, commande, messagerie, favoris, Baobab Points, profil.
 *
 * Ajoute 4 commandes de démonstration (livrée, en livraison, en préparation, annulée) ;
 * option --sans-commandes pour ne créer que le compte.
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

/**
 * Commandes de démonstration (isDemo) avec de vrais articles publiés :
 * livrée, en livraison (avec code de livraison), en préparation, annulée.
 * Jamais visibles par les vendeurs ni comptées dans leurs finances (insérées sans passer
 * par les transitions d'état). Recréées à chaque lancement du script.
 */
async function seedDemoOrders(user) {
  const { Commande, Produit, SellerRequest } = require("../src/Models");
  const { newTrackingToken } = require("../src/auth/guestAuth");
  const userId = String(user._id);

  await Commande.deleteMany({ clefUser: userId, isDemo: true });

  const products = await Produit.find({
    isPublished: "Published", isDeleted: { $ne: true }, quantite: { $gt: 0 }, image1: { $nin: [null, ""] }, prix: { $gt: 0 },
  }).select("_id name prix prixPromo image1 image2 image3 Clefournisseur").sort({ createdAt: -1 }).limit(12).lean();
  if (products.length < 2) {
    console.warn("⚠️ Pas assez d'articles publiés : commandes de démonstration non créées.");
    return [];
  }
  const sellers = await SellerRequest.find({ _id: { $in: products.map((p) => p.Clefournisseur) } }, { storeName: 1, name: 1 }).lean();
  const storeName = new Map(sellers.map((s) => [String(s._id), s.storeName || s.name || "Boutique"]));

  const pick = (i) => products[i % products.length];
  const unit = (p) => (p.prixPromo > 0 && p.prixPromo < p.prix ? p.prixPromo : p.prix);
  const day = 864e5;
  const ago = (d, h = 0) => new Date(Date.now() - d * day - h * 3600e3);
  const code4 = () => String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  const courier = { id: null, name: "Livreur Ihambaobab", phone: "" };
  const ev = (type, at, by, note = "", storeId = null) => ({ at, type, by, note, storeId });
  const CLIENT = { kind: "client", id: userId, name: "" };
  const SELLER = (sid) => ({ kind: "seller", id: sid, name: "Boutique" });
  const SHIPPING = 1000;
  const tag = userId.slice(-4).toUpperCase(); // références distinctes si plusieurs comptes de test

  const build = ({ ref, items, status, etat, livraison, at, history, delivered, pickedUp, cancel, points = 0 }) => {
    const lines = items.map(([i, q]) => ({ p: pick(i), q }));
    const subtotal = lines.reduce((s, l) => s + unit(l.p) * l.q, 0);
    const stores = [...new Set(lines.map((l) => String(l.p.Clefournisseur)))];
    const pointsDiscount = Math.min(points * 20, Math.floor(subtotal * 0.3));
    return {
      clefUser: userId,
      isDemo: true,
      reference: ref,
      date: at,
      nbrProduits: lines.map((l) => ({ produit: l.p._id, quantite: l.q, isValideSeller: etat !== "traitement" || !!history.find((e) => e.type === "accepted") })),
      prod: lines.map((l) => ({
        _id: l.p._id, name: l.p.name, prix: l.p.prix, prixPromo: l.p.prixPromo || 0, prixSnapshot: unit(l.p),
        image1: l.p.image1, image2: l.p.image2, image3: l.p.image3, quantite: l.q,
        Clefournisseur: l.p.Clefournisseur, createdBy: String(l.p.Clefournisseur),
      })),
      prixTotal: subtotal,
      fraisLivraison: SHIPPING * stores.length,
      reduction: 0,
      pointsUsed: pointsDiscount ? points : 0,
      pointsDiscount,
      prix: subtotal + SHIPPING * stores.length - pointsDiscount,
      statusPayment: status,
      etatTraitement: etat,
      statusLivraison: livraison,
      awaitingPayment: false,
      sellerNotifiedAt: at,
      livraisonDetails: { customerName: user.name, numero: user.phoneNumber, email: user.email, region: "Niamey", quartier: "Plateau" },
      shippingByStore: stores.map((sid) => ({ storeId: sid, storeName: storeName.get(sid) || "Boutique", shippingCost: SHIPPING, delay: "24 h" })),
      trackingToken: newTrackingToken(),
      handover: {
        deliveryCode: code4(),
        deliveryAttempts: 0,
        deliveredAt: delivered || null,
        deliveredBy: delivered ? courier : null,
        stores: stores.map((sid) => ({
          storeId: sid, storeName: storeName.get(sid) || "Boutique", pickupCode: code4(),
          pickedUpAt: pickedUp || null, courier: pickedUp ? courier : null, attempts: 0,
        })),
      },
      ...(cancel ? { cancel, cancelReason: cancel.reason, cancelledAt: cancel.at, stockRestored: true } : {}),
      history,
    };
  };

  const sid0 = String(pick(0).Clefournisseur);
  const sid2 = String(pick(2).Clefournisseur);
  const docs = [
    // 1. Livrée, payée en ligne, avec points utilisés
    build({
      ref: `DEMO-${tag}-LIVREE`, items: [[0, 1], [1, 1]], status: "payé", etat: "livré", livraison: "livré", at: ago(6), points: 50,
      pickedUp: ago(5, 20), delivered: ago(5, 18),
      history: [
        ev("created", ago(6), CLIENT, "Paiement en ligne"),
        ev("paid", ago(6, -0.1), { kind: "ipay", name: "iPay" }),
        ev("accepted", ago(6, -1), SELLER(sid0), "", sid0),
        ev("picked_up", ago(5, 20), { kind: "courier", ...courier }),
        ev("delivered", ago(5, 18), { kind: "courier", ...courier }, "Code client vérifié"),
      ],
    }),
    // 2. En cours de livraison, paiement à la livraison : le code de livraison s'affiche
    build({
      ref: `DEMO-${tag}-EN-ROUTE`, items: [[2, 1]], status: "payé à la livraison", etat: "reçu par le livreur", livraison: "en cours", at: ago(1),
      pickedUp: ago(0, 2),
      history: [
        ev("created", ago(1), CLIENT, "Paiement à la livraison"),
        ev("accepted", ago(1, -2), SELLER(sid2), "", sid2),
        ev("picked_up", ago(0, 2), { kind: "courier", ...courier }),
      ],
    }),
    // 3. En préparation, payée en ligne
    build({
      ref: `DEMO-${tag}-PREPARATION`, items: [[3, 2]], status: "payé", etat: "traitement", livraison: "en cours", at: ago(0, 5),
      history: [
        ev("created", ago(0, 5), CLIENT, "Paiement en ligne"),
        ev("paid", ago(0, 4.9), { kind: "ipay", name: "iPay" }),
      ],
    }),
    // 4. Annulée à la demande du client
    build({
      ref: `DEMO-${tag}-ANNULEE`, items: [[4, 1]], status: "payé à la livraison", etat: "annulé", livraison: "en cours", at: ago(10),
      cancel: { reason: "client_annule", byKind: "admin", byLabel: "Équipe Ihambaobab", note: "", at: ago(9, 20) },
      history: [
        ev("created", ago(10), CLIENT, "Paiement à la livraison"),
        ev("cancelled", ago(9, 20), { kind: "admin" }, "Annulée à la demande du client"),
      ],
    }),
  ];
  await Commande.insertMany(docs);

  // Baobab Points gagnés sur la commande livrée (une seule fois, même si le script est relancé)
  try {
    await require("../src/services/pointsService").creditPoints({
      userId, delta: 150, type: "PURCHASE", reason: `Points gagnés sur la commande DEMO-${userId.slice(-4).toUpperCase()}-LIVREE`,
      idempotencyKey: `DEMO_PURCHASE_${userId}`,
    });
  } catch (e) {
    console.warn("⚠️ Points de démonstration non crédités :", e.message);
  }
  return docs.map((d) => d.reference);
}

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

  const orders = process.argv.includes("--sans-commandes") ? [] : await seedDemoOrders(user);

  console.log(`✅ Compte de test ${created ? "créé" : "mis à jour"}`);
  if (orders.length) console.log(`   Commandes de démonstration : ${orders.join(" · ")}`);
  console.log(`   Nom         : ${name}`);
  console.log(`   Téléphone   : ${phone}`);
  console.log(`   E-mail      : ${email}`);
  console.log(`   Mot de passe: ${password}`);
  console.log(`   Identifiant : ${user._id}`);
  console.log("\nDans l'app : Profil → Se connecter → numéro → mot de passe (aucun SMS).");
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => fail(e.message));
