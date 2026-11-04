/**
 * CYCLE DE VIE D'UNE COMMANDE PAYÉE EN LIGNE (iPay : Mobile Money, carte…)
 *
 * À la création, la commande RÉSERVE le stock, le code promo et les Baobab Points
 * (personne d'autre ne peut les prendre pendant le paiement), mais :
 *   - le vendeur n'est PAS prévenu et ne voit pas la commande (awaitingPayment: true) ;
 *   - si le paiement n'aboutit pas dans PAYMENT_WINDOW_MIN minutes, la commande est
 *     annulée automatiquement et tout est rendu : stock, code promo, points.
 * Au paiement confirmé (webhook iPay signé), le vendeur est prévenu et voit la commande.
 *
 * Paiement à la livraison / par téléphone : commande visible et vendeur prévenu tout de suite.
 */
const OFFLINE_PAYMENTS = ["payé à la livraison", "payé par téléphone"];
const PAYMENT_WINDOW_MIN = Number(process.env.ORDER_PAYMENT_WINDOW_MIN || 45);
// Commandes d'avant ce système (sans awaitingPayment) : seuls ces statuts signifient « paiement en ligne non abouti »
const LEGACY_UNPAID = ["en_attente", "échec"];
const RELEASE_LOOKBACK_DAYS = 7; // on ne touche pas aux vieilles commandes oubliées (stock modifié depuis)

const isOnlinePayment = (statusPayment) => !OFFLINE_PAYMENTS.includes(statusPayment);

/** Filtre Mongo : commandes que le vendeur peut voir (payées ou à payer à la livraison) */
const SELLER_VISIBLE = {
  awaitingPayment: { $ne: true },
  statusPayment: { $nin: LEGACY_UNPAID },
  isDemo: { $ne: true }, // commandes de démonstration du compte de test des stores
};

/** Prévient les vendeurs concernés (socket + push), une seule fois par commande */
async function notifySellersNewOrder(commande, io) {
  const { Commande, Produit, SellerRequest } = require("../Models");
  const claimed = await Commande.findOneAndUpdate(
    { _id: commande._id, sellerNotifiedAt: null },
    { $set: { sellerNotifiedAt: new Date() } },
    { new: true }
  ).lean();
  if (!claimed) return; // déjà prévenus
  try {
    const { sendExpoPushToSellers } = require("../utils/expoNotifications");
    const produitIds = claimed.nbrProduits.map((p) => p.produit);
    const produits = await Produit.find({ _id: { $in: produitIds } }, { Clefournisseur: 1, image1: 1, pictures: 1 }).lean();
    const sellerIds = [...new Set(produits.map((p) => String(p.Clefournisseur)).filter(Boolean))];
    if (!sellerIds.length) return;

    const productImages = produits.slice(0, 3).map((p) => p.image1 || (p.pictures && p.pictures[0]) || null).filter(Boolean);
    const totalArticles = claimed.nbrProduits.reduce((s, p) => s + (p.quantite || 1), 0);
    const montantProduits = claimed.prixTotal || (claimed.prix - (claimed.fraisLivraison || 0));
    const montantFormate = Number(montantProduits || 0).toLocaleString("fr-FR");
    const articleLabel = totalArticles > 1 ? `${totalArticles} articles` : "1 article";
    const title = "🛍️ Nouvelle commande !";
    const body = `${articleLabel} — ${montantFormate} FCFA · Réf ${claimed.reference}`;

    if (io) {
      const heartbeatCache = require("./heartbeatCache");
      sellerIds.forEach((sid) => {
        heartbeatCache.invalidate(sid);
        io.to(`seller:${sid}`).emit("new_order", {
          commandeId: claimed._id,
          reference: claimed.reference,
          total: montantProduits,
          date: claimed.date || new Date(),
          // Notification inline — le mobile peut l'ajouter sans fetch réseau
          notif: {
            id: `notif_${claimed._id}_${sid}`,
            type: "new_order",
            title,
            body,
            data: { type: "new_order", orderId: String(claimed._id), reference: claimed.reference },
            readAt: null,
            receivedAt: new Date().toISOString(),
          },
        });
      });
    }

    const sellers = await SellerRequest.find({ _id: { $in: sellerIds } }, { expoPushTokens: 1 }).lean();
    await sendExpoPushToSellers(sellerIds, sellers.flatMap((s) => s.expoPushTokens || []), {
      title,
      body,
      data: { type: "new_order", orderId: String(claimed._id), reference: claimed.reference, montant: montantProduits, totalArticles, productImages },
    });
  } catch (e) {
    console.error("⚠️ Notification vendeurs (nouvelle commande) :", e.message);
  }
}

/**
 * Annule une commande en ligne restée impayée et rend ce qu'elle réservait.
 * Idempotent : la commande n'est traitée qu'une fois (réservation atomique).
 */
async function releaseUnpaidOrder(orderId, reason = "paiement_non_abouti") {
  const { Commande } = require("../Models");
  const before = await Commande.findOneAndUpdate(
    {
      _id: orderId,
      etatTraitement: { $ne: "annulé" },
      statusPayment: { $nin: ["payé", ...OFFLINE_PAYMENTS] },
    },
    { $set: {
      etatTraitement: "annulé", cancelReason: reason, cancelledAt: new Date(), paymentExpired: true,
      cancel: { reason, byKind: "system", byLabel: "Ihambaobab (automatique)", note: "", at: new Date() },
    } },
    { new: false }
  ).lean();
  if (!before) return false;

  const restored = { stock: false, promo: false, points: false };
  try {
    await require("./stockService").incrementStock(before.nbrProduits);
    restored.stock = true;
  } catch (e) {
    console.error(`⚠️ Commande ${before.reference} : stock non rendu —`, e.message);
  }
  if (before.idCodePro) {
    try {
      await require("../controllers/promoCodeController").restorePromoUsage(before.idCodePro, before._id);
      restored.promo = true;
    } catch (e) {
      console.error(`⚠️ Commande ${before.reference} : code promo non rendu —`, e.message);
    }
  }
  if (before.clefUser && before.pointsUsed > 0) {
    try {
      await require("./pointsService").revokeOrderPoints({ userId: before.clefUser, orderId: before._id });
      restored.points = true;
    } catch (e) {
      console.error(`⚠️ Commande ${before.reference} : points non rendus —`, e.message);
    }
  }
  await Commande.updateOne({ _id: before._id }, { $set: { stockRestored: restored.stock, releasedOnExpiry: restored } });

  const trace = require("./orderTrace");
  const back = [before.codePromo || before.idCodePro ? "votre code promo" : null, before.pointsUsed > 0 ? `vos ${before.pointsUsed} Baobab Points` : null].filter(Boolean);
  await trace.logEvent(before._id, {
    type: "expired", by: { kind: "system" },
    note: `Aucun paiement reçu dans les ${PAYMENT_WINDOW_MIN} min. Stock${back.length ? `, ${back.join(" et ")}` : ""} rendu${back.length ? "s" : ""}.`,
  });
  await trace.notifyClient(before, {
    title: "Commande annulée : paiement non reçu",
    body: `Rien n'a été débité.${back.length ? ` ${back.join(" et ").replace(/^./, (c) => c.toUpperCase())} vous ${back.length > 1 ? "ont" : "a"} été rendu${back.length > 1 ? "s" : ""}.` : ""} Réf ${before.reference}`,
  });
  // Commandes d'avant ce système : le vendeur avait été prévenu à la création
  if (before.sellerNotifiedAt || before.awaitingPayment === undefined) {
    await trace.notifySellers(before, { type: "order_cancelled", title: "Commande annulée", body: `Réf ${before.reference} · paiement non abouti. Le stock de vos articles a été remis.` });
  }
  console.log(`🧾 Commande ${before.reference} annulée (${reason}) : stock ${restored.stock ? "✓" : "✗"}, promo ${before.idCodePro ? (restored.promo ? "✓" : "✗") : "—"}, points ${before.pointsUsed > 0 ? (restored.points ? "✓" : "✗") : "—"}`);
  return true;
}

/** Tâche planifiée : commandes en ligne non payées après le délai de paiement */
async function expireUnpaidOrders() {
  const { Commande } = require("../Models");
  const now = Date.now();
  const cutoff = new Date(now - PAYMENT_WINDOW_MIN * 60 * 1000);
  const rows = await Commande.find({
    etatTraitement: { $ne: "annulé" },
    isDemo: { $ne: true },
    date: { $gte: new Date(now - RELEASE_LOOKBACK_DAYS * 864e5) },
    $and: [
      { $or: [
        { awaitingPayment: true },
        { awaitingPayment: { $exists: false }, statusPayment: { $in: LEGACY_UNPAID } },
      ] },
      // Délai compté depuis le dernier essai de paiement (relance), sinon depuis la création
      { $or: [
        { paymentStartedAt: { $lte: cutoff } },
        { paymentStartedAt: { $exists: false }, date: { $lte: cutoff } },
      ] },
    ],
  }).select("_id").limit(200).lean();
  let n = 0;
  for (const r of rows) if (await releaseUnpaidOrder(r._id)) n++;
  if (n) console.log(`✅ ${n} commande(s) impayée(s) annulée(s) : stock, codes promo et points rendus`);
  return n;
}

/**
 * Paiement confirmé par iPay : la commande devient visible et les vendeurs sont prévenus.
 * Paiement arrivé après l'annulation automatique : la commande est rétablie (l'argent est encaissé)
 * et signalée à l'équipe, car le code promo et les points ont déjà été rendus au client.
 */
async function onPaymentConfirmed(commande, io) {
  const { Commande } = require("../Models");
  const set = { awaitingPayment: false };
  if (commande.etatTraitement === "annulé" && commande.paymentExpired) {
    set.etatTraitement = "traitement";
    set.needsReview = true;
    set.reviewReason = "Paiement reçu après l'annulation automatique : vérifier le stock (code promo et points déjà rendus au client).";
    try {
      await require("./stockService").decrementStock(commande.nbrProduits);
    } catch (e) {
      set.reviewReason += ` Stock non repris : ${e.message}`;
    }
    console.warn(`⚠️ Commande ${commande.reference} payée après expiration : rétablie, à vérifier`);
  }
  await Commande.updateOne({ _id: commande._id }, { $set: set });
  const trace = require("./orderTrace");
  if (!commande.history?.some((e) => e.type === "paid")) {
    await trace.logEvent(commande._id, { type: "paid", by: { kind: "ipay" }, note: commande.paymentDetails?.amount ? `${Number(commande.paymentDetails.amount).toLocaleString("fr-FR")} F` : "" });
  }
  if (set.needsReview) await trace.logEvent(commande._id, { type: "reactivated", by: { kind: "system" }, note: "Paiement reçu après l'annulation automatique." });
  await trace.ensureHandover(commande);
  await notifySellersNewOrder(commande, io);
}

module.exports = {
  OFFLINE_PAYMENTS,
  PAYMENT_WINDOW_MIN,
  SELLER_VISIBLE,
  isOnlinePayment,
  notifySellersNewOrder,
  releaseUnpaidOrder,
  expireUnpaidOrders,
  onPaymentConfirmed,
};
