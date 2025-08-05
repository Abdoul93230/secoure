const mongoose = require('mongoose');
require('dotenv').config();

// Configuration MongoDB
const MONGODB_URI = "mongodb+srv://abdoulrazak9323:qrru0xfJGmJG0TSc@cluster0.mvrgous.mongodb.net/?retryWrites=true&w=majority";

async function checkDuplicates() {
    try {
        console.log('🔍 Vérification des doublons de numéros de téléphone...');
        
        // Connexion à MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connexion à MongoDB établie');
        
        const db = mongoose.connection.db;
        
        // Vérifier les doublons dans la collection users
        console.log('\n📱 Analyse des doublons dans USERS...');
        const userDuplicates = await db.collection('users').aggregate([
            {
                $match: {
                    phoneNumber: { $exists: true, $ne: null, $ne: "" }
                }
            },
            {
                $group: {
                    _id: "$phoneNumber",
                    count: { $sum: 1 },
                    users: { 
                        $push: { 
                            id: "$_id", 
                            nom: "$nom", 
                            email: "$email",
                            createdAt: "$createdAt"
                        } 
                    }
                }
            },
            {
                $match: {
                    count: { $gt: 1 }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]).toArray();

        if (userDuplicates.length > 0) {
            console.log(`🚨 ${userDuplicates.length} numéros en doublon trouvés :`);
            
            userDuplicates.forEach((duplicate, index) => {
                console.log(`\n${index + 1}. Numéro: ${duplicate._id} (${duplicate.count} utilisateurs)`);
                duplicate.users.forEach((user, userIndex) => {
                    console.log(`   ${userIndex + 1}. ${user.nom || 'Sans nom'} (${user.email || 'Sans email'}) - ID: ${user.id}`);
                    if (user.createdAt) {
                        console.log(`      Créé le: ${new Date(user.createdAt).toLocaleDateString()}`);
                    }
                });
            });
        } else {
            console.log('✅ Aucun doublon trouvé dans USERS');
        }

        // Statistiques générales
        console.log('\n📊 Statistiques générales:');
        const totalUsers = await db.collection('users').countDocuments();
        const usersWithPhone = await db.collection('users').countDocuments({
            phoneNumber: { $exists: true, $ne: null, $ne: "" }
        });
        
        console.log(`👥 Total utilisateurs: ${totalUsers}`);
        console.log(`📱 Utilisateurs avec téléphone: ${usersWithPhone}`);
        
        // Vérifier les numéros spécifiques mentionnés
        console.log('\n🔍 Vérification des numéros spécifiques:');
        const specificNumber = '+22787727501';
        const usersWithSpecificNumber = await db.collection('users').find({
            phoneNumber: specificNumber
        }).toArray();
        
        console.log(`\n📞 Utilisateurs avec ${specificNumber}:`);
        usersWithSpecificNumber.forEach((user, index) => {
            console.log(`   ${index + 1}. ${user.nom || 'Sans nom'} (${user.email || 'Sans email'})`);
            console.log(`      ID: ${user._id}`);
            console.log(`      Créé: ${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Date inconnue'}`);
        });

        await mongoose.connection.close();
        console.log('\n👋 Vérification terminée');
        
    } catch (error) {
        console.error('❌ Erreur:', error);
        process.exit(1);
    }
}

checkDuplicates();
