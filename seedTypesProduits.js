const mongoose = require('mongoose');
require('dotenv').config();

const { TypeProduit, Categorie } = require('./src/Models');

// ─── TOUTES LES CATÉGORIES CIBLES ────────────────────────────────────────────
// Le script créera celles qui n'existent pas encore (par nom exact).
// Les anciennes (électroniques, beauté, homme...) sont conservées telles quelles.
const categoriesCibles = [
  { name: "Mode & Vêtements",               image: "https://placehold.co/400x300?text=Mode" },
  { name: "Textile & Tissus",               image: "https://placehold.co/400x300?text=Textile" },
  { name: "Téléphones & Tablettes",         image: "https://placehold.co/400x300?text=Telephones" },
  { name: "Électronique & Informatique",    image: "https://placehold.co/400x300?text=Electronique" },
  { name: "Électroménager",                 image: "https://placehold.co/400x300?text=Electromenager" },
  { name: "Maison & Décoration",            image: "https://placehold.co/400x300?text=Maison" },
  { name: "Beauté & Santé",                 image: "https://placehold.co/400x300?text=Beaute" },
  { name: "Alimentation & Boissons",        image: "https://placehold.co/400x300?text=Alimentation" },
  { name: "Agriculture & Élevage",          image: "https://placehold.co/400x300?text=Agriculture" },
  { name: "Construction & Matériaux",       image: "https://placehold.co/400x300?text=Construction" },
  { name: "Énergie & Solaire",              image: "https://placehold.co/400x300?text=Energie" },
  { name: "Sports & Loisirs",               image: "https://placehold.co/400x300?text=Sports" },
  { name: "Artisanat & Art",                image: "https://placehold.co/400x300?text=Artisanat" },
  { name: "Bijoux & Accessoires",           image: "https://placehold.co/400x300?text=Bijoux" },
  { name: "Livres & Médias",                image: "https://placehold.co/400x300?text=Livres" },
  { name: "Enfants & Bébés",                image: "https://placehold.co/400x300?text=Enfants" },
  { name: "Fournitures Scolaires & Bureau", image: "https://placehold.co/400x300?text=Fournitures" },
  { name: "Automobile & Moto",              image: "https://placehold.co/400x300?text=Auto" },
  { name: "Jardin & Bricolage",             image: "https://placehold.co/400x300?text=Jardin" },
  { name: "Services",                       image: "https://placehold.co/400x300?text=Services" },
  { name: "Occasion & Reconditionné",       image: "https://placehold.co/400x300?text=Occasion" },
];

// ─── TYPES PAR NOM DE CATÉGORIE ───────────────────────────────────────────────
const typesParCategorie = {

  "Mode & Vêtements": [
    "Vêtements Homme", "Vêtements Femme", "Vêtements Enfant",
    "Boubou Homme", "Boubou Femme", "Gandoura & Caftan",
    "Tenue Traditionnelle", "Tenue de Mariage", "Voile & Hijab",
    "Pagnes Confectionnés", "Bazin Confectionné",
    "Chaussures Homme", "Chaussures Femme", "Chaussures Enfant",
    "Sandales & Babouches", "Sacs & Bagages", "Sous-vêtements",
    "Montres", "Uniformes & Blouses", "Autre Mode & Vêtements",
  ],

  "Textile & Tissus": [
    "Bazin Riche", "Bazin Simple", "Wax & Ankara", "Pagne Traditionnel",
    "Voile & Mousseline", "Dentelle", "Tissu Coton", "Tissu Synthétique",
    "Fil à Coudre & Broderie", "Doublure & Entoilage",
    "Tissu Traditionnel Touareg", "Autre Textile & Tissus",
  ],

  "Téléphones & Tablettes": [
    "Smartphones Android", "iPhones", "Téléphones Basiques", "Tablettes",
    "Montres Connectées", "Accessoires Téléphones", "Coques & Protections",
    "Chargeurs & Batteries", "Écouteurs & Casques", "Cartes SIM & Recharge",
    "Pièces de Rechange Tél.", "Autre Téléphones & Tablettes",
  ],

  "Électronique & Informatique": [
    "Ordinateurs Portables", "Ordinateurs de Bureau", "Composants PC",
    "Périphériques", "Réseaux & Wifi", "Stockage & Mémoire",
    "Imprimantes & Scanners", "Logiciels", "Câbles & Adaptateurs",
    "Accessoires Informatique", "Caméras & Vidéo", "Drones",
    "Autre Électronique",
  ],

  "Électroménager": [
    "Réfrigérateurs & Congélateurs", "Cuisinières & Fours", "Machines à Laver",
    "Climatiseurs & Ventilateurs", "Micro-ondes", "Petits Électroménagers",
    "Aspirateurs", "Fers à Repasser", "Bouilloires & Cafetières",
    "Mixeurs & Blenders", "Pompes à Eau", "Groupes Électrogènes",
    "Autre Électroménager",
  ],

  "Maison & Décoration": [
    "Meubles Salon", "Meubles Chambre", "Meubles Cuisine", "Meubles Bureau",
    "Décoration Murale", "Textiles Maison", "Éclairage", "Tapis & Rideaux",
    "Nattes & Tapis Traditionnels", "Vaisselle & Couverts",
    "Ustensiles de Cuisine", "Rangement & Organisation",
    "Coussins & Oreillers", "Cadres & Miroirs", "Autre Maison & Décoration",
  ],

  "Beauté & Santé": [
    "Parfums Homme", "Parfums Femme", "Maquillage", "Soins Visage",
    "Soins Corps", "Soins Cheveux", "Henné & Teintures",
    "Huile de Karité & Argan", "Savon Artisanal", "Produits Naturels",
    "Hygiène", "Compléments Alimentaires", "Pharmacopée Traditionnelle",
    "Matériel Médical", "Autre Beauté & Santé",
  ],

  "Alimentation & Boissons": [
    "Épices & Condiments", "Céréales & Grains", "Mil, Sorgho & Fonio",
    "Fruits & Légumes Secs", "Dattes & Fruits Secs", "Huiles & Sauces",
    "Lait & Produits Laitiers", "Viande & Poisson Séché", "Produits Locaux",
    "Farine & Préparations", "Boissons Non Alcoolisées", "Thé & Café",
    "Snacks & Confiseries", "Miel & Produits Naturels", "Produits Bio",
    "Autre Alimentation",
  ],

  "Agriculture & Élevage": [
    "Semences & Plants", "Engrais & Intrants", "Pesticides & Herbicides",
    "Outils Agricoles Manuels", "Équipement Irrigation",
    "Produits Vétérinaires", "Aliments Animaux", "Volaille", "Petit Bétail",
    "Produits de la Ferme", "Produits de la Pêche", "Génie Rural",
    "Autre Agriculture & Élevage",
  ],

  "Construction & Matériaux": [
    "Ciment & Béton", "Fer & Métaux", "Carrelage & Revêtements",
    "Peinture & Enduits", "Bois & Menuiserie", "Plomberie & Sanitaire",
    "Toiture & Étanchéité", "Portes & Fenêtres", "Briques & Agglomérés",
    "Équipement Chantier", "Quincaillerie", "Autre Construction",
  ],

  "Énergie & Solaire": [
    "Panneaux Solaires", "Batteries & Stockage", "Onduleurs & Convertisseurs",
    "Groupes Électrogènes", "Éclairage Solaire", "Pompes Solaires",
    "Chauffe-eau Solaire", "Câbles & Installations", "Régulateurs de Charge",
    "Climatisation Solaire", "Autre Énergie & Solaire",
  ],

  "Sports & Loisirs": [
    "Équipement Fitness", "Football", "Basketball", "Running & Athlétisme",
    "Sports de Combat", "Vélos & Trottinettes", "Camping & Randonnée",
    "Natation", "Pêche & Chasse", "Jeux Traditionnels", "Jeux de Société",
    "Instruments de Musique", "Autre Sports & Loisirs",
  ],

  "Artisanat & Art": [
    "Poterie & Céramique", "Vannerie & Osier", "Tissage & Textile",
    "Maroquinerie Artisanale", "Sculptures", "Peintures & Tableaux",
    "Objets Décoratifs", "Art Touareg", "Art Peul & Haoussa",
    "Masques & Statuettes", "Broderie & Couture", "Teinture Artisanale",
    "Calebasses Décoratives", "Instruments Traditionnels",
    "Autre Artisanat & Art",
  ],

  "Bijoux & Accessoires": [
    "Colliers", "Bracelets", "Boucles d'Oreilles", "Bagues",
    "Bijoux en Argent", "Bijoux en Or", "Bijoux Fantaisie",
    "Bijoux Touareg", "Bijoux Peul", "Perles & Cauris",
    "Bijoux Traditionnels", "Lunettes de Soleil", "Ceintures & Foulards",
    "Chapeaux & Couvre-chefs", "Autre Bijoux & Accessoires",
  ],

  "Livres & Médias": [
    "Romans & Littérature", "Livres Éducatifs", "Livres Religieux",
    "Livres en Haoussa", "Bandes Dessinées", "Magazines & Journaux",
    "CD & DVD", "Jeux Vidéo", "Consoles de Jeux", "Films & Séries",
    "Autre Livres & Médias",
  ],

  "Enfants & Bébés": [
    "Vêtements Bébé", "Vêtements Enfant", "Jouets 0-3 ans",
    "Jouets 3-8 ans", "Jouets 8+ ans", "Jouets Éducatifs",
    "Poussettes & Landaus", "Puériculture", "Couches & Hygiène Bébé",
    "Alimentation Bébé", "Sécurité Bébé", "Autre Enfants & Bébés",
  ],

  "Fournitures Scolaires & Bureau": [
    "Cahiers & Carnets", "Stylos & Crayons", "Classeurs & Reliures",
    "Calculatrices", "Matériel Artistique", "Sacs École & Cartables",
    "Mobilier Scolaire", "Tableau & Craie", "Imprimés & Formulaires",
    "Équipement Bureau", "Autre Fournitures",
  ],

  "Automobile & Moto": [
    "Pièces Auto", "Pièces Moto", "Pièces Tricycle",
    "Accessoires Auto", "Accessoires Moto", "Pneus & Jantes",
    "Huiles & Lubrifiants", "Batteries Auto & Moto", "Électronique Auto",
    "Équipement Sécurité", "Nettoyage & Entretien", "Motos & Tricycles",
    "Autre Automobile & Moto",
  ],

  "Jardin & Bricolage": [
    "Outils à Main", "Outils Électriques", "Matériaux Construction",
    "Peinture & Décoration", "Plomberie", "Électricité",
    "Serrures & Sécurité", "Jardinage", "Plantes & Graines",
    "Arrosage", "Mobilier Jardin", "Autre Jardin & Bricolage",
  ],

  "Services": [
    "Réparation Électronique", "Services Informatiques", "Couture & Retouche",
    "Photographie & Vidéo", "Événementiel & Traiteur", "Formation & Cours",
    "Livraison & Transport", "Services à Domicile", "Beauté & Coiffure",
    "Conseil & Expertise", "Maintenance & Entretien",
    "Sécurité & Gardiennage", "Impression & Gravure", "Location",
    "Autre Services",
  ],

  "Occasion & Reconditionné": [
    "Téléphones d'Occasion", "Électronique d'Occasion",
    "Vêtements d'Occasion", "Meubles d'Occasion",
    "Électroménager d'Occasion", "Voitures d'Occasion",
    "Motos d'Occasion", "Livres d'Occasion", "Matériel Pro d'Occasion",
    "Divers Occasion", "Autre Occasion",
  ],
};

// ─── Script principal ─────────────────────────────────────────────────────────
async function seed() {
  const MONGODB_URI = process.env.MONGODB_URI
    || "mongodb+srv://abdoulrazak9323:qrru0xfJGmJG0TSc@cluster0.mvrgous.mongodb.net/?retryWrites=true&w=majority";

  console.log('🔄 Connexion à MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connecté\n');

  // ── 1. Créer les catégories manquantes (upsert par nom) ────────────────────
  console.log('🔄 Création des catégories manquantes...');
  let catCrees = 0;
  for (const cat of categoriesCibles) {
    const existing = await Categorie.findOne({ name: cat.name }).lean();
    if (!existing) {
      await Categorie.create(cat);
      console.log(`   ✅ Créée : ${cat.name}`);
      catCrees++;
    }
  }
  console.log(catCrees > 0 ? `   → ${catCrees} créée(s)` : '   → toutes déjà présentes');

  // ── 2. Recharger le map complet name → _id ─────────────────────────────────
  const toutesCategories = await Categorie.find({}, { name: 1, _id: 1 }).lean();
  const catMap = {};
  toutesCategories.forEach(c => { catMap[c.name] = c._id.toString(); });
  console.log(`\n   ${toutesCategories.length} catégories au total en base`);

  // Vérification de sécurité
  const manquantes = Object.keys(typesParCategorie).filter(n => !catMap[n]);
  if (manquantes.length > 0) {
    console.error('\n❌ Impossible de résoudre ces catégories :', manquantes);
    process.exit(1);
  }

  // ── 3. Upsert des types ────────────────────────────────────────────────────
  console.log('\n🔄 Upsert des types de produits...');
  let crees = 0, existants = 0;

  for (const [catName, types] of Object.entries(typesParCategorie)) {
    const clefCategories = catMap[catName];
    for (const typeName of types) {
      const r = await TypeProduit.updateOne(
        { name: typeName, clefCategories },
        { $setOnInsert: { name: typeName, clefCategories } },
        { upsert: true }
      );
      if (r.upsertedCount > 0) crees++;
      else existants++;
    }
  }

  // ── 4. Résumé ──────────────────────────────────────────────────────────────
  const total = Object.values(typesParCategorie).reduce((s, a) => s + a.length, 0);
  console.log(`\n✅ Résultat :`);
  console.log(`   ${crees} type(s) créé(s)`);
  console.log(`   ${existants} type(s) déjà en base (ignorés)`);
  console.log(`\n📊 Types par catégorie :`);
  Object.entries(typesParCategorie)
    .sort(([a], [b]) => a.localeCompare(b, 'fr'))
    .forEach(([cat, types]) => console.log(`   ${cat} : ${types.length}`));
  console.log(`\n   TOTAL : ${total} types définis`);
}

seed()
  .catch(err => console.error('❌ Erreur fatale :', err.message))
  .finally(() => mongoose.connection.close().then(() => console.log('\n🔌 Connexion fermée')));
