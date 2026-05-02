/**
 * audit_bp_balance.js
 * Calcule le vrai solde BP d'un utilisateur depuis les transactions
 * et compare avec le solde stocké dans le wallet.
 *
 * Usage: node scripts/audit_bp_balance.js <userId>
 */
require("dotenv").config();
const mongoose = require("mongoose");
const PointsTransaction = require("../src/models/PointsTransaction");
const PointsWallet = require("../src/models/PointsWallet");

const MONGODB_URI = process.env.MONGODB_URI ||
  "mongodb+srv://abdoulrazak9323:qrru0xfJGmJG0TSc@cluster0.mvrgous.mongodb.net/?retryWrites=true&w=majority";

const userId = process.argv[2];
if (!userId) { console.error("Usage: node audit_bp_balance.js <userId>"); process.exit(1); }

async function main() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  const txns = await PointsTransaction.find({ userId }).sort({ createdAt: 1 }).lean();
  const wallet = await PointsWallet.findOne({ userId }).lean();

  let running = 0;
  console.log("\n📋 Historique complet:");
  for (const t of txns) {
    running += t.delta;
    console.log(`  [${t.createdAt.toISOString().slice(0,10)}] ${t.type.padEnd(20)} ${t.delta > 0 ? '+' : ''}${t.delta} BP → solde: ${running} BP  (clé: ${t.idempotencyKey || '-'})`);
  }

  console.log(`\n💰 Solde calculé depuis txns : ${running} BP`);
  console.log(`💰 Solde stocké dans wallet  : ${wallet?.balance ?? 'N/A'} BP`);

  if (wallet && running !== wallet.balance) {
    const diff = running - wallet.balance;
    console.log(`\n⚠️  ÉCART: ${diff > 0 ? '+' : ''}${diff} BP — le wallet doit être ${diff > 0 ? 'crédité' : 'débité'} de ${Math.abs(diff)} BP`);
  } else {
    console.log(`\n✅ Solde cohérent`);
  }

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
