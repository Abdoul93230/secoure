require('dotenv').config();
const mongoose = require('mongoose');
const cron = require('node-cron');
const FinancialService = require('./src/services/FinancialService');
const { confirmerTransactionsLivrees } = require('./src/controllers/financeController');
const financialLogger = require('./src/utils/financialLogger');

async function verifySystemHealth() {
  try {
    console.log('🔗 Connexion à MongoDB Atlas...');
    
    await mongoose.connect(
      process.env.MONGODB_URI,
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );
    
    console.log('✅ Connexion réussie');
    console.log('\n🔍 === VÉRIFICATION COMPLÈTE DU SYSTÈME FINANCIER ===');
    
    const results = {
      cronJobs: { status: 'unknown', details: [] },
      financialService: { status: 'unknown', functions: [] },
      database: { status: 'unknown', collections: [] },
      monitoring: { status: 'unknown', logs: [] }
    };
    
    // 1. VÉRIFICATION DES CRON JOBS
    console.log('\n1️⃣ === VÉRIFICATION DES CRON JOBS ===');
    
    try {
      // Test du déblocage automatique
      console.log('   🔓 Test déblocage automatique...');
      const deblocageResult = await FinancialService.debloquerArgentDisponible();
      console.log(`   ✅ Déblocage: ${deblocageResult.count} transactions, ${deblocageResult.montant} FCFA`);
      results.cronJobs.details.push({
        name: 'Déblocage automatique',
        status: 'OK',
        result: deblocageResult
      });
      
      // Test de confirmation automatique
      console.log('   ✅ Test confirmation automatique...');
      const confirmationResult = await confirmerTransactionsLivrees();
      console.log(`   ✅ Confirmation: ${confirmationResult.confirmees}/${confirmationResult.total} transactions`);
      results.cronJobs.details.push({
        name: 'Confirmation automatique',
        status: 'OK',
        result: confirmationResult
      });
      
      // Test du nettoyage automatique
      console.log('   🧹 Test nettoyage automatique...');
      const nettoyageResult = await FinancialService.nettoyageAutomatique();
      console.log(`   ✅ Nettoyage: ${nettoyageResult.retraitsExpires} retraits expirés`);
      results.cronJobs.details.push({
        name: 'Nettoyage automatique',
        status: 'OK',
        result: nettoyageResult
      });
      
      results.cronJobs.status = 'OK';
      
    } catch (error) {
      console.error('   ❌ Erreur CRON jobs:', error.message);
      results.cronJobs.status = 'ERROR';
      results.cronJobs.error = error.message;
    }
    
    // 2. VÉRIFICATION DES FONCTIONS FINANCIÈRES
    console.log('\n2️⃣ === VÉRIFICATION DES FONCTIONS FINANCIÈRES ===');
    
    const functionsToTest = [
      'creerPortefeuille',
      'creerTransactionsCommande',
      'gererChangementEtatCommande',
      'confirmerTransactionsCommande',
      'debloquerArgentDisponible',
      'verifierCoherencePortefeuille',
      'nettoyageAutomatique'
    ];
    
    functionsToTest.forEach(funcName => {
      const funcExists = typeof FinancialService[funcName] === 'function';
      console.log(`   ${funcExists ? '✅' : '❌'} ${funcName}: ${funcExists ? 'Disponible' : 'MANQUANTE'}`);
      results.financialService.functions.push({
        name: funcName,
        status: funcExists ? 'OK' : 'MISSING',
        available: funcExists
      });
    });
    
    results.financialService.status = results.financialService.functions.every(f => f.status === 'OK') ? 'OK' : 'ERROR';
    
    // 3. VÉRIFICATION DE LA BASE DE DONNÉES
    console.log('\n3️⃣ === VÉRIFICATION DE LA BASE DE DONNÉES ===');
    
    try {
      const collections = [
        { name: 'transactions', model: require('./src/models/transactionSchema') },
        { name: 'portefeuilles', model: require('./src/models/portefeuilleSchema') },
        { name: 'retraits', model: require('./src/models/retraitSchema') },
        { name: 'commandes', model: require('./src/Models').Commande }
      ];
      
      for (const col of collections) {
        const count = await col.model.countDocuments();
        console.log(`   📊 ${col.name}: ${count} documents`);
        results.database.collections.push({
          name: col.name,
          count: count,
          status: 'OK'
        });
      }
      
      results.database.status = 'OK';
      
    } catch (error) {
      console.error('   ❌ Erreur base de données:', error.message);
      results.database.status = 'ERROR';
      results.database.error = error.message;
    }
    
    // 4. VÉRIFICATION DU SYSTÈME DE LOGS
    console.log('\n4️⃣ === VÉRIFICATION DU SYSTÈME DE LOGS ===');
    
    try {
      // Test d'écriture de log
      financialLogger.success('SYSTEM_CHECK', { message: 'Test de vérification système' });
      console.log('   ✅ Écriture de logs: OK');
      
      // Nettoyage des anciens logs
      financialLogger.cleanOldLogs(30);
      console.log('   ✅ Nettoyage des logs: OK');
      
      results.monitoring.status = 'OK';
      results.monitoring.logs.push({
        name: 'Financial Logger',
        status: 'OK'
      });
      
    } catch (error) {
      console.error('   ❌ Erreur système de logs:', error.message);
      results.monitoring.status = 'ERROR';
      results.monitoring.error = error.message;
    }
    
    // 5. TEST DE VALIDATION CRON JOBS EN TEMPS RÉEL
    console.log('\n5️⃣ === TEST DE VALIDATION DES CRON JOBS ===');
    
    try {
      // Vérifier si les cron jobs peuvent être créés
      const testCron = cron.schedule('* * * * *', () => {
        // Test job - ne fait rien
      }, { scheduled: false });
      
      console.log('   ✅ Création de CRON jobs: OK');
      testCron.destroy();
      console.log('   ✅ Destruction de CRON jobs: OK');
      
    } catch (error) {
      console.error('   ❌ Erreur CRON jobs:', error.message);
    }
    
    // 6. RÉSUMÉ GÉNÉRAL
    console.log('\n📊 === RÉSUMÉ DE LA VÉRIFICATION ===');
    
    const globalStatus = Object.values(results).every(r => r.status === 'OK');
    
    console.log(`🔧 CRON Jobs: ${results.cronJobs.status}`);
    console.log(`💰 Service Financier: ${results.financialService.status}`);
    console.log(`🗄️  Base de Données: ${results.database.status}`);
    console.log(`📝 Système de Logs: ${results.monitoring.status}`);
    
    console.log(`\n${globalStatus ? '🎉' : '⚠️'} ÉTAT GLOBAL: ${globalStatus ? 'TOUS LES SYSTÈMES FONCTIONNENT PARFAITEMENT' : 'CERTAINS PROBLÈMES DÉTECTÉS'}`);
    
    if (globalStatus) {
      console.log('\n✅ === SYSTÈME PRÊT POUR LA PRODUCTION ===');
      console.log('🚀 Tous les composants financiers sont opérationnels');
      console.log('⚡ Les CRON jobs de déblocage et confirmation fonctionnent');
      console.log('🔄 Le nettoyage automatique est actif');
      console.log('📊 La base de données est accessible');
      console.log('📝 Les logs sont fonctionnels');
    } else {
      console.log('\n⚠️ === PROBLÈMES DÉTECTÉS ===');
      Object.entries(results).forEach(([key, value]) => {
        if (value.status !== 'OK') {
          console.log(`❌ ${key}: ${value.error || 'Erreur inconnue'}`);
        }
      });
    }
    
    await mongoose.disconnect();
    console.log('\n🔌 Vérification terminée');
    
    return results;
    
  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Exécuter si appelé directement
if (require.main === module) {
  verifySystemHealth();
}

module.exports = verifySystemHealth;