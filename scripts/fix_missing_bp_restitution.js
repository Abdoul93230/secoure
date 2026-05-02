/**
 * fix_missing_bp_restitution.js
 *
 * Trouve toutes les commandes annulées où des BP ont été utilisés
 * mais pas restitués, et effectue la restitution manquante.
 *
 * Usage:
 *   node scripts/fix_missing_bp_restitution.js          → mode dry-run (affiche sans toucher)
 *   node scripts/fix_missing_bp_restitution.js --fix    → applique les corrections
 */

require("dotenv").config();
const mongoose = require("mongoose");
const PointsTransaction = require("../src/models/PointsTransaction");
const PointsWallet = require("../src/models/PointsWallet");

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://abdoulrazak9323:qrru0xfJGmJG0TSc@cluster0.mvrgous.mongodb.net/?retryWrites=true&w=majority";

const DRY_RUN = !process.argv.includes("--fix");

// ─── Schéma minimal Commande (évite de charger tout Models.js) ───────────────
const commandeSchema = new mongoose.Schema({}, { strict: false });
const Commande = mongoose.models.Commande || mongoose.model("Commande", commandeSchema);

// ─── Crédit direct (sans appeler pointsService pour éviter les dépendances) ──
async function creditPointsDirectly({ userId, delta, reason, idempotencyKey, orderId }) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Idempotence : ne pas doubler si déjà appliqué
    const existing = await PointsTransaction.findOne({ idempotencyKey }).session(session);
    if (existing) {
      await session.abortTransaction();
      session.endSession();
      return { alreadyDone: true };
    }

    const wallet = await PointsWallet.findOneAndUpdate(
      { userId: String(userId) },
      { $inc: { balance: delta, totalEarned: delta } },
      { new: true, upsert: true, session }
    );

    await PointsTransaction.create(
      [
        {
          userId: String(userId),
          type: "REFUND",
          delta,
          balanceBefore: wallet.balance - delta,
          balanceAfter: wallet.balance,
          reason,
          idempotencyKey,
          orderId: orderId || null,
          metadata: { source: "fix_missing_bp_restitution" },
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();
    return { applied: true, newBalance: wallet.balance };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

async function main() {
  console.log(`\n🔍 Mode: ${DRY_RUN ? "DRY-RUN (aucune modification)" : "⚠️  FIX RÉEL"}\n`);

  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("✅ Connecté à MongoDB\n");

  // 1. Toutes les commandes annulées
  const annulees = await Commande.find({
    $or: [
      { statusLivraison: "annulé" },
      { etatTraitement: { $in: ["annulé", "Annulée"] } },
    ],
  })
    .select("_id clefUser reference statusLivraison etatTraitement pointsUsed pointsDiscount")
    .lean();

  console.log(`📦 ${annulees.length} commandes annulées trouvées\n`);

  let nbConcernes = 0;
  let nbDejaRestitues = 0;
  let nbAReparer = 0;
  let nbRepares = 0;
  let nbErreurs = 0;

  for (const commande of annulees) {
    const orderId = commande._id;
    const userId = commande.clefUser;
    if (!userId) continue;

    // 2. Chercher la transaction REDEMPTION pour cette commande
    const redemptionTxn = await PointsTransaction.findOne({
      userId: String(userId),
      orderId,
      type: "REDEMPTION",
    }).lean();

    if (!redemptionTxn) continue; // Pas de BP utilisés sur cette commande

    nbConcernes++;
    const pointsARestituer = Math.abs(redemptionTxn.delta); // delta est négatif

    // 3. Vérifier si la restitution a déjà été faite
    const idempotencyKey = `REDEMPTION_RESTORE_${orderId}`;
    const dejaFait = await PointsTransaction.findOne({ idempotencyKey }).lean();

    if (dejaFait) {
      nbDejaRestitues++;
      console.log(
        `✓ [DÉJÀ FAIT] Commande ${commande.reference || orderId} — user ${userId} — ${pointsARestituer} pts`
      );
      continue;
    }

    nbAReparer++;
    console.log(
      `⚠️  [À RÉPARER] Commande ${commande.reference || orderId} — user ${userId} — ${pointsARestituer} pts à restituer`
    );

    if (DRY_RUN) continue;

    // 4. Appliquer la restitution
    try {
      const result = await creditPointsDirectly({
        userId,
        delta: pointsARestituer,
        reason: `Restitution BP manquante — annulation commande ${commande.reference || orderId}`,
        idempotencyKey,
        orderId,
      });

      if (result.alreadyDone) {
        console.log(`   → Déjà traité (race condition évitée)`);
        nbDejaRestitues++;
      } else {
        console.log(`   ✅ ${pointsARestituer} pts restitués. Nouveau solde: ${result.newBalance} BP`);
        nbRepares++;
      }
    } catch (err) {
      console.error(`   ❌ Erreur: ${err.message}`);
      nbErreurs++;
    }
  }

  // ─── Résumé ──────────────────────────────────────────────────────────────
  console.log("\n─────────────────────────────────────────");
  console.log("📊 RÉSUMÉ");
  console.log(`   Commandes annulées scannées : ${annulees.length}`);
  console.log(`   Avec BP utilisés            : ${nbConcernes}`);
  console.log(`   Déjà restitués              : ${nbDejaRestitues}`);
  console.log(`   À réparer                   : ${nbAReparer}`);
  if (!DRY_RUN) {
    console.log(`   ✅ Réparés avec succès      : ${nbRepares}`);
    console.log(`   ❌ Erreurs                  : ${nbErreurs}`);
  } else {
    console.log(`\n👉 Lance avec --fix pour appliquer les ${nbAReparer} corrections.`);
  }
  console.log("─────────────────────────────────────────\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
