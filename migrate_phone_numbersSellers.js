const mongoose = require('mongoose');
require('dotenv').config();

// Connexion à MongoDB - Adaptez l'URL selon votre configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/habou';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;

// Fonction pour convertir les anciens numéros en format avec indicatif +227
function convertPhoneNumber(oldNumber) {
  if (!oldNumber) return null;
  
  const numberStr = oldNumber.toString().trim();
  
  // Si le numéro commence déjà par +, le retourner tel quel
  if (numberStr.startsWith('+')) {
    console.log(`   ⏭️  Numéro déjà avec indicatif: ${numberStr}`);
    return numberStr;
  }
  
  // Nettoyer le numéro (supprimer espaces, tirets, etc.)
  const cleanNumber = numberStr.replace(/[\s\-\(\)]/g, '');
  
  // Logique de conversion pour le Niger (+227)
  console.log(`   🔍 Analyse du numéro: ${cleanNumber} (${cleanNumber.length} chiffres)`);
  
  if (cleanNumber.length === 8) {
    // Numéro standard nigérien (8 chiffres) → +227XXXXXXXX
    console.log(`   📱 Numéro standard nigérien (8 chiffres)`);
    return `+227${cleanNumber}`;
  } else if (cleanNumber.length === 11 && cleanNumber.startsWith('227')) {
    // Numéro avec 227 au début (11 chiffres: 227 + 8) → +227XXXXXXXX
    console.log(`   📱 Numéro avec 227 au début (11 chiffres)`);
    return `+${cleanNumber}`;
  } else if (cleanNumber.length === 12 && cleanNumber.startsWith('227')) {
    // Cas spécial: numéro avec 227 au début mais 12 chiffres (227 + 9 chiffres)
    // Probable: 22787727501 → +22787727501
    console.log(`   📱 Numéro avec 227 au début (12 chiffres)`);
    return `+${cleanNumber}`;
  } else if (cleanNumber.length === 9 && cleanNumber.startsWith('9')) {
    // Numéro commençant par 9 (format mobile nigérien) → +227XXXXXXXX
    console.log(`   📱 Numéro commençant par 9 (format mobile)`);
    return `+227${cleanNumber.substring(1)}`;
  } else if (cleanNumber.length === 9 && cleanNumber.startsWith('8')) {
    // Numéro commençant par 8 (autre format mobile nigérien) → +227XXXXXXXX
    console.log(`   📱 Numéro commençant par 8 (format mobile)`);
    return `+227${cleanNumber.substring(1)}`;
  } else if (cleanNumber.length >= 10 && !cleanNumber.startsWith('227')) {
    // Autres numéros longs sans 227 → supposer que c'est déjà avec indicatif pays
    console.log(`   🌍 Numéro long sans 227 (indicatif autre pays?)`);
    return `+${cleanNumber}`;
  } else if (cleanNumber.length === 7 || cleanNumber.length === 6) {
    // Numéros courts → probablement incomplets, ajouter +227
    console.log(`   ⚠️  Numéro court (${cleanNumber.length} chiffres)`);
    return `+227${cleanNumber}`;
  } else {
    // Cas par défaut → ajouter +227
    console.log(`   ⚠️  Cas spécial pour: ${cleanNumber} (${cleanNumber.length} chiffres)`);
    return `+227${cleanNumber}`;
  }
}

// Fonction pour afficher un résumé des changements
function logConversion(oldValue, newValue, context) {
  if (oldValue !== newValue) {
    console.log(`   ✅ ${context}: ${oldValue} → ${newValue}`);
    return true;
  }
  return false;
}

async function migrateSellerRequestPhoneNumbers() {
  try {
    console.log('🚀 Début de la migration des numéros de téléphone pour SellerRequest...');
    console.log(`📡 Connexion à: ${MONGODB_URI}`);
    
    let totalMigrated = 0;
    
    // Migration des SELLERREQUESTS
    console.log('\n🏪 Migration de la collection SELLERREQUESTS...');
    
    // Rechercher tous les documents avec des champs de téléphone
    const sellerRequests = await db.collection('sellerrequests').find({
      $or: [
        { phone: { $exists: true, $ne: null, $type: ["number", "string"] } },
        { businessPhone: { $exists: true, $ne: null, $type: ["number", "string"] } },
        { whatsapp: { $exists: true, $ne: null, $type: ["number", "string"] } }
      ]
    }).toArray();
    
    console.log(`   Trouvé ${sellerRequests.length} demandes vendeur avec numéros de téléphone`);
    
    for (let sellerRequest of sellerRequests) {
      let hasChanges = false;
      const updates = {};
      const sellerIdentifier = `${sellerRequest.storeName || sellerRequest.name || sellerRequest._id}`;
      
      // Migration du champ phone
      if (sellerRequest.phone) {
        const oldPhone = sellerRequest.phone;
        const newPhone = convertPhoneNumber(oldPhone);
        
        if (logConversion(oldPhone, newPhone, `Phone (${sellerIdentifier})`)) {
          updates.phone = newPhone;
          hasChanges = true;
        }
      }
      
      // Migration du champ businessPhone
      if (sellerRequest.businessPhone) {
        const oldBusinessPhone = sellerRequest.businessPhone;
        const newBusinessPhone = convertPhoneNumber(oldBusinessPhone);
        
        if (logConversion(oldBusinessPhone, newBusinessPhone, `BusinessPhone (${sellerIdentifier})`)) {
          updates.businessPhone = newBusinessPhone;
          hasChanges = true;
        }
      }
      
      // Migration du champ whatsapp (si c'est un numéro de téléphone)
      if (sellerRequest.whatsapp) {
        const whatsappValue = sellerRequest.whatsapp.toString();
        // Vérifier si c'est un numéro (pas une URL WhatsApp)
        if (/^[\d\s\-\(\)]+$/.test(whatsappValue) || whatsappValue.startsWith('+')) {
          const oldWhatsapp = sellerRequest.whatsapp;
          const newWhatsapp = convertPhoneNumber(oldWhatsapp);
          
          if (logConversion(oldWhatsapp, newWhatsapp, `WhatsApp (${sellerIdentifier})`)) {
            updates.whatsapp = newWhatsapp;
            hasChanges = true;
          }
        } else {
          console.log(`   ⏭️  WhatsApp ignoré (URL ou format non numérique): ${whatsappValue}`);
        }
      }
      
      // Appliquer les mises à jour si nécessaire
      if (hasChanges) {
        await db.collection('sellerrequests').updateOne(
          { _id: sellerRequest._id },
          { $set: updates }
        );
        totalMigrated++;
      }
    }
    
    console.log(`\n✨ Migration terminée avec succès !`);
    console.log(`📊 Total d'enregistrements migrés: ${totalMigrated}`);
    
  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
    process.exit(1);
  }
}

// Fonction pour vérifier l'état initial
async function checkInitialState() {
  try {
    console.log('\n🔍 Vérification de l\'état initial...');
    
    // Compter tous les SellerRequests
    const totalSellerRequests = await db.collection('sellerrequests').countDocuments();
    console.log(`📊 Total de demandes vendeur: ${totalSellerRequests}`);
    
    // Vérifier les différents champs de téléphone
    const phoneStats = await db.collection('sellerrequests').aggregate([
      {
        $facet: {
          phoneExists: [
            { $match: { phone: { $exists: true, $ne: null } } },
            { $count: "count" }
          ],
          businessPhoneExists: [
            { $match: { businessPhone: { $exists: true, $ne: null } } },
            { $count: "count" }
          ],
          whatsappExists: [
            { $match: { whatsapp: { $exists: true, $ne: null } } },
            { $count: "count" }
          ],
          phoneWithIndicatif: [
            { $match: { phone: { $regex: /^\+/, $type: "string" } } },
            { $count: "count" }
          ],
          businessPhoneWithIndicatif: [
            { $match: { businessPhone: { $regex: /^\+/, $type: "string" } } },
            { $count: "count" }
          ],
          whatsappWithIndicatif: [
            { $match: { whatsapp: { $regex: /^\+/, $type: "string" } } },
            { $count: "count" }
          ]
        }
      }
    ]).toArray();
    
    const stats = phoneStats[0];
    
    console.log('\n📱 État des numéros de téléphone:');
    console.log(`   📞 Phone - Total: ${stats.phoneExists[0]?.count || 0} | Avec indicatif: ${stats.phoneWithIndicatif[0]?.count || 0}`);
    console.log(`   🏢 BusinessPhone - Total: ${stats.businessPhoneExists[0]?.count || 0} | Avec indicatif: ${stats.businessPhoneWithIndicatif[0]?.count || 0}`);
    console.log(`   💬 WhatsApp - Total: ${stats.whatsappExists[0]?.count || 0} | Avec indicatif: ${stats.whatsappWithIndicatif[0]?.count || 0}`);
    
    // Afficher quelques exemples de numéros sans indicatif
    console.log('\n📋 Exemples de numéros sans indicatif:');
    
    const samplesWithoutIndicatif = await db.collection('sellerrequests').find({
      $or: [
        { phone: { $exists: true, $ne: null, $not: /^\+/ } },
        { businessPhone: { $exists: true, $ne: null, $not: /^\+/ } },
        { whatsapp: { $exists: true, $ne: null, $not: /^\+/ } }
      ]
    }).limit(5).toArray();
    
    samplesWithoutIndicatif.forEach((seller, index) => {
      console.log(`   ${index + 1}. ${seller.storeName || seller.name}:`);
      if (seller.phone && !seller.phone.toString().startsWith('+')) {
        console.log(`      📞 Phone: ${seller.phone}`);
      }
      if (seller.businessPhone && !seller.businessPhone.toString().startsWith('+')) {
        console.log(`      🏢 BusinessPhone: ${seller.businessPhone}`);
      }
      if (seller.whatsapp && !seller.whatsapp.toString().startsWith('+')) {
        console.log(`      💬 WhatsApp: ${seller.whatsapp}`);
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur lors de la vérification de l\'état initial:', error);
  }
}

// Fonction pour vérifier la migration
async function verifyMigration() {
  try {
    console.log('\n🔍 Vérification de la migration...');
    
    // Vérifier les SellerRequests avec numéros
    const sellerRequestsWithNumbers = await db.collection('sellerrequests').find({
      $or: [
        { phone: { $exists: true, $ne: null } },
        { businessPhone: { $exists: true, $ne: null } },
        { whatsapp: { $exists: true, $ne: null } }
      ]
    }).toArray();
    
    console.log('\n📊 Rapport de vérification:');
    console.log(`🏪 SellerRequests avec numéros: ${sellerRequestsWithNumbers.length}`);
    
    // Statistiques par format et par champ
    let phoneWithIndicatif = 0, phoneWithoutIndicatif = 0;
    let businessPhoneWithIndicatif = 0, businessPhoneWithoutIndicatif = 0;
    let whatsappWithIndicatif = 0, whatsappWithoutIndicatif = 0;
    
    sellerRequestsWithNumbers.forEach(seller => {
      // Vérifier phone
      if (seller.phone) {
        if (seller.phone.toString().startsWith('+')) {
          phoneWithIndicatif++;
        } else {
          phoneWithoutIndicatif++;
          console.log(`   ⚠️  Phone sans indicatif: ${seller.phone} (${seller.storeName})`);
        }
      }
      
      // Vérifier businessPhone
      if (seller.businessPhone) {
        if (seller.businessPhone.toString().startsWith('+')) {
          businessPhoneWithIndicatif++;
        } else {
          businessPhoneWithoutIndicatif++;
          console.log(`   ⚠️  BusinessPhone sans indicatif: ${seller.businessPhone} (${seller.storeName})`);
        }
      }
      
      // Vérifier whatsapp
      if (seller.whatsapp) {
        if (seller.whatsapp.toString().startsWith('+')) {
          whatsappWithIndicatif++;
        } else {
          whatsappWithoutIndicatif++;
          console.log(`   ⚠️  WhatsApp sans indicatif: ${seller.whatsapp} (${seller.storeName})`);
        }
      }
    });
    
    console.log(`📞 Phone - Avec indicatif: ${phoneWithIndicatif} | Sans indicatif: ${phoneWithoutIndicatif}`);
    console.log(`🏢 BusinessPhone - Avec indicatif: ${businessPhoneWithIndicatif} | Sans indicatif: ${businessPhoneWithoutIndicatif}`);
    console.log(`💬 WhatsApp - Avec indicatif: ${whatsappWithIndicatif} | Sans indicatif: ${whatsappWithoutIndicatif}`);
    
    const totalWithoutIndicatif = phoneWithoutIndicatif + businessPhoneWithoutIndicatif + whatsappWithoutIndicatif;
    
    if (totalWithoutIndicatif === 0) {
      console.log('\n🎉 Migration 100% réussie ! Tous les numéros ont l\'indicatif +227');
    } else {
      console.log(`\n⚠️  Migration incomplète. ${totalWithoutIndicatif} numéros restent sans indicatif.`);
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error);
  }
}

// Démarrage du script
db.once('open', async () => {
  console.log('✅ Connexion à MongoDB établie');
  console.log(`🗄️  Base de données: ${db.name}`);
  
  const args = process.argv.slice(2);
  
  if (args.includes('--check-initial')) {
    console.log('🔍 Mode vérification de l\'état initial...');
    await checkInitialState();
  } else if (args.includes('--verify-only')) {
    console.log('🔍 Mode vérification seulement...');
    await verifyMigration();
  } else if (args.includes('--dry-run')) {
    console.log('🧪 Mode test (dry-run) - Aucune modification ne sera apportée');
    await checkInitialState();
    console.log('\n⚠️  Mode dry-run: Migration simulée (pas de modification réelle)');
  } else {
    // Mode migration complète
    await migrateSellerRequestPhoneNumbers();
    await verifyMigration();
  }
  
  mongoose.connection.close();
  console.log('\n👋 Connexion fermée. Script terminé !');
});

db.on('error', (error) => {
  console.error('❌ Erreur de connexion MongoDB:', error);
  process.exit(1);
});


// Vérifier l'état initial
// node migrate_phone_numbersSellers.js --check-initial

// Test de migration (sans modification)
// node migrate_phone_numbersSellers.js --dry-run

// Migration complète
// node migrate_phone_numbersSellers.js

// Vérifier après migration
// node migrate_phone_numbersSellers.js --verify-only