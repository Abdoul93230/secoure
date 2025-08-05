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
  if (cleanNumber.length === 8) {
    // Numéro standard nigérien (8 chiffres) → +227XXXXXXXX
    return `+227${cleanNumber}`;
  } else if (cleanNumber.length === 11 && cleanNumber.startsWith('227')) {
    // Numéro avec 227 au début → +227XXXXXXXX
    return `+${cleanNumber}`;
  } else if (cleanNumber.length === 9 && cleanNumber.startsWith('9')) {
    // Numéro commençant par 9 (format mobile nigérien) → +227XXXXXXXX
    return `+227${cleanNumber.substring(1)}`;
  } else if (cleanNumber.length >= 10) {
    // Autres numéros longs → supposer que c'est déjà avec indicatif pays
    return `+${cleanNumber}`;
  } else {
    // Cas par défaut → ajouter +227
    console.log(`   ⚠️  Cas spécial pour: ${cleanNumber}`);
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

async function migratePhoneNumbers() {
  try {
    console.log('🚀 Début de la migration des numéros de téléphone...');
    console.log(`📡 Connexion à: ${MONGODB_URI}`);
    
    let totalMigrated = 0;
    
    // 1. Migration des USERS
    console.log('\n📱 Migration de la collection USERS...');
    const users = await db.collection('users').find({ 
      phoneNumber: { 
        $exists: true, 
        $ne: null,
        $type: ["number", "string"] // Chercher les types number ET string
      } 
    }).toArray();
    
    console.log(`   Trouvé ${users.length} utilisateurs avec numéro de téléphone`);
    
    for (let user of users) {
      const oldNumber = user.phoneNumber;
      const newNumber = convertPhoneNumber(oldNumber);
      
      if (logConversion(oldNumber, newNumber, `User: ${user.name || user._id}`)) {
        await db.collection('users').updateOne(
          { _id: user._id },
          { $set: { phoneNumber: newNumber } }
        );
        totalMigrated++;
      }
    }
    
    // 2. Migration des PROFILES
    console.log('\n👤 Migration de la collection PROFILES...');
    const profiles = await db.collection('profiles').find({ 
      numero: { 
        $exists: true, 
        $ne: null,
        $type: ["number", "string"]
      } 
    }).toArray();
    
    console.log(`   Trouvé ${profiles.length} profils avec numéro de téléphone`);
    
    for (let profile of profiles) {
      const oldNumber = profile.numero;
      const newNumber = convertPhoneNumber(oldNumber);
      
      if (logConversion(oldNumber, newNumber, `Profile: ${profile._id}`)) {
        await db.collection('profiles').updateOne(
          { _id: profile._id },
          { $set: { numero: newNumber } }
        );
        totalMigrated++;
      }
    }
    
    // 3. Migration des FOURNISSEURS
    console.log('\n🏪 Migration de la collection FOURNISSEURS...');
    const fournisseurs = await db.collection('fournisseurs').find({ 
      numero: { 
        $exists: true, 
        $ne: null,
        $type: ["number", "string"]
      } 
    }).toArray();
    
    console.log(`   Trouvé ${fournisseurs.length} fournisseurs avec numéro de téléphone`);
    
    for (let fournisseur of fournisseurs) {
      const oldNumber = fournisseur.numero;
      const newNumber = convertPhoneNumber(oldNumber);
      
      if (logConversion(oldNumber, newNumber, `Fournisseur: ${fournisseur.nom || fournisseur._id}`)) {
        await db.collection('fournisseurs').updateOne(
          { _id: fournisseur._id },
          { $set: { numero: newNumber } }
        );
        totalMigrated++;
      }
    }
    
    // 4. Migration des MOBILEMONEY
    console.log('\n💰 Migration de la collection MOBILEMONEYS...');
    const mobileMoneys = await db.collection('mobilemoneys').find({ 
      numero: { 
        $exists: true, 
        $ne: null,
        $type: ["number", "string"]
      } 
    }).toArray();
    
    console.log(`   Trouvé ${mobileMoneys.length} comptes MobileMoney avec numéro`);
    
    for (let mobileMoney of mobileMoneys) {
      const oldNumber = mobileMoney.numero;
      const newNumber = convertPhoneNumber(oldNumber);
      
      if (logConversion(oldNumber, newNumber, `MobileMoney: ${mobileMoney.operateur || mobileMoney._id}`)) {
        await db.collection('mobilemoneys').updateOne(
          { _id: mobileMoney._id },
          { $set: { numero: newNumber } }
        );
        totalMigrated++;
      }
    }
    
    // 5. Migration des ADRESSSHIPPINGS
    console.log('\n📦 Migration de la collection ADRESSSHIPPINGS...');
    const adressShippings = await db.collection('adressshippings').find({ 
      numero: { 
        $exists: true, 
        $ne: null,
        $type: ["number", "string"]
      } 
    }).toArray();
    
    console.log(`   Trouvé ${adressShippings.length} adresses de livraison avec numéro`);
    
    for (let adress of adressShippings) {
      const oldNumber = adress.numero;
      const newNumber = convertPhoneNumber(oldNumber);
      
      if (logConversion(oldNumber, newNumber, `AdressShipping: ${adress.quartier || adress._id}`)) {
        await db.collection('adressshippings').updateOne(
          { _id: adress._id },
          { $set: { numero: newNumber } }
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

// Fonction pour vérifier la migration
async function verifyMigration() {
  try {
    console.log('\n🔍 Vérification de la migration...');
    
    // Vérifier les Users
    const usersWithNumbers = await db.collection('users').find({ 
      phoneNumber: { $exists: true, $ne: null } 
    }).toArray();
    
    // Vérifier les Profiles  
    const profilesWithNumbers = await db.collection('profiles').find({ 
      numero: { $exists: true, $ne: null } 
    }).toArray();
    
    console.log('\n📊 Rapport de vérification:');
    console.log(`👥 Users avec numéros: ${usersWithNumbers.length}`);
    console.log(`👤 Profiles avec numéros: ${profilesWithNumbers.length}`);
    
    // Statistiques par format
    let withIndicatif = 0;
    let withoutIndicatif = 0;
    
    [...usersWithNumbers, ...profilesWithNumbers].forEach(item => {
      const number = item.phoneNumber || item.numero;
      if (number && number.toString().startsWith('+')) {
        withIndicatif++;
      } else {
        withoutIndicatif++;
        console.log(`   ⚠️  Encore sans indicatif: ${number}`);
      }
    });
    
    console.log(`✅ Avec indicatif (+227): ${withIndicatif}`);
    console.log(`❌ Sans indicatif: ${withoutIndicatif}`);
    
    if (withoutIndicatif === 0) {
      console.log('\n🎉 Migration 100% réussie ! Tous les numéros ont l\'indicatif +227');
    } else {
      console.log('\n⚠️  Migration incomplète. Relancez le script pour corriger les numéros restants.');
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
  
  if (args.includes('--verify-only')) {
    console.log('🔍 Mode vérification seulement...');
    await verifyMigration();
  } else if (args.includes('--dry-run')) {
    console.log('🧪 Mode test (dry-run) - Aucune modification ne sera apportée');
    // TODO: Implémenter le mode dry-run
    await verifyMigration();
  } else {
    // Mode migration complète
    await migratePhoneNumbers();
    await verifyMigration();
  }
  
  mongoose.connection.close();
  console.log('\n👋 Connexion fermée. Migration terminée !');
});

db.on('error', (error) => {
  console.error('❌ Erreur de connexion MongoDB:', error);
  process.exit(1);
});
