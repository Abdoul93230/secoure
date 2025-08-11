const axios = require('axios');

async function testLogin() {
  try {
    console.log('Test de connexion avec identifiant...\n');
    
    // Test avec un numéro qui n'existe pas
    const testData = {
      identifier: '+22799999999',
      password: 'test123'
    };

    console.log('Données envoyées:', testData);

    const response = await axios.post('https://secoure.onrender.com/login', testData);
    
    console.log('✅ Connexion réussie!');
    console.log('Réponse:', response.data);
    
  } catch (error) {
    if (error.response) {
      console.log('❌ Erreur de connexion');
      console.log('Status:', error.response.status);
      console.log('Message:', error.response.data.message);
    } else {
      console.error('Erreur réseau:', error.message);
    }
  }
}

testLogin();
