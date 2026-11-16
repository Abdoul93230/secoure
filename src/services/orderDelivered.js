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

module.exports = { DELIVERED_STATES, isDelivered, creditDeliveredOrder };
