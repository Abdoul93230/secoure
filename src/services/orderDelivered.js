/**
 * Commande livrée : ce que le client gagne, quel que soit le chemin
 * (livreur par code, admin par état de traitement, admin par statut de livraison).
 * Chaque crédit est protégé contre les doublons (clé d'idempotence par commande) :
 * appeler cette fonction plusieurs fois pour la même commande ne crédite qu'une fois.
 */
const DELIVERED_STATES = ["livré", "livraison reçu", "Traité"];

const isDelivered = (etat) => DELIVERED_STATES.includes(etat);

async function creditDeliveredOrder(commande) {
  if (!commande?.clefUser || commande.isDemo) return;
  try {
    const pointsService = require("./pointsService");
    const referralService = require("./referralService");
    const orderAmount = Math.max(0, (commande.prix || 0) - (commande.fraisLivraison || 0));

    // Points d'achat (avec multiplicateur de niveau et d'événement)
    await pointsService.creditPurchasePoints({ userId: commande.clefUser, orderAmountFcfa: orderAmount, orderId: commande._id });
    // Bonus de première commande
    await pointsService.creditFirstOrderBonus({ userId: commande.clefUser, orderId: commande._id });
    // Parrainage : première commande livrée du filleul
    await referralService.handleOrderDelivered({ userId: commande.clefUser, orderId: commande._id });
  } catch (e) {
    console.error("⚠️ Points de la commande livrée :", e.message);
  }
}

/**
 * Deux jours après la livraison : « Votre avis compte ». Une fois par commande, jamais pour les
 * commandes de démonstration. La notification ouvre la commande, où chaque article a « Donner mon avis ».
 */
async function sendReviewReminders() {
  const { Commande } = require("../Models");
  const now = Date.now();
  const rows = await Commande.find({
    isDemo: { $ne: true },
    reviewReminderAt: null,
    "handover.deliveredAt": { $lte: new Date(now - 2 * 864e5), $gte: new Date(now - 10 * 864e5) },
  }).select("_id clefUser reference prod").limit(100).lean();
  let n = 0;
  for (const o of rows) {
    const claimed = await Commande.updateOne({ _id: o._id, reviewReminderAt: null }, { $set: { reviewReminderAt: new Date() } });
    if (!claimed.modifiedCount) continue;
    const first = (o.prod || [])[0]?.name;
    await require("./orderTrace").notifyClient(o, {
      title: "Votre avis compte 🌟",
      body: first ? `Comment trouvez-vous « ${String(first).slice(0, 40)} » ? Dites-le en 10 secondes et aidez les autres clients.` : "Comment s'est passée votre commande ? Dites-le en 10 secondes.",
    });
    n++;
  }
  if (n) console.log(`✅ ${n} relance(s) d'avis envoyée(s)`);
  return n;
}

module.exports = { DELIVERED_STATES, isDelivered, creditDeliveredOrder, sendReviewReminders };
