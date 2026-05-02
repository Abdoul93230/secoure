/**
 * patch_refund_type.js
 * Met à jour toutes les transactions REDEMPTION_RESTORE créées avec ADMIN_CREDIT
 * vers le nouveau type REFUND.
 *
 * Usage: node scripts/patch_refund_type.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const PointsTransaction = require("../src/models/PointsTransaction");

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://abdoulrazak9323:qrru0xfJGmJG0TSc@cluster0.mvrgous.mongodb.net/?retryWrites=true&w=majority";

async function main() {
  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("✅ Connecté à MongoDB\n");

  const result = await PointsTransaction.updateMany(
    {
      idempotencyKey: /^REDEMPTION_RESTORE_/,
      type: "ADMIN_CREDIT",
    },
    { $set: { type: "REFUND" } }
  );

  console.log(`✅ ${result.modifiedCount} transaction(s) mise(s) à jour : ADMIN_CREDIT → REFUND`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Erreur:", err);
  process.exit(1);
});
