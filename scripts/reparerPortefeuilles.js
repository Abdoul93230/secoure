/**
 * Répare les portefeuilles vendeurs faussés par l'ancien recalcul (montants en attente exclus du total,
 * puis retirés une seconde fois à l'annulation : solde total négatif).
 *
 * Les soldes sont recalculés à partir des transactions, qui sont la source de vérité.
 *
 *   node scripts/reparerPortefeuilles.js              → affiche seulement ce qui serait corrigé
 *   node scripts/reparerPortefeuilles.js --appliquer  → corrige
 *   node scripts/reparerPortefeuilles.js --appliquer --vendeur <sellerId>
 */
require("dotenv").config();
const mongoose = require("mongoose");
const FinancialService = require("../src/services/FinancialService");
const Portefeuille = require("../src/models/portefeuilleSchema");
const Transaction = require("../src/models/transactionSchema");

const apply = process.argv.includes("--appliquer");
const i = process.argv.indexOf("--vendeur");
const onlySeller = i > -1 ? process.argv[i + 1] : null;
const F = (n) => `${Math.round(Number(n) || 0).toLocaleString("fr-FR")} F`;

(async () => {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI absent du .env");
  await mongoose.connect(process.env.MONGODB_URI);
  const wallets = await Portefeuille.find(onlySeller ? { sellerId: onlySeller } : {}).lean();
  let faux = 0;
  let repares = 0;

  for (const w of wallets) {
    const v = await FinancialService.verifierCoherencePortefeuille(w.sellerId);
    if (v.coherent) continue;
    faux++;
    console.log(`\nVendeur ${w.sellerId}`);
    for (const { champ } of v.incoherences) {
      console.log(`  ${champ.padEnd(26)} actuel ${F(v.portefeuilleActuel[champ]).padStart(14)}  →  juste ${F(v.soldeCalcule[champ]).padStart(14)}`);
    }
    // Historique qui explique l'écart (les 15 derniers mouvements)
    const txs = await Transaction.find({ sellerId: w.sellerId }).sort({ dateTransaction: -1, _id: -1 }).limit(15).lean();
    console.log("  Derniers mouvements :");
    for (const t of txs) {
      const d = new Date(t.dateTransaction || t.createdAt || Date.now()).toLocaleString("fr-FR");
      console.log(`    ${d.padEnd(20)} ${String(t.type).padEnd(16)} ${String(t.statut).padEnd(11)} ${F(t.montantNet).padStart(12)}  ${t.reference || ""}`);
    }
    if (apply) {
      await FinancialService.recalculerSoldes(w.sellerId);
      repares++;
    }
  }

  console.log(`\n${wallets.length} portefeuille(s) vérifié(s), ${faux} à corriger${apply ? `, ${repares} corrigé(s)` : " (rien n'a été modifié : ajoutez --appliquer)"}.`);
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error("Erreur :", e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
