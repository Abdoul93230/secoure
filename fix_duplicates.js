const mongoose = require('mongoose');
require('dotenv').config();

// Configuration MongoDB
const MONGODB_URI = "mongodb+srv://abdoulrazak9323:qrru0xfJGmJG0TSc@cluster0.mvrgous.mongodb.net/?retryWrites=true&w=majority";

async function fixDuplicates() {
    try {
        console.log('🛠️  Résolution des doublons de numéros de téléphone...');
        
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connexion à MongoDB établie');
        
        const db = mongoose.connection.db;
        
        // Identifier les utilisateurs avec +22787727501
        const duplicateUsers = await db.collection('users').find({
            phoneNumber: '+22787727501'
        }).toArray();
        
        console.log('\n🔍 Utilisateurs avec le numéro +22787727501:');
        duplicateUsers.forEach((user, index) => {
            console.log(`${index + 1}. ID: ${user._id}`);
            console.log(`   Nom: ${user.nom || 'Sans nom'}`);
            console.log(`   Email: ${user.email || 'Sans email'}`);
            console.log(`   Téléphone: ${user.phoneNumber}`);
            console.log('');
        });
        
        // Option 1: Supprimer le compte test (sans email)
        console.log('🗑️  Option 1: Supprimer le compte test...');
        const testUser = duplicateUsers.find(user => !user.email || user.email === '');
        
        if (testUser) {
            console.log(`   Suppression du compte test ID: ${testUser._id}`);
            
            // Demander confirmation avant de supprimer
            console.log('⚠️  ATTENTION: Cela va supprimer définitivement le compte test');
            console.log('   Pour continuer, relancez avec: node fix_duplicates.js --confirm');
            
            if (process.argv.includes('--confirm')) {
                const deleteResult = await db.collection('users').deleteOne({
                    _id: testUser._id
                });
                
                if (deleteResult.deletedCount === 1) {
                    console.log('✅ Compte test supprimé avec succès');
                } else {
                    console.log('❌ Erreur lors de la suppression');
                }
            }
        }
        
        // Option 2: Modifier le numéro du compte test
        console.log('\n📝 Option 2: Modifier le numéro du compte test...');
        if (testUser && !process.argv.includes('--confirm')) {
            console.log('   Alternative: Modifier le numéro du test en +22787727502');
            console.log('   Pour cette option, relancez avec: node fix_duplicates.js --modify');
        }
        
        if (process.argv.includes('--modify') && testUser) {
            const newPhoneNumber = '+22787727502';
            const updateResult = await db.collection('users').updateOne(
                { _id: testUser._id },
                { $set: { phoneNumber: newPhoneNumber } }
            );
            
            if (updateResult.modifiedCount === 1) {
                console.log(`✅ Numéro du compte test modifié en ${newPhoneNumber}`);
            } else {
                console.log('❌ Erreur lors de la modification');
            }
        }
        
        // Vérification finale
        if (process.argv.includes('--confirm') || process.argv.includes('--modify')) {
            console.log('\n🔍 Vérification finale...');
            const remainingDuplicates = await db.collection('users').find({
                phoneNumber: '+22787727501'
            }).toArray();
            
            console.log(`📱 Utilisateurs restants avec +22787727501: ${remainingDuplicates.length}`);
            if (remainingDuplicates.length === 1) {
                console.log('✅ Problème de doublon résolu !');
            }
        }
        
        await mongoose.connection.close();
        console.log('\n👋 Opération terminée');
        
    } catch (error) {
        console.error('❌ Erreur:', error);
        process.exit(1);
    }
}

fixDuplicates();
