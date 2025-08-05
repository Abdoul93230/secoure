const fs = require('fs');
const path = require('path');

console.log('🧹 Assistant de nettoyage des fichiers de migration\n');

// Fichiers créés pour la migration
const migrationFiles = [
    'migrate_phone_numbers.js',
    'backup_phone_numbers.js', 
    'check_duplicates.js',
    'fix_duplicates.js',
    'MIGRATION_GUIDE.md'
];

// Fichiers de sauvegarde
const backupFiles = [
    'backup_phone_numbers_2025-08-05T13-39-03-627Z.json'
];

// Fichiers de test
const testFiles = [
    'test_login.js',
    'test_model.js'
];

// Autres fichiers
const otherFiles = [
    'App.js',
    'komipay.md',
    'google79b12f86ad29d805.html'
];

function checkFileExists(fileName) {
    return fs.existsSync(fileName);
}

function getFileSize(fileName) {
    if (checkFileExists(fileName)) {
        const stats = fs.statSync(fileName);
        return (stats.size / 1024).toFixed(2) + ' KB';
    }
    return 'N/A';
}

function getFileDate(fileName) {
    if (checkFileExists(fileName)) {
        const stats = fs.statSync(fileName);
        return stats.mtime.toLocaleDateString();
    }
    return 'N/A';
}

console.log('📋 ANALYSE DES FICHIERS:\n');

console.log('🔧 FICHIERS DE MIGRATION:');
migrationFiles.forEach(file => {
    if (checkFileExists(file)) {
        console.log(`✅ ${file} (${getFileSize(file)}) - ${getFileDate(file)}`);
    }
});

console.log('\n💾 FICHIERS DE SAUVEGARDE:');
backupFiles.forEach(file => {
    if (checkFileExists(file)) {
        console.log(`✅ ${file} (${getFileSize(file)}) - ${getFileDate(file)}`);
    }
});

console.log('\n🧪 FICHIERS DE TEST:');
testFiles.forEach(file => {
    if (checkFileExists(file)) {
        console.log(`✅ ${file} (${getFileSize(file)}) - ${getFileDate(file)}`);
    }
});

console.log('\n📄 AUTRES FICHIERS:');
otherFiles.forEach(file => {
    if (checkFileExists(file)) {
        console.log(`✅ ${file} (${getFileSize(file)}) - ${getFileDate(file)}`);
    }
});

console.log('\n📝 RECOMMANDATIONS:\n');

console.log('🟢 GARDER:');
console.log('   ✅ backup_phone_numbers_2025-08-05T13-39-03-627Z.json (sauvegarde importante)');
console.log('   ✅ MIGRATION_GUIDE.md (documentation pour l\'avenir)');
console.log('   ✅ package.json (configuration du projet)');

console.log('\n🟡 OPTIONNEL (vous pouvez supprimer):');
console.log('   🗑️  migrate_phone_numbers.js (migration terminée)');
console.log('   🗑️  backup_phone_numbers.js (plus besoin)'); 
console.log('   🗑️  check_duplicates.js (diagnostic terminé)');
console.log('   🗑️  fix_duplicates.js (problème résolu)');

console.log('\n🔴 SUPPRIMER SI PLUS NÉCESSAIRE:');
console.log('   🗑️  test_login.js (fichier de test)');
console.log('   🗑️  test_model.js (fichier de test)');
console.log('   🗑️  App.js (dépend de votre projet)');

console.log('\n🚀 Pour supprimer automatiquement les fichiers optionnels:');
console.log('   node cleanup.js --migration-files');
console.log('\n🧪 Pour supprimer les fichiers de test:');
console.log('   node cleanup.js --test-files');
console.log('\n⚠️  Pour tout supprimer sauf les sauvegardes:');
console.log('   node cleanup.js --all-temp');

// Exécution des suppressions si arguments fournis
if (process.argv.includes('--migration-files')) {
    console.log('\n🗑️  Suppression des fichiers de migration...');
    const filesToDelete = ['migrate_phone_numbers.js', 'backup_phone_numbers.js', 'check_duplicates.js', 'fix_duplicates.js'];
    
    filesToDelete.forEach(file => {
        if (checkFileExists(file)) {
            fs.unlinkSync(file);
            console.log(`   ✅ ${file} supprimé`);
        }
    });
}

if (process.argv.includes('--test-files')) {
    console.log('\n🗑️  Suppression des fichiers de test...');
    testFiles.forEach(file => {
        if (checkFileExists(file)) {
            fs.unlinkSync(file);
            console.log(`   ✅ ${file} supprimé`);
        }
    });
}

if (process.argv.includes('--all-temp')) {
    console.log('\n🗑️  Suppression de tous les fichiers temporaires...');
    const allTempFiles = [...migrationFiles.filter(f => f !== 'MIGRATION_GUIDE.md'), ...testFiles];
    
    allTempFiles.forEach(file => {
        if (checkFileExists(file)) {
            fs.unlinkSync(file);
            console.log(`   ✅ ${file} supprimé`);
        }
    });
}

console.log('\n✨ Analyse terminée !');
