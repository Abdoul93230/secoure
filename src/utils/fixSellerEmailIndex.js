/**
 * Remplace l'ancien index unique `email_1` des vendeurs (qui bloquait la création d'un
 * 2e vendeur sans email) par un index unique partiel : l'email n'est unique que s'il est renseigné.
 * Idempotent, exécuté au démarrage. Ordre sûr : le nouvel index est créé AVANT de supprimer
 * l'ancien ; si de vrais doublons d'email empêchent sa création, rien n'est modifié.
 */
const NEW_INDEX = "email_unique_si_renseigne";

async function fixSellerEmailIndex(SellerRequest) {
  const coll = SellerRequest.collection;
  try {
    const indexes = await coll.indexes();
    const legacy = indexes.find((i) => i.name === "email_1" && i.unique && !i.partialFilterExpression);
    if (!indexes.some((i) => i.name === NEW_INDEX)) {
      await coll.createIndex(
        { email: 1 },
        { unique: true, name: NEW_INDEX, partialFilterExpression: { email: { $gt: "" } } }
      );
      console.log(`✅ Vendeurs : index « ${NEW_INDEX} » créé`);
    }
    if (legacy) {
      await coll.dropIndex("email_1");
      console.log("✅ Vendeurs : ancien index email_1 supprimé (création sans email possible)");
    }
  } catch (err) {
    // Ex. deux vendeurs avec le même email : l'ancien index est conservé, à corriger à la main
    console.error("⚠️ Vendeurs : index email non migré —", err.message);
  }
}

module.exports = fixSellerEmailIndex;
