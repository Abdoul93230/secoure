const axios = require('axios');

// Configuration de base
const BASE_URL = 'http://localhost:3001';

// Fonction pour tester la connexion avec email
async function testLoginWithEmail() {
  try {
    console.log('🧪 Test de connexion avec email...');
    const response = await axios.post(`${BASE_URL}/login`, {
      identifier: 'test@example.com',
      password: 'motdepasse123'
    });
    
    console.log('✅ Connexion email réussie:', response.data);
  } catch (error) {
    console.log('❌ Erreur connexion email:', error.response?.data || error.message);
  }
}

// Fonction pour tester la connexion avec numéro de téléphone
async function testLoginWithPhone() {
  try {
    console.log('🧪 Test de connexion avec numéro de téléphone...');
    const response = await axios.post(`${BASE_URL}/login`, {
      identifier: '+22787727501',
      password: 'motdepasse123'
    });
    
    console.log('✅ Connexion téléphone réussie:', response.data);
  } catch (error) {
    console.log('❌ Erreur connexion téléphone:', error.response?.data || error.message);
  }
}

// Fonction pour tester l'inscription avec numéro de téléphone complet
async function testRegisterWithPhone() {
  try {
    console.log('🧪 Test d\'inscription avec numéro de téléphone...');
    const response = await axios.post(`${BASE_URL}/user`, {
      name: 'Test User',
      phoneNumber: '+22787727501',
      password: 'motdepasse123',
      whatsapp: true
    });
    
    console.log('✅ Inscription téléphone réussie:', response.data);
  } catch (error) {
    console.log('❌ Erreur inscription téléphone:', error.response?.data || error.message);
  }
}

// Exécuter les tests
async function runTests() {
  console.log('🚀 Démarrage des tests de l\'API...\n');
  
  await testRegisterWithPhone();
  console.log('');
  
  await testLoginWithEmail();
  console.log('');
  
  await testLoginWithPhone();
  console.log('');
  
  console.log('✨ Tests terminés !');
}

// Lancer les tests si le serveur est accessible
axios.get(`${BASE_URL}/health`)
  .then(() => {
    console.log('✅ Serveur accessible');
    runTests();
  })
  .catch(() => {
    console.log('❌ Serveur non accessible sur', BASE_URL);
    console.log('Assurez-vous que votre serveur backend fonctionne');
  });
