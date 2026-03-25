const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/ihambaobab";

// Import models
const { PromoCode } = require('../src/Models'); // Legacy model
const PromoCodeV2 = require('../src/models/PromoCode'); // New model

async function migratePromoCodes() {
  console.log('🔄 Démarrage de la migration des codes promo...');
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connecté à la base de données MongoDB');

    // Récupérer tous les anciens codes promo
    const oldCodes = await PromoCode.find({});
    console.log(`📦 Trouvé ${oldCodes.length} anciens codes promo à migrer.`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const oldCode of oldCodes) {
      try {
        // Vérifier si le code existe déjà dans la nouvelle structure pour éviter les doublons
        const existing = await PromoCodeV2.findOne({ code: oldCode.code });
        
        if (existing) {
          console.log(`⚠️  Le code ${oldCode.code} existe déjà. Ignoré.`);
          skipCount++;
          continue;
        }

        // Créer le nouveau code promo en adaptant les champs
        const newCode = new PromoCodeV2({
          code: oldCode.code,
          // Si c'est un code de bienvenue, on peut mettre une limite de commande ou garder simple
          type: 'percentage', // L'ancien système utilisait principalement des pourcentages
          value: oldCode.prixReduiction || 0,
          maxUsage: undefined, // L'ancien système n'avait pas de limite par défaut
          currentUsage: 0, // On recommence le compteur ou on met 0
          maxUsagePerUser: 1, // On limite à 1 par utilisateur par défaut comme l'ancien
          startDate: new Date(),
          endDate: oldCode.dateExpirate,
          isActive: oldCode.isValide,
          metadata: {
            migratedFromV1: true,
            originalId: oldCode._id,
            isWelcomeCode: oldCode.isWelcomeCode
          }
        });

        await newCode.save();
        successCount++;
        console.log(`✅ Code ${oldCode.code} migré avec succès (réduction: ${oldCode.prixReduiction}%)`);
      } catch (err) {
        console.error(`❌ Erreur lors de la migration du code ${oldCode.code}:`, err.message);
        errorCount++;
      }
    }

    console.log('\n📊 Résumé de la migration :');
    console.log(`   - Total traités : ${oldCodes.length}`);
    console.log(`   - Succès : ${successCount}`);
    console.log(`   - Ignorés (déjà existants) : ${skipCount}`);
    console.log(`   - Erreurs : ${errorCount}`);

  } catch (err) {
    console.error('❌ Erreur critique lors de la migration:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Déconnecté de la base de données');
    process.exit(0);
  }
}

migratePromoCodes();
