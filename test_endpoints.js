// Script de test pour vérifier les endpoints de l'app Next.js

const axios = require('axios');

const API_BASE = 'https://secoure.onrender.com';

async function testEndpoints() {
    console.log('🧪 Test des endpoints de l\'API...\n');
    
    // Test endpoint de santé
    try {
        console.log('1. Test du endpoint de santé...');
        const healthResponse = await axios.get(`${API_BASE}/health`);
        console.log('✅ Endpoint /health:', healthResponse.data);
    } catch (error) {
        console.log('❌ Endpoint /health:', error.message);
    }
    
    // Test endpoint de login avec un compte test (sans vraies credentials)
    try {
        console.log('\n2. Test du endpoint de login...');
        const testLogin = {
            identifier: 'test@test.com',
            password: 'wrongpassword'
        };
        
        const loginResponse = await axios.post(`${API_BASE}/login`, testLogin);
        console.log('✅ Endpoint /login accessible');
    } catch (error) {
        if (error.response) {
            console.log('✅ Endpoint /login accessible (erreur attendue car mauvaises credentials)');
            console.log('   Status:', error.response.status);
            console.log('   Message:', error.response.data.message || 'Erreur de connexion');
        } else {
            console.log('❌ Endpoint /login:', error.message);
        }
    }
    
    // Test endpoint de création d'utilisateur
    try {
        console.log('\n3. Test du endpoint user...');
        const testUser = {
            name: 'Test User',
            email: 'test@test.com',
            password: 'test123',
            phoneNumber: '+22787727501'
        };
        
        const userResponse = await axios.post(`${API_BASE}/user`, testUser);
        console.log('✅ Endpoint /user accessible');
    } catch (error) {
        if (error.response) {
            console.log('✅ Endpoint /user accessible');
            console.log('   Status:', error.response.status);
            console.log('   Message:', error.response.data.message || 'Erreur attendue');
        } else {
            console.log('❌ Endpoint /user:', error.message);
        }
    }
    
    console.log('\n🎉 Tests terminés !');
}

testEndpoints();
