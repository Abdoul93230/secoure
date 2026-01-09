const mongoose = require('mongoose');
require('dotenv').config();

const { TypeProduit } = require('./src/Models');
// Mapping des IDs de catégories avec leurs noms
const categoriesMap = {
  "All": "695918b1813cdaee135155f5",
  "Mode & Vêtements": "69591a65813cdaee13515615",
  "Électronique & Informatique": "69591a87813cdaee13515618",
  "Maison & Décoration": "69591aaf813cdaee1351561b",
  "Beauté & Santé": "69591ad0813cdaee1351561e",
  "Sports & Loisirs": "69591afa813cdaee13515621",
  "Artisanat & Art": "69591b29813cdaee13515624",
  "Bijoux & Accessoires": "69591b51813cdaee13515627",
  "Alimentation & Boissons": "69591b7f813cdaee1351562a",
  "Livres & Médias": "69591bb6813cdaee1351562d",
  "Enfants & Bébés": "69591bfb813cdaee13515630",
  "Automobile & Moto": "69591c12813cdaee13515633",
  "Jardin & Bricolage": "69591c49813cdaee13515636",
  "Services": "69591c7a813cdaee13515639",
  "Téléphones & Tablettes": "69591c9c813cdaee1351563c",
  "Électroménager": "69591cc3813cdaee1351563f"
};

// Liste complète des types de produits
const typesProduits = [
  // MODE & VÊTEMENTS
  { name: "Vêtements Homme", clefCategories: "69591a65813cdaee13515615" },
  { name: "Vêtements Femme", clefCategories: "69591a65813cdaee13515615" },
  { name: "Vêtements Enfant", clefCategories: "69591a65813cdaee13515615" },
  { name: "Chaussures Homme", clefCategories: "69591a65813cdaee13515615" },
  { name: "Chaussures Femme", clefCategories: "69591a65813cdaee13515615" },
  { name: "Chaussures Enfant", clefCategories: "69591a65813cdaee13515615" },
  { name: "Sacs & Bagages", clefCategories: "69591a65813cdaee13515615" },
  { name: "Vêtements Traditionnels", clefCategories: "69591a65813cdaee13515615" },
  { name: "Sous-vêtements", clefCategories: "69591a65813cdaee13515615" },
  { name: "Montres", clefCategories: "69591a65813cdaee13515615" },

  // ÉLECTRONIQUE & INFORMATIQUE
  { name: "Ordinateurs Portables", clefCategories: "69591a87813cdaee13515618" },
  { name: "Ordinateurs de Bureau", clefCategories: "69591a87813cdaee13515618" },
  { name: "Composants PC", clefCategories: "69591a87813cdaee13515618" },
  { name: "Périphériques", clefCategories: "69591a87813cdaee13515618" },
  { name: "Réseaux & Wifi", clefCategories: "69591a87813cdaee13515618" },
  { name: "Stockage & Mémoire", clefCategories: "69591a87813cdaee13515618" },
  { name: "Imprimantes & Scanners", clefCategories: "69591a87813cdaee13515618" },
  { name: "Logiciels", clefCategories: "69591a87813cdaee13515618" },
  { name: "Câbles & Adaptateurs", clefCategories: "69591a87813cdaee13515618" },
  { name: "Accessoires Informatique", clefCategories: "69591a87813cdaee13515618" },

  // TÉLÉPHONES & TABLETTES
  { name: "Smartphones Android", clefCategories: "69591c9c813cdaee1351563c" },
  { name: "iPhones", clefCategories: "69591c9c813cdaee1351563c" },
  { name: "Téléphones Basiques", clefCategories: "69591c9c813cdaee1351563c" },
  { name: "Tablettes", clefCategories: "69591c9c813cdaee1351563c" },
  { name: "Accessoires Téléphones", clefCategories: "69591c9c813cdaee1351563c" },
  { name: "Coques & Protections", clefCategories: "69591c9c813cdaee1351563c" },
  { name: "Chargeurs & Batteries", clefCategories: "69591c9c813cdaee1351563c" },
  { name: "Écouteurs & Casques", clefCategories: "69591c9c813cdaee1351563c" },
  { name: "Cartes SIM & Recharge", clefCategories: "69591c9c813cdaee1351563c" },

  // ÉLECTROMÉNAGER
  { name: "Réfrigérateurs & Congélateurs", clefCategories: "69591cc3813cdaee1351563f" },
  { name: "Cuisinières & Fours", clefCategories: "69591cc3813cdaee1351563f" },
  { name: "Machines à Laver", clefCategories: "69591cc3813cdaee1351563f" },
  { name: "Climatiseurs & Ventilateurs", clefCategories: "69591cc3813cdaee1351563f" },
  { name: "Micro-ondes", clefCategories: "69591cc3813cdaee1351563f" },
  { name: "Petits Électroménagers", clefCategories: "69591cc3813cdaee1351563f" },
  { name: "Aspirateurs", clefCategories: "69591cc3813cdaee1351563f" },
  { name: "Fers à Repasser", clefCategories: "69591cc3813cdaee1351563f" },
  { name: "Bouilloires & Cafetières", clefCategories: "69591cc3813cdaee1351563f" },

  // MAISON & DÉCORATION
  { name: "Meubles Salon", clefCategories: "69591aaf813cdaee1351561b" },
  { name: "Meubles Chambre", clefCategories: "69591aaf813cdaee1351561b" },
  { name: "Meubles Cuisine", clefCategories: "69591aaf813cdaee1351561b" },
  { name: "Meubles Bureau", clefCategories: "69591aaf813cdaee1351561b" },
  { name: "Décoration Murale", clefCategories: "69591aaf813cdaee1351561b" },
  { name: "Textiles Maison", clefCategories: "69591aaf813cdaee1351561b" },
  { name: "Éclairage", clefCategories: "69591aaf813cdaee1351561b" },
  { name: "Tapis & Rideaux", clefCategories: "69591aaf813cdaee1351561b" },
  { name: "Vaisselle & Couverts", clefCategories: "69591aaf813cdaee1351561b" },
  { name: "Rangement & Organisation", clefCategories: "69591aaf813cdaee1351561b" },

  // BEAUTÉ & SANTÉ
  { name: "Parfums Homme", clefCategories: "69591ad0813cdaee1351561e" },
  { name: "Parfums Femme", clefCategories: "69591ad0813cdaee1351561e" },
  { name: "Maquillage", clefCategories: "69591ad0813cdaee1351561e" },
  { name: "Soins Visage", clefCategories: "69591ad0813cdaee1351561e" },
  { name: "Soins Corps", clefCategories: "69591ad0813cdaee1351561e" },
  { name: "Soins Cheveux", clefCategories: "69591ad0813cdaee1351561e" },
  { name: "Produits Naturels", clefCategories: "69591ad0813cdaee1351561e" },
  { name: "Hygiène", clefCategories: "69591ad0813cdaee1351561e" },
  { name: "Compléments Alimentaires", clefCategories: "69591ad0813cdaee1351561e" },
  { name: "Matériel Médical", clefCategories: "69591ad0813cdaee1351561e" },

  // SPORTS & LOISIRS
  { name: "Équipement Fitness", clefCategories: "69591afa813cdaee13515621" },
  { name: "Football", clefCategories: "69591afa813cdaee13515621" },
  { name: "Basketball", clefCategories: "69591afa813cdaee13515621" },
  { name: "Running & Athlétisme", clefCategories: "69591afa813cdaee13515621" },
  { name: "Sports de Combat", clefCategories: "69591afa813cdaee13515621" },
  { name: "Vélos & Trottinettes", clefCategories: "69591afa813cdaee13515621" },
  { name: "Camping & Randonnée", clefCategories: "69591afa813cdaee13515621" },
  { name: "Natation", clefCategories: "69591afa813cdaee13515621" },
  { name: "Jeux de Société", clefCategories: "69591afa813cdaee13515621" },
  { name: "Instruments de Musique", clefCategories: "69591afa813cdaee13515621" },

  // ARTISANAT & ART
  { name: "Poterie & Céramique", clefCategories: "69591b29813cdaee13515624" },
  { name: "Vannerie & Osier", clefCategories: "69591b29813cdaee13515624" },
  { name: "Tissage & Textile", clefCategories: "69591b29813cdaee13515624" },
  { name: "Maroquinerie Artisanale", clefCategories: "69591b29813cdaee13515624" },
  { name: "Sculptures", clefCategories: "69591b29813cdaee13515624" },
  { name: "Peintures & Tableaux", clefCategories: "69591b29813cdaee13515624" },
  { name: "Objets Décoratifs", clefCategories: "69591b29813cdaee13515624" },
  { name: "Art Touareg", clefCategories: "69591b29813cdaee13515624" },
  { name: "Masques & Statuettes", clefCategories: "69591b29813cdaee13515624" },
  { name: "Instruments Traditionnels", clefCategories: "69591b29813cdaee13515624" },

  // BIJOUX & ACCESSOIRES
  { name: "Colliers", clefCategories: "69591b51813cdaee13515627" },
  { name: "Bracelets", clefCategories: "69591b51813cdaee13515627" },
  { name: "Boucles d'Oreilles", clefCategories: "69591b51813cdaee13515627" },
  { name: "Bagues", clefCategories: "69591b51813cdaee13515627" },
  { name: "Bijoux en Argent", clefCategories: "69591b51813cdaee13515627" },
  { name: "Bijoux en Or", clefCategories: "69591b51813cdaee13515627" },
  { name: "Bijoux Fantaisie", clefCategories: "69591b51813cdaee13515627" },
  { name: "Bijoux Traditionnels", clefCategories: "69591b51813cdaee13515627" },
  { name: "Lunettes de Soleil", clefCategories: "69591b51813cdaee13515627" },
  { name: "Ceintures & Foulards", clefCategories: "69591b51813cdaee13515627" },

  // ALIMENTATION & BOISSONS
  { name: "Épices & Condiments", clefCategories: "69591b7f813cdaee1351562a" },
  { name: "Céréales & Grains", clefCategories: "69591b7f813cdaee1351562a" },
  { name: "Fruits & Légumes Secs", clefCategories: "69591b7f813cdaee1351562a" },
  { name: "Huiles & Sauces", clefCategories: "69591b7f813cdaee1351562a" },
  { name: "Produits Locaux", clefCategories: "69591b7f813cdaee1351562a" },
  { name: "Boissons Non Alcoolisées", clefCategories: "69591b7f813cdaee1351562a" },
  { name: "Thé & Café", clefCategories: "69591b7f813cdaee1351562a" },
  { name: "Snacks & Confiseries", clefCategories: "69591b7f813cdaee1351562a" },
  { name: "Produits Bio", clefCategories: "69591b7f813cdaee1351562a" },
  { name: "Miel & Produits Naturels", clefCategories: "69591b7f813cdaee1351562a" },

  // LIVRES & MÉDIAS
  { name: "Romans & Littérature", clefCategories: "69591bb6813cdaee1351562d" },
  { name: "Livres Éducatifs", clefCategories: "69591bb6813cdaee1351562d" },
  { name: "Livres Religieux", clefCategories: "69591bb6813cdaee1351562d" },
  { name: "Bandes Dessinées", clefCategories: "69591bb6813cdaee1351562d" },
  { name: "Magazines", clefCategories: "69591bb6813cdaee1351562d" },
  { name: "CD & DVD", clefCategories: "69591bb6813cdaee1351562d" },
  { name: "Jeux Vidéo", clefCategories: "69591bb6813cdaee1351562d" },
  { name: "Consoles de Jeux", clefCategories: "69591bb6813cdaee1351562d" },
  { name: "Films & Séries", clefCategories: "69591bb6813cdaee1351562d" },

  // ENFANTS & BÉBÉS
  { name: "Vêtements Bébé", clefCategories: "69591bfb813cdaee13515630" },
  { name: "Vêtements Enfant", clefCategories: "69591bfb813cdaee13515630" },
  { name: "Jouets 0-3 ans", clefCategories: "69591bfb813cdaee13515630" },
  { name: "Jouets 3-8 ans", clefCategories: "69591bfb813cdaee13515630" },
  { name: "Jouets 8+ ans", clefCategories: "69591bfb813cdaee13515630" },
  { name: "Poussettes & Landaus", clefCategories: "69591bfb813cdaee13515630" },
  { name: "Puériculture", clefCategories: "69591bfb813cdaee13515630" },
  { name: "Sécurité Bébé", clefCategories: "69591bfb813cdaee13515630" },
  { name: "Alimentation Bébé", clefCategories: "69591bfb813cdaee13515630" },
  { name: "Fournitures Scolaires", clefCategories: "69591bfb813cdaee13515630" },

  // AUTOMOBILE & MOTO
  { name: "Pièces Auto", clefCategories: "69591c12813cdaee13515633" },
  { name: "Pièces Moto", clefCategories: "69591c12813cdaee13515633" },
  { name: "Accessoires Auto", clefCategories: "69591c12813cdaee13515633" },
  { name: "Accessoires Moto", clefCategories: "69591c12813cdaee13515633" },
  { name: "Pneus & Jantes", clefCategories: "69591c12813cdaee13515633" },
  { name: "Huiles & Lubrifiants", clefCategories: "69591c12813cdaee13515633" },
  { name: "Électronique Auto", clefCategories: "69591c12813cdaee13515633" },
  { name: "Équipement Sécurité", clefCategories: "69591c12813cdaee13515633" },
  { name: "Nettoyage & Entretien", clefCategories: "69591c12813cdaee13515633" },

  // JARDIN & BRICOLAGE
  { name: "Outils à Main", clefCategories: "69591c49813cdaee13515636" },
  { name: "Outils Électriques", clefCategories: "69591c49813cdaee13515636" },
  { name: "Matériaux Construction", clefCategories: "69591c49813cdaee13515636" },
  { name: "Peinture & Décoration", clefCategories: "69591c49813cdaee13515636" },
  { name: "Plomberie", clefCategories: "69591c49813cdaee13515636" },
  { name: "Électricité", clefCategories: "69591c49813cdaee13515636" },
  { name: "Jardinage", clefCategories: "69591c49813cdaee13515636" },
  { name: "Plantes & Graines", clefCategories: "69591c49813cdaee13515636" },
  { name: "Arrosage", clefCategories: "69591c49813cdaee13515636" },
  { name: "Mobilier Jardin", clefCategories: "69591c49813cdaee13515636" },

  // SERVICES
  { name: "Réparation Électronique", clefCategories: "69591c7a813cdaee13515639" },
  { name: "Services Informatiques", clefCategories: "69591c7a813cdaee13515639" },
  { name: "Photographie", clefCategories: "69591c7a813cdaee13515639" },
  { name: "Événementiel", clefCategories: "69591c7a813cdaee13515639" },
  { name: "Formation & Cours", clefCategories: "69591c7a813cdaee13515639" },
  { name: "Livraison & Transport", clefCategories: "69591c7a813cdaee13515639" },
  { name: "Services à Domicile", clefCategories: "69591c7a813cdaee13515639" },
  { name: "Beauté & Coiffure", clefCategories: "69591c7a813cdaee13515639" },
  { name: "Conseil & Expertise", clefCategories: "69591c7a813cdaee13515639" },
  { name: "Maintenance & Entretien", clefCategories: "69591c7a813cdaee13515639" }
];

// Fonction principale
async function seedTypesProduits() {
  try {
    // Connexion à MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://ihambaobab_db_user:fFTSEYa7y2gZmH4K@ihambaobabcluster.rucr9hc.mongodb.net/?retryWrites=true&w=majority";
    
    console.log('🔄 Connexion à MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connecté à MongoDB');

    // Supprimer les types existants (optionnel - décommentez si besoin)
    // await TypeProduit.deleteMany({});
    // console.log('🗑️  Types de produits existants supprimés');

    // Insérer les nouveaux types
    console.log('🔄 Insertion des types de produits...');
    const result = await TypeProduit.insertMany(typesProduits);
    
    console.log(`\n✅ ${result.length} types de produits créés avec succès!`);
    
    // Afficher un résumé par catégorie
    const summary = {};
    typesProduits.forEach(type => {
      const catName = Object.keys(categoriesMap).find(key => categoriesMap[key] === type.clefCategories);
      if (!summary[catName]) summary[catName] = 0;
      summary[catName]++;
    });
    
    console.log('\n📊 Résumé par catégorie:');
    Object.entries(summary).forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count} types`);
    });

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Connexion fermée');
  }
}

// Exécuter le script
seedTypesProduits();