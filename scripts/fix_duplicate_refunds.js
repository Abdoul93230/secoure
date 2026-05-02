/**
 * fix_duplicate_refunds.js
 *
 * Trouve les restitutions BP en double causées par le changement de clé
 * idempotency (RESTORE_REDEMPTION_* → RESTORE_TXN_*) et annule les doublons
 * via un ADMIN_DEBIT compensatoire.
 *
 * Usage:
 *   node scripts/fix_duplicate_refunds.js          → dry-run
 *   node scripts/fix_duplicate_refunds.js --fix    → applique
 */

require("dotenv").config();
const mongoose = require("mongoose");
const PointsTransaction = require("../src/models/PointsTransaction");
const PointsWallet = require("../src/models/PointsWallet");

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://abdoulrazak9323:qrru0xfJGmJG0TSc@cluster0.mvrgous.mongodb.net/?retryWrites=true&w=majority";

const DRY_RUN = !process.argv.includes("--fix");

async function main() {
  console.log(`\n🔍 Mode: ${DRY_RUN ? "DRY-RUN (aucune modification)" : "⚠️  FIX RÉEL"}\n`);

  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log("✅ Connecté à MongoDB\n");

  // Trouver toutes les transactions REFUND avec l'ancienne clé RESTORE_REDEMPTION_*
  const oldStyleRefunds = await PointsTransaction.find({
    type: "REFUND",
    idempotencyKey: /^RESTORE_REDEMPTION_/
  }).lean();

  console.log(`📋 ${oldStyleRefunds.length} restitution(s) avec ancienne clé trouvée(s)\n`);

  let nbDoublons = 0;
  let nbOk = 0;
  let nbFixes = 0;

  for (const refund of oldStyleRefunds) {
    const orderId = refund.orderId;
    const userId = refund.userId;

    // Chercher si une 2ème restitution REFUND existe pour le même orderId/userId
    const allRefunds = await PointsTransaction.find({
      userId,
      orderId,
      type: "REFUND"
    }).sort({ createdAt: 1 }).lean();

    if (allRefunds.length <= 1) {
      nbOk++;
      continue;
    }

    // Calculer le total restitué vs ce qui devait l'être
    const totalRestored = allRefunds.reduce((sum, t) => sum + t.delta, 0);
    // La transaction REDEMPTION originale
    const redemptionTxn = await PointsTransaction.findOne({
      userId,
      orderId,
      type: "REDEMPTION"
    }).sort({ createdAt: 1 }).lean();

    const expectedRestore = redemptionTxn ? Math.abs(redemptionTxn.delta) : null;

    console.log(`⚠️  User ${userId} / Commande ${orderId}`);
    console.log(`   REFUND transactions: ${allRefunds.length}`);
    console.log(`   Total restitué: ${totalRestored} BP | Attendu: ${expectedRestore ?? "?"} BP`);
    allRefunds.forEach(t => console.log(`   → ${t.delta} BP | clé: ${t.idempotencyKey} | ${t.createdAt}`));

    if (expectedRestore !== null && totalRestored > expectedRestore) {
      const excess = totalRestored - expectedRestore;
      nbDoublons++;
      console.log(`   🔴 Excédent: ${excess} BP à corriger`);

      if (!DRY_RUN) {
        const compensationKey = `DEBIT_EXCESS_REFUND_${orderId}_${userId}`;
        const existing = await PointsTransaction.findOne({ idempotencyKey: compensationKey });
        if (existing) {
          console.log(`   ✓ Déjà compensé`);
          continue;
        }

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
          const wallet = await PointsWallet.findOneAndUpdate(
            { userId },
            { $inc: { balance: -excess } },
            { new: true, session }
          );
          await PointsTransaction.create([{
            userId,
            type: "ADMIN_DEBIT",
            delta: -excess,
            balanceBefore: wallet.balance + excess,
            balanceAfter: wallet.balance,
            reason: `Correction doublon restitution BP — commande ${orderId}`,
            idempotencyKey: compensationKey,
            orderId,
            metadata: { source: "fix_duplicate_refunds" }
          }], { session });
          await session.commitTransaction();
          session.endSession();
          console.log(`   ✅ ${excess} BP déduits. Nouveau solde: ${wallet.balance}`);
          nbFixes++;
        } catch (err) {
          await session.abortTransaction();
          session.endSession();
          console.error(`   ❌ Erreur: ${err.message}`);
        }
      }
    } else {
      nbOk++;
      console.log(`   ✓ Montant correct`);
    }
    console.log("");
  }

  console.log("─────────────────────────────────────────");
  console.log("📊 RÉSUMÉ");
  console.log(`   Restitutions scannées  : ${oldStyleRefunds.length}`);
  console.log(`   Sans doublon           : ${nbOk}`);
  console.log(`   Doublons détectés      : ${nbDoublons}`);
  if (!DRY_RUN) console.log(`   ✅ Corrigés            : ${nbFixes}`);
  else console.log(`\n👉 Lance avec --fix pour corriger les ${nbDoublons} doublon(s).`);
  console.log("─────────────────────────────────────────\n");

  await mongoose.disconnect();
}

main().catch(err => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
