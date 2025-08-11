const axios = require('axios');

async function testLoginWithYourCredentials() {
  try {
    console.log('=== Test de connexion IhamBaobab ===\n');
    
    // Vous pouvez modifier ces valeurs pour tester vos identifiants
    const testCases = [
      {
        name: 'Test avec email',
        identifier: 'abdoulrazak9323@gmail.com',
        password: 'votre_mot_de_passe_ici'
      },
      {
        name: 'Test avec numéro de téléphone',
        identifier: '+22787727501',
        password: 'votre_mot_de_passe_ici'
      }
    ];

    for (const testCase of testCases) {
      console.log(`🔍 ${testCase.name}`);
      console.log(`Identifiant: ${testCase.identifier}`);
      
      try {
        const response = await axios.post('https://secoure.onrender.com/login', {
          identifier: testCase.identifier,
          password: testCase.password
        });
        
        console.log('✅ Connexion réussie!');
        console.log('Utilisateur:', response.data.user?.name || 'Non défini');
        console.log('---\n');
        
      } catch (error) {
        if (error.response) {
          console.log('❌ Erreur:', error.response.data.message);
          console.log('Status:', error.response.status);
        } else {
          console.log('❌ Erreur réseau:', error.message);
        }
        console.log('---\n');
      }
    }

    // Afficher la liste des utilisateurs pour référence
    console.log('📋 Référence - Utilisateurs dans la base de données:');
    const { User } = require('./src/Models');
    const users = await User.find({}, 'email phoneNumber name').limit(10);
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name || 'Sans nom'}`);
      console.log(`   Email: ${user.email || 'Non défini'}`);
      console.log(`   Téléphone: ${user.phoneNumber || 'Non défini'}`);
      console.log('');
    });
    
    process.exit();
    
  } catch (error) {
    console.error('Erreur générale:', error.message);
    process.exit(1);
  }
}

testLoginWithYourCredentials();
