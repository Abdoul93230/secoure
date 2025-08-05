const mongoose = require('mongoose');
require('dotenv').config();

// Script pour sauvegarder les données avant migration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/habou';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;

async function backupPhoneNumbers() {
  try {
    console.log('💾 Création d\'une sauvegarde des numéros de téléphone...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupData = {
      timestamp,
      collections: {}
    };
    
    // Sauvegarder Users
    const users = await db.collection('users').find({ 
      phoneNumber: { $exists: true, $ne: null } 
    }, { projection: { _id: 1, name: 1, phoneNumber: 1 } }).toArray();
    
    backupData.collections.users = users;
    console.log(`📱 Sauvegardé ${users.length} numéros d'utilisateurs`);
    
    // Sauvegarder Profiles
    const profiles = await db.collection('profiles').find({ 
      numero: { $exists: true, $ne: null } 
    }, { projection: { _id: 1, numero: 1 } }).toArray();
    
    backupData.collections.profiles = profiles;
    console.log(`👤 Sauvegardé ${profiles.length} numéros de profils`);
    
    // Sauvegarder Fournisseurs
    const fournisseurs = await db.collection('fournisseurs').find({ 
      numero: { $exists: true, $ne: null } 
    }, { projection: { _id: 1, nom: 1, numero: 1 } }).toArray();
    
    backupData.collections.fournisseurs = fournisseurs;
    console.log(`🏪 Sauvegardé ${fournisseurs.length} numéros de fournisseurs`);
    
    // Sauvegarder MobileMoney
    const mobileMoneys = await db.collection('mobilemoneys').find({ 
      numero: { $exists: true, $ne: null } 
    }, { projection: { _id: 1, numero: 1, operateur: 1 } }).toArray();
    
    backupData.collections.mobilemoneys = mobileMoneys;
    console.log(`💰 Sauvegardé ${mobileMoneys.length} numéros MobileMoney`);
    
    // Sauvegarder AdressShippings
    const adressShippings = await db.collection('adressshippings').find({ 
      numero: { $exists: true, $ne: null } 
    }, { projection: { _id: 1, numero: 1, quartier: 1 } }).toArray();
    
    backupData.collections.adressshippings = adressShippings;
    console.log(`📦 Sauvegardé ${adressShippings.length} numéros d'adresses`);
    
    // Écrire le fichier de sauvegarde
    const fs = require('fs');
    const backupFileName = `backup_phone_numbers_${timestamp}.json`;
    fs.writeFileSync(backupFileName, JSON.stringify(backupData, null, 2));
    
    console.log(`✅ Sauvegarde créée: ${backupFileName}`);
    console.log(`📊 Total: ${users.length + profiles.length + fournisseurs.length + mobileMoneys.length + adressShippings.length} numéros sauvegardés`);
    
  } catch (error) {
    console.error('❌ Erreur lors de la sauvegarde:', error);
  } finally {
    mongoose.connection.close();
  }
}

db.once('open', async () => {
  console.log('✅ Connexion à MongoDB établie pour sauvegarde');
  await backupPhoneNumbers();
});

db.on('error', (error) => {
  console.error('❌ Erreur de connexion MongoDB:', error);
});
