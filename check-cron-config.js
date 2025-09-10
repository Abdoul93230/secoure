const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');

// Charger les variables d'environnement
require('dotenv').config();

// Script pour vérifier la configuration des cron jobs
console.log('🔍 VÉRIFICATION DE LA CONFIGURATION DES CRON JOBS\n');

// Vérifier si node-cron est installé
try {
  require('node-cron');
  const cronPackage = require('./node_modules/node-cron/package.json');
  console.log(`✅ node-cron installé (version ${cronPackage.version})`);
} catch (error) {
  try {
    // Essayer de l'importer directement
    require('node-cron');
    console.log('✅ node-cron installé (version inconnue)');
  } catch (err) {
    console.log('❌ node-cron n\'est pas installé');
    console.log('   Installez avec: npm install node-cron');
  }
}

// Vérifier si nodemailer est installé
try {
  const nodemailerVersion = require('nodemailer/package.json').version;
  console.log(`✅ nodemailer installé (version ${nodemailerVersion})`);
} catch (error) {
  console.log('❌ nodemailer n\'est pas installé');
  console.log('   Installez avec: npm install nodemailer');
}

// Vérifier les variables d'environnement
console.log('\n📧 VÉRIFICATION DE LA CONFIGURATION EMAIL:');
const emailUser = process.env.EMAIL_USER;
const emailPassword = process.env.EMAIL_PASS; // Correction: utiliser EMAIL_PASS au lieu de EMAIL_PASSWORD

if (emailUser) {
  console.log(`✅ EMAIL_USER configuré: ${emailUser}`);
} else {
  console.log('❌ EMAIL_USER non configuré dans .env');
}

if (emailPassword) {
  console.log('✅ EMAIL_PASS configuré');
} else {
  console.log('❌ EMAIL_PASS non configuré dans .env');
}

// Tester la validité des expressions cron
console.log('\n⏰ VALIDATION DES EXPRESSIONS CRON:');

const cronExpressions = [
  { name: 'Toutes les 6 heures (expirations)', expression: '0 */6 * * *' },
  { name: 'Toutes les heures (queue)', expression: '0 * * * *' },
  { name: 'Quotidien à 3h (nettoyage)', expression: '0 3 * * *' },
  { name: 'Hebdomadaire dimanche à 2h (métriques)', expression: '0 2 * * 0' },
  { name: 'Toutes les 30 minutes (transactions)', expression: '*/30 * * * *' }
];

cronExpressions.forEach(({ name, expression }) => {
  if (cron.validate(expression)) {
    console.log(`✅ ${name}: ${expression}`);
  } else {
    console.log(`❌ ${name}: ${expression} - INVALIDE`);
  }
});

// Créer un cron job de test pour 5 secondes
console.log('\n🧪 TEST D\'EXÉCUTION D\'UN CRON JOB:');
console.log('Création d\'un cron job de test (exécution dans 5 secondes)...');

let testCounter = 0;
const testCron = cron.schedule('*/5 * * * * *', () => {
  testCounter++;
  console.log(`✅ Cron job de test exécuté ${testCounter} fois - ${new Date().toLocaleTimeString()}`);
  
  if (testCounter >= 3) {
    testCron.stop();
    console.log('🛑 Cron job de test arrêté après 3 exécutions');
    
    // Afficher le résumé final
    setTimeout(() => {
      console.log('\n📋 RÉSUMÉ DE LA VÉRIFICATION:');
      console.log('✅ Configuration des cron jobs valide');
      console.log('✅ Test d\'exécution réussi');
      console.log('\n🚀 Vous pouvez maintenant lancer le test complet avec:');
      console.log('   node test-cron-jobs.js');
      process.exit(0);
    }, 1000);
  }
}, {
  scheduled: true
});

testCron.start();

console.log('⏳ Attente de l\'exécution du cron job de test...');

// Arrêter le test après 30 secondes au maximum
setTimeout(() => {
  if (testCounter === 0) {
    console.log('❌ Aucun cron job exécuté après 30 secondes');
    console.log('   Vérifiez la configuration de node-cron');
  }
  testCron.stop();
  process.exit(0);
}, 30000);
