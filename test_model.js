// Test simple pour vérifier les modèles
const { User } = require('./src/Models');

async function testUserModel() {
  try {
    console.log('🧪 Test du modèle User avec numéro de téléphone...');
    
    // Test avec un numéro valide
    const testUser = new User({
      name: 'Test User Model',
      phoneNumber: '+22787727501',
      password: 'motdepasse123',
      whatsapp: true
    });
    
    // Valider le modèle sans sauvegarder
    const validationError = testUser.validateSync();
    
    if (validationError) {
      console.log('❌ Erreur de validation:', validationError.errors);
    } else {
      console.log('✅ Modèle User valide avec le numéro:', testUser.phoneNumber);
    }
    
    // Test avec un numéro invalide
    const testUser2 = new User({
      name: 'Test User Invalid',
      phoneNumber: '87727501', // Sans indicatif
      password: 'motdepasse123'
    });
    
    const validationError2 = testUser2.validateSync();
    
    if (validationError2) {
      console.log('✅ Validation échoue comme attendu pour:', testUser2.phoneNumber);
      console.log('   Erreur:', validationError2.errors.phoneNumber?.message);
    } else {
      console.log('❌ La validation devrait échouer pour:', testUser2.phoneNumber);
    }
    
  } catch (error) {
    console.error('❌ Erreur lors du test:', error);
  }
}

testUserModel();
