/**
 * fix_user_balance.js
 * Recalcule le solde correct d'un utilisateur depuis les transactions
 * et applique un ADMIN_DEBIT ou ADMIN_CREDIT pour corriger l'écart.
 *
 * Usage:
 *   node scripts/fix_user_balance.js <userId> <correctBalance>          → dry-run
 *   node scripts/fix_user_balance.js <userId> <correctBalance> --fix    → applique
 */
require("dotenv").config();
const mongoose = require("mongoose");
const PointsTransaction = require("../src/models/PointsTransaction");
const PointsWallet = require("../src/models/PointsWallet");

const MONGODB_URI = process.env.MONGODB_URI ||
  "mongodb+srv://abdoulrazak9323:qrru0xfJGmJG0TSc@cluster0.mvrgous.mongodb.net/?retryWrites=true&w=majority";

const userId = process.argv[2];
const correctBalance = parseInt(process.argv[3], 10);
const DRY_RUN = !process.argv.includes("--fix");

if (!userId || isNaN(correctBalance)) {
  console.error("Usage: node fix_user_balance.js <userId> <correctBalance> [--fix]");
  process.exit(1);
}

async function main() {
  console.log(`\n🔍 Mode: ${DRY_RUN ? "DRY-RUN" : "⚠️  FIX RÉEL"}\n`);
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  const wallet = await PointsWallet.findOne({ userId }).lean();
  if (!wallet) { console.error("Wallet non trouvé"); process.exit(1); }

  const currentBalance = wallet.balance;
  const diff = correctBalance - currentBalance;

  console.log(`👤 User: ${userId}`);
  console.log(`💰 Solde actuel  : ${currentBalance} BP`);
  console.log(`🎯 Solde correct : ${correctBalance} BP`);
  console.log(`📊 Écart         : ${diff > 0 ? '+' : ''}${diff} BP`);

  if (diff === 0) {
    console.log("\n✅ Solde déjà correct, rien à faire.");
    await mongoose.disconnect();
    return;
  }

  const correctionKey = `BALANCE_CORRECTION_${userId}_${Date.now()}`;
  const type = diff > 0 ? "ADMIN_CREDIT" : "ADMIN_DEBIT";
  const delta = diff; // positif pour crédit, négatif pour débit

  console.log(`\n${DRY_RUN ? "👉 Appliquerait" : "✅ Application de"} : ${type} ${delta > 0 ? '+' : ''}${delta} BP`);

  if (DRY_RUN) {
    console.log("\n   Lance avec --fix pour appliquer.");
    await mongoose.disconnect();
    return;
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const updatedWallet = await PointsWallet.findOneAndUpdate(
      { userId },
      { $inc: { balance: delta } },
      { new: true, session }
    );

    await PointsTransaction.create([{
      userId,
      type,
      delta,
      balanceBefore: updatedWallet.balance - delta,
      balanceAfter: updatedWallet.balance,
      reason: `Correction solde BP — doublons restitution corrigés (diff: ${delta > 0 ? '+' : ''}${delta} BP)`,
      idempotencyKey: correctionKey,
      metadata: { source: "fix_user_balance", correctBalance, previousBalance: currentBalance }
    }], { session });

    await session.commitTransaction();
    session.endSession();
    console.log(`✅ Solde corrigé : ${updatedWallet.balance} BP`);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Erreur:", err.message);
  }

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
