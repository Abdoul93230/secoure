const mongoose = require('mongoose');
require('dotenv').config();

const { TypeProduit, Categorie } = require('./src/Models');

// ─── IDs CATÉGORIES EXISTANTES (ne pas changer — produits en base y font référence) ──
const CAT = {
  All:              "695918b1813cdaee135155f5",
  Mode:             "69591a65813cdaee13515615",
  Electronique:     "69591a87813cdaee13515618",
  Maison:           "69591aaf813cdaee1351561b",
  Beaute:           "69591ad0813cdaee1351561e",
  Sports:           "69591afa813cdaee13515621",
  Artisanat:        "69591b29813cdaee13515624",
  Bijoux:           "69591b51813cdaee13515627",
  Alimentation:     "69591b7f813cdaee1351562a",
  Livres:           "69591bb6813cdaee1351562d",
  Enfants:          "69591bfb813cdaee13515630",
  Automobile:       "69591c12813cdaee13515633",
  Jardin:           "69591c49813cdaee13515636",
  Services:         "69591c7a813cdaee13515639",
  Telephones:       "69591c9c813cdaee1351563c",
  Electromenager:   "69591cc3813cdaee1351563f",
  // ─── NOUVELLES CATÉGORIES ───────────────────────────────────────────────────
  Textile:          "676a1c00813cdaee13515641",
  Agriculture:      "676a1c00813cdaee13515642",
  Construction:     "676a1c00813cdaee13515643",
  Energie:          "676a1c00813cdaee13515644",
  Fournitures:      "676a1c00813cdaee13515645",
  Occasion:         "676a1c00813cdaee13515646",
};

// ─── NOUVELLES CATÉGORIES À CRÉER EN BASE ───────────────────────────────────
// Les 16 existantes sont déjà en base. On insère uniquement les nouvelles.
const nouvellesCategories = [
  {
    _id: new mongoose.Types.ObjectId("676a1c00813cdaee13515641"),
    name: "Textile & Tissus",
    image: "https://res.cloudinary.com/placeholder/textile.jpg",
  },
  {
    _id: new mongoose.Types.ObjectId("676a1c00813cdaee13515642"),
    name: "Agriculture & Élevage",
    image: "https://res.cloudinary.com/placeholder/agriculture.jpg",
  },
  {
    _id: new mongoose.Types.ObjectId("676a1c00813cdaee13515643"),
    name: "Construction & Matériaux",
    image: "https://res.cloudinary.com/placeholder/construction.jpg",
  },
  {
    _id: new mongoose.Types.ObjectId("676a1c00813cdaee13515644"),
    name: "Énergie & Solaire",
    image: "https://res.cloudinary.com/placeholder/energie.jpg",
  },
  {
    _id: new mongoose.Types.ObjectId("676a1c00813cdaee13515645"),
    name: "Fournitures Scolaires & Bureau",
    image: "https://res.cloudinary.com/placeholder/fournitures.jpg",
  },
  {
    _id: new mongoose.Types.ObjectId("676a1c00813cdaee13515646"),
    name: "Occasion & Reconditionné",
    image: "https://res.cloudinary.com/placeholder/occasion.jpg",
  },
];

// ─── TOUS LES TYPES (existants enrichis + nouveaux) ─────────────────────────
// Note: le script utilise un upsert — relancer ne crée pas de doublons.
// Chaque catégorie se termine par "Autre [Catégorie]" pour ne jamais bloquer un seller.

const typesProduits = [

  // ════════════════════════════════════════
  // MODE & VÊTEMENTS
  // ════════════════════════════════════════
  { name: "Vêtements Homme",            clefCategories: CAT.Mode },
  { name: "Vêtements Femme",            clefCategories: CAT.Mode },
  { name: "Vêtements Enfant",           clefCategories: CAT.Mode },
  { name: "Boubou Homme",               clefCategories: CAT.Mode },
  { name: "Boubou Femme",               clefCategories: CAT.Mode },
  { name: "Gandoura & Caftan",          clefCategories: CAT.Mode },
  { name: "Tenue Traditionnelle",       clefCategories: CAT.Mode },
  { name: "Tenue de Mariage",           clefCategories: CAT.Mode },
  { name: "Voile & Hijab",              clefCategories: CAT.Mode },
  { name: "Pagnes Confectionnés",       clefCategories: CAT.Mode },
  { name: "Bazin Confectionné",         clefCategories: CAT.Mode },
  { name: "Chaussures Homme",           clefCategories: CAT.Mode },
  { name: "Chaussures Femme",           clefCategories: CAT.Mode },
  { name: "Chaussures Enfant",          clefCategories: CAT.Mode },
  { name: "Sandales & Babouches",       clefCategories: CAT.Mode },
  { name: "Sacs & Bagages",             clefCategories: CAT.Mode },
  { name: "Sous-vêtements",             clefCategories: CAT.Mode },
  { name: "Montres",                    clefCategories: CAT.Mode },
  { name: "Uniformes & Blouses",        clefCategories: CAT.Mode },
  { name: "Autre Mode & Vêtements",     clefCategories: CAT.Mode },

  // ════════════════════════════════════════
  // TEXTILE & TISSUS (nouvelle catégorie)
  // ════════════════════════════════════════
  { name: "Bazin Riche",                clefCategories: CAT.Textile },
  { name: "Bazin Simple",               clefCategories: CAT.Textile },
  { name: "Wax & Ankara",               clefCategories: CAT.Textile },
  { name: "Pagne Traditionnel",         clefCategories: CAT.Textile },
  { name: "Voile & Mousseline",         clefCategories: CAT.Textile },
  { name: "Dentelle",                   clefCategories: CAT.Textile },
  { name: "Tissu Coton",                clefCategories: CAT.Textile },
  { name: "Tissu Synthétique",          clefCategories: CAT.Textile },
  { name: "Fil à Coudre & Broderie",    clefCategories: CAT.Textile },
  { name: "Doublure & Entoilage",       clefCategories: CAT.Textile },
  { name: "Tissu Traditionnel Touareg", clefCategories: CAT.Textile },
  { name: "Autre Textile & Tissus",     clefCategories: CAT.Textile },

  // ════════════════════════════════════════
  // TÉLÉPHONES & TABLETTES
  // ════════════════════════════════════════
  { name: "Smartphones Android",        clefCategories: CAT.Telephones },
  { name: "iPhones",                    clefCategories: CAT.Telephones },
  { name: "Téléphones Basiques",        clefCategories: CAT.Telephones },
  { name: "Tablettes",                  clefCategories: CAT.Telephones },
  { name: "Montres Connectées",         clefCategories: CAT.Telephones },
  { name: "Accessoires Téléphones",     clefCategories: CAT.Telephones },
  { name: "Coques & Protections",       clefCategories: CAT.Telephones },
  { name: "Chargeurs & Batteries",      clefCategories: CAT.Telephones },
  { name: "Écouteurs & Casques",        clefCategories: CAT.Telephones },
  { name: "Cartes SIM & Recharge",      clefCategories: CAT.Telephones },
  { name: "Pièces de Rechange Tél.",    clefCategories: CAT.Telephones },
  { name: "Autre Téléphones & Tablettes", clefCategories: CAT.Telephones },

  // ════════════════════════════════════════
  // ÉLECTRONIQUE & INFORMATIQUE
  // ════════════════════════════════════════
  { name: "Ordinateurs Portables",      clefCategories: CAT.Electronique },
  { name: "Ordinateurs de Bureau",      clefCategories: CAT.Electronique },
  { name: "Composants PC",              clefCategories: CAT.Electronique },
  { name: "Périphériques",              clefCategories: CAT.Electronique },
  { name: "Réseaux & Wifi",             clefCategories: CAT.Electronique },
  { name: "Stockage & Mémoire",         clefCategories: CAT.Electronique },
  { name: "Imprimantes & Scanners",     clefCategories: CAT.Electronique },
  { name: "Logiciels",                  clefCategories: CAT.Electronique },
  { name: "Câbles & Adaptateurs",       clefCategories: CAT.Electronique },
  { name: "Accessoires Informatique",   clefCategories: CAT.Electronique },
  { name: "Caméras & Vidéo",            clefCategories: CAT.Electronique },
  { name: "Drones",                     clefCategories: CAT.Electronique },
  { name: "Autre Électronique",         clefCategories: CAT.Electronique },

  // ════════════════════════════════════════
  // ÉLECTROMÉNAGER
  // ════════════════════════════════════════
  { name: "Réfrigérateurs & Congélateurs", clefCategories: CAT.Electromenager },
  { name: "Cuisinières & Fours",        clefCategories: CAT.Electromenager },
  { name: "Machines à Laver",           clefCategories: CAT.Electromenager },
  { name: "Climatiseurs & Ventilateurs", clefCategories: CAT.Electromenager },
  { name: "Micro-ondes",                clefCategories: CAT.Electromenager },
  { name: "Petits Électroménagers",     clefCategories: CAT.Electromenager },
  { name: "Aspirateurs",                clefCategories: CAT.Electromenager },
  { name: "Fers à Repasser",            clefCategories: CAT.Electromenager },
  { name: "Bouilloires & Cafetières",   clefCategories: CAT.Electromenager },
  { name: "Mixeurs & Blenders",         clefCategories: CAT.Electromenager },
  { name: "Pompes à Eau",               clefCategories: CAT.Electromenager },
  { name: "Groupes Électrogènes",       clefCategories: CAT.Electromenager },
  { name: "Autre Électroménager",       clefCategories: CAT.Electromenager },

  // ════════════════════════════════════════
  // MAISON & DÉCORATION
  // ════════════════════════════════════════
  { name: "Meubles Salon",              clefCategories: CAT.Maison },
  { name: "Meubles Chambre",            clefCategories: CAT.Maison },
  { name: "Meubles Cuisine",            clefCategories: CAT.Maison },
  { name: "Meubles Bureau",             clefCategories: CAT.Maison },
  { name: "Décoration Murale",          clefCategories: CAT.Maison },
  { name: "Textiles Maison",            clefCategories: CAT.Maison },
  { name: "Éclairage",                  clefCategories: CAT.Maison },
  { name: "Tapis & Rideaux",            clefCategories: CAT.Maison },
  { name: "Nattes & Tapis Traditionnels", clefCategories: CAT.Maison },
  { name: "Vaisselle & Couverts",       clefCategories: CAT.Maison },
  { name: "Ustensiles de Cuisine",      clefCategories: CAT.Maison },
  { name: "Rangement & Organisation",   clefCategories: CAT.Maison },
  { name: "Coussins & Oreillers",       clefCategories: CAT.Maison },
  { name: "Cadres & Miroirs",           clefCategories: CAT.Maison },
  { name: "Autre Maison & Décoration",  clefCategories: CAT.Maison },

  // ════════════════════════════════════════
  // BEAUTÉ & SANTÉ
  // ════════════════════════════════════════
  { name: "Parfums Homme",              clefCategories: CAT.Beaute },
  { name: "Parfums Femme",              clefCategories: CAT.Beaute },
  { name: "Maquillage",                 clefCategories: CAT.Beaute },
  { name: "Soins Visage",               clefCategories: CAT.Beaute },
  { name: "Soins Corps",                clefCategories: CAT.Beaute },
  { name: "Soins Cheveux",              clefCategories: CAT.Beaute },
  { name: "Henné & Teintures",          clefCategories: CAT.Beaute },
  { name: "Huile de Karité & Argan",    clefCategories: CAT.Beaute },
  { name: "Savon Artisanal",            clefCategories: CAT.Beaute },
  { name: "Produits Naturels",          clefCategories: CAT.Beaute },
  { name: "Hygiène",                    clefCategories: CAT.Beaute },
  { name: "Compléments Alimentaires",   clefCategories: CAT.Beaute },
  { name: "Pharmacopée Traditionnelle", clefCategories: CAT.Beaute },
  { name: "Matériel Médical",           clefCategories: CAT.Beaute },
  { name: "Autre Beauté & Santé",       clefCategories: CAT.Beaute },

  // ════════════════════════════════════════
  // ALIMENTATION & BOISSONS
  // ════════════════════════════════════════
  { name: "Épices & Condiments",        clefCategories: CAT.Alimentation },
  { name: "Céréales & Grains",          clefCategories: CAT.Alimentation },
  { name: "Mil, Sorgho & Fonio",        clefCategories: CAT.Alimentation },
  { name: "Fruits & Légumes Secs",      clefCategories: CAT.Alimentation },
  { name: "Dattes & Fruits Secs",       clefCategories: CAT.Alimentation },
  { name: "Huiles & Sauces",            clefCategories: CAT.Alimentation },
  { name: "Lait & Produits Laitiers",   clefCategories: CAT.Alimentation },
  { name: "Viande & Poisson Séché",     clefCategories: CAT.Alimentation },
  { name: "Produits Locaux",            clefCategories: CAT.Alimentation },
  { name: "Farine & Préparations",      clefCategories: CAT.Alimentation },
  { name: "Boissons Non Alcoolisées",   clefCategories: CAT.Alimentation },
  { name: "Thé & Café",                 clefCategories: CAT.Alimentation },
  { name: "Snacks & Confiseries",       clefCategories: CAT.Alimentation },
  { name: "Miel & Produits Naturels",   clefCategories: CAT.Alimentation },
  { name: "Produits Bio",               clefCategories: CAT.Alimentation },
  { name: "Autre Alimentation",         clefCategories: CAT.Alimentation },

  // ════════════════════════════════════════
  // AGRICULTURE & ÉLEVAGE (nouvelle catégorie)
  // ════════════════════════════════════════
  { name: "Semences & Plants",          clefCategories: CAT.Agriculture },
  { name: "Engrais & Intrants",         clefCategories: CAT.Agriculture },
  { name: "Pesticides & Herbicides",    clefCategories: CAT.Agriculture },
  { name: "Outils Agricoles Manuels",   clefCategories: CAT.Agriculture },
  { name: "Équipement Irrigation",      clefCategories: CAT.Agriculture },
  { name: "Produits Vétérinaires",      clefCategories: CAT.Agriculture },
  { name: "Aliments Animaux",           clefCategories: CAT.Agriculture },
  { name: "Volaille",                   clefCategories: CAT.Agriculture },
  { name: "Petit Bétail",               clefCategories: CAT.Agriculture },
  { name: "Produits de la Ferme",       clefCategories: CAT.Agriculture },
  { name: "Produits de la Pêche",       clefCategories: CAT.Agriculture },
  { name: "Génie Rural",                clefCategories: CAT.Agriculture },
  { name: "Autre Agriculture & Élevage", clefCategories: CAT.Agriculture },

  // ════════════════════════════════════════
  // CONSTRUCTION & MATÉRIAUX (nouvelle catégorie)
  // ════════════════════════════════════════
  { name: "Ciment & Béton",             clefCategories: CAT.Construction },
  { name: "Fer & Métaux",               clefCategories: CAT.Construction },
  { name: "Carrelage & Revêtements",    clefCategories: CAT.Construction },
  { name: "Peinture & Enduits",         clefCategories: CAT.Construction },
  { name: "Bois & Menuiserie",          clefCategories: CAT.Construction },
  { name: "Plomberie & Sanitaire",      clefCategories: CAT.Construction },
  { name: "Toiture & Étanchéité",       clefCategories: CAT.Construction },
  { name: "Portes & Fenêtres",          clefCategories: CAT.Construction },
  { name: "Briques & Agglomérés",       clefCategories: CAT.Construction },
  { name: "Équipement Chantier",        clefCategories: CAT.Construction },
  { name: "Quincaillerie",              clefCategories: CAT.Construction },
  { name: "Autre Construction",         clefCategories: CAT.Construction },

  // ════════════════════════════════════════
  // ÉNERGIE & SOLAIRE (nouvelle catégorie)
  // ════════════════════════════════════════
  { name: "Panneaux Solaires",          clefCategories: CAT.Energie },
  { name: "Batteries & Stockage",       clefCategories: CAT.Energie },
  { name: "Onduleurs & Convertisseurs", clefCategories: CAT.Energie },
  { name: "Groupes Électrogènes",       clefCategories: CAT.Energie },
  { name: "Éclairage Solaire",          clefCategories: CAT.Energie },
  { name: "Pompes Solaires",            clefCategories: CAT.Energie },
  { name: "Chauffe-eau Solaire",        clefCategories: CAT.Energie },
  { name: "Câbles & Installations",     clefCategories: CAT.Energie },
  { name: "Régulateurs de Charge",      clefCategories: CAT.Energie },
  { name: "Climatisation Solaire",      clefCategories: CAT.Energie },
  { name: "Autre Énergie & Solaire",    clefCategories: CAT.Energie },

  // ════════════════════════════════════════
  // SPORTS & LOISIRS
  // ════════════════════════════════════════
  { name: "Équipement Fitness",         clefCategories: CAT.Sports },
  { name: "Football",                   clefCategories: CAT.Sports },
  { name: "Basketball",                 clefCategories: CAT.Sports },
  { name: "Running & Athlétisme",       clefCategories: CAT.Sports },
  { name: "Sports de Combat",           clefCategories: CAT.Sports },
  { name: "Vélos & Trottinettes",       clefCategories: CAT.Sports },
  { name: "Camping & Randonnée",        clefCategories: CAT.Sports },
  { name: "Natation",                   clefCategories: CAT.Sports },
  { name: "Pêche & Chasse",             clefCategories: CAT.Sports },
  { name: "Jeux Traditionnels",         clefCategories: CAT.Sports },
  { name: "Jeux de Société",            clefCategories: CAT.Sports },
  { name: "Instruments de Musique",     clefCategories: CAT.Sports },
  { name: "Autre Sports & Loisirs",     clefCategories: CAT.Sports },

  // ════════════════════════════════════════
  // ARTISANAT & ART
  // ════════════════════════════════════════
  { name: "Poterie & Céramique",        clefCategories: CAT.Artisanat },
  { name: "Vannerie & Osier",           clefCategories: CAT.Artisanat },
  { name: "Tissage & Textile",          clefCategories: CAT.Artisanat },
  { name: "Maroquinerie Artisanale",    clefCategories: CAT.Artisanat },
  { name: "Sculptures",                 clefCategories: CAT.Artisanat },
  { name: "Peintures & Tableaux",       clefCategories: CAT.Artisanat },
  { name: "Objets Décoratifs",          clefCategories: CAT.Artisanat },
  { name: "Art Touareg",                clefCategories: CAT.Artisanat },
  { name: "Art Peul & Haoussa",         clefCategories: CAT.Artisanat },
  { name: "Masques & Statuettes",       clefCategories: CAT.Artisanat },
  { name: "Broderie & Couture",         clefCategories: CAT.Artisanat },
  { name: "Teinture Artisanale",        clefCategories: CAT.Artisanat },
  { name: "Calebasses Décoratives",     clefCategories: CAT.Artisanat },
  { name: "Instruments Traditionnels",  clefCategories: CAT.Artisanat },
  { name: "Autre Artisanat & Art",      clefCategories: CAT.Artisanat },

  // ════════════════════════════════════════
  // BIJOUX & ACCESSOIRES
  // ════════════════════════════════════════
  { name: "Colliers",                   clefCategories: CAT.Bijoux },
  { name: "Bracelets",                  clefCategories: CAT.Bijoux },
  { name: "Boucles d'Oreilles",         clefCategories: CAT.Bijoux },
  { name: "Bagues",                     clefCategories: CAT.Bijoux },
  { name: "Bijoux en Argent",           clefCategories: CAT.Bijoux },
  { name: "Bijoux en Or",               clefCategories: CAT.Bijoux },
  { name: "Bijoux Fantaisie",           clefCategories: CAT.Bijoux },
  { name: "Bijoux Touareg",             clefCategories: CAT.Bijoux },
  { name: "Bijoux Peul",                clefCategories: CAT.Bijoux },
  { name: "Perles & Cauris",            clefCategories: CAT.Bijoux },
  { name: "Bijoux Traditionnels",       clefCategories: CAT.Bijoux },
  { name: "Lunettes de Soleil",         clefCategories: CAT.Bijoux },
  { name: "Ceintures & Foulards",       clefCategories: CAT.Bijoux },
  { name: "Chapeaux & Couvre-chefs",    clefCategories: CAT.Bijoux },
  { name: "Autre Bijoux & Accessoires", clefCategories: CAT.Bijoux },

  // ════════════════════════════════════════
  // LIVRES & MÉDIAS
  // ════════════════════════════════════════
  { name: "Romans & Littérature",       clefCategories: CAT.Livres },
  { name: "Livres Éducatifs",           clefCategories: CAT.Livres },
  { name: "Livres Religieux",           clefCategories: CAT.Livres },
  { name: "Livres en Haoussa",          clefCategories: CAT.Livres },
  { name: "Bandes Dessinées",           clefCategories: CAT.Livres },
  { name: "Magazines & Journaux",       clefCategories: CAT.Livres },
  { name: "CD & DVD",                   clefCategories: CAT.Livres },
  { name: "Jeux Vidéo",                 clefCategories: CAT.Livres },
  { name: "Consoles de Jeux",           clefCategories: CAT.Livres },
  { name: "Films & Séries",             clefCategories: CAT.Livres },
  { name: "Autre Livres & Médias",      clefCategories: CAT.Livres },

  // ════════════════════════════════════════
  // ENFANTS & BÉBÉS
  // ════════════════════════════════════════
  { name: "Vêtements Bébé",             clefCategories: CAT.Enfants },
  { name: "Vêtements Enfant",           clefCategories: CAT.Enfants },
  { name: "Jouets 0-3 ans",             clefCategories: CAT.Enfants },
  { name: "Jouets 3-8 ans",             clefCategories: CAT.Enfants },
  { name: "Jouets 8+ ans",              clefCategories: CAT.Enfants },
  { name: "Jouets Éducatifs",           clefCategories: CAT.Enfants },
  { name: "Poussettes & Landaus",       clefCategories: CAT.Enfants },
  { name: "Puériculture",               clefCategories: CAT.Enfants },
  { name: "Couches & Hygiène Bébé",     clefCategories: CAT.Enfants },
  { name: "Alimentation Bébé",          clefCategories: CAT.Enfants },
  { name: "Sécurité Bébé",              clefCategories: CAT.Enfants },
  { name: "Autre Enfants & Bébés",      clefCategories: CAT.Enfants },

  // ════════════════════════════════════════
  // FOURNITURES SCOLAIRES & BUREAU (nouvelle catégorie)
  // ════════════════════════════════════════
  { name: "Cahiers & Carnets",          clefCategories: CAT.Fournitures },
  { name: "Stylos & Crayons",           clefCategories: CAT.Fournitures },
  { name: "Classeurs & Reliures",       clefCategories: CAT.Fournitures },
  { name: "Calculatrices",              clefCategories: CAT.Fournitures },
  { name: "Matériel Artistique",        clefCategories: CAT.Fournitures },
  { name: "Sacs École & Cartables",     clefCategories: CAT.Fournitures },
  { name: "Mobilier Scolaire",          clefCategories: CAT.Fournitures },
  { name: "Tableau & Craie",            clefCategories: CAT.Fournitures },
  { name: "Imprimés & Formulaires",     clefCategories: CAT.Fournitures },
  { name: "Équipement Bureau",          clefCategories: CAT.Fournitures },
  { name: "Autre Fournitures",          clefCategories: CAT.Fournitures },

  // ════════════════════════════════════════
  // AUTOMOBILE & MOTO
  // ════════════════════════════════════════
  { name: "Pièces Auto",                clefCategories: CAT.Automobile },
  { name: "Pièces Moto",                clefCategories: CAT.Automobile },
  { name: "Pièces Tricycle",            clefCategories: CAT.Automobile },
  { name: "Accessoires Auto",           clefCategories: CAT.Automobile },
  { name: "Accessoires Moto",           clefCategories: CAT.Automobile },
  { name: "Pneus & Jantes",             clefCategories: CAT.Automobile },
  { name: "Huiles & Lubrifiants",       clefCategories: CAT.Automobile },
  { name: "Batteries Auto & Moto",      clefCategories: CAT.Automobile },
  { name: "Électronique Auto",          clefCategories: CAT.Automobile },
  { name: "Équipement Sécurité",        clefCategories: CAT.Automobile },
  { name: "Nettoyage & Entretien",      clefCategories: CAT.Automobile },
  { name: "Motos & Tricycles",          clefCategories: CAT.Automobile },
  { name: "Autre Automobile & Moto",    clefCategories: CAT.Automobile },

  // ════════════════════════════════════════
  // JARDIN & BRICOLAGE
  // ════════════════════════════════════════
  { name: "Outils à Main",              clefCategories: CAT.Jardin },
  { name: "Outils Électriques",         clefCategories: CAT.Jardin },
  { name: "Matériaux Construction",     clefCategories: CAT.Jardin },
  { name: "Peinture & Décoration",      clefCategories: CAT.Jardin },
  { name: "Plomberie",                  clefCategories: CAT.Jardin },
  { name: "Électricité",                clefCategories: CAT.Jardin },
  { name: "Serrures & Sécurité",        clefCategories: CAT.Jardin },
  { name: "Jardinage",                  clefCategories: CAT.Jardin },
  { name: "Plantes & Graines",          clefCategories: CAT.Jardin },
  { name: "Arrosage",                   clefCategories: CAT.Jardin },
  { name: "Mobilier Jardin",            clefCategories: CAT.Jardin },
  { name: "Autre Jardin & Bricolage",   clefCategories: CAT.Jardin },

  // ════════════════════════════════════════
  // SERVICES
  // ════════════════════════════════════════
  { name: "Réparation Électronique",    clefCategories: CAT.Services },
  { name: "Services Informatiques",     clefCategories: CAT.Services },
  { name: "Couture & Retouche",         clefCategories: CAT.Services },
  { name: "Photographie & Vidéo",       clefCategories: CAT.Services },
  { name: "Événementiel & Traiteur",    clefCategories: CAT.Services },
  { name: "Formation & Cours",          clefCategories: CAT.Services },
  { name: "Livraison & Transport",      clefCategories: CAT.Services },
  { name: "Services à Domicile",        clefCategories: CAT.Services },
  { name: "Beauté & Coiffure",          clefCategories: CAT.Services },
  { name: "Conseil & Expertise",        clefCategories: CAT.Services },
  { name: "Maintenance & Entretien",    clefCategories: CAT.Services },
  { name: "Sécurité & Gardiennage",     clefCategories: CAT.Services },
  { name: "Impression & Gravure",       clefCategories: CAT.Services },
  { name: "Location",                   clefCategories: CAT.Services },
  { name: "Autre Services",             clefCategories: CAT.Services },

  // ════════════════════════════════════════
  // OCCASION & RECONDITIONNÉ (nouvelle catégorie)
  // ════════════════════════════════════════
  { name: "Téléphones d'Occasion",      clefCategories: CAT.Occasion },
  { name: "Électronique d'Occasion",    clefCategories: CAT.Occasion },
  { name: "Vêtements d'Occasion",       clefCategories: CAT.Occasion },
  { name: "Meubles d'Occasion",         clefCategories: CAT.Occasion },
  { name: "Électroménager d'Occasion",  clefCategories: CAT.Occasion },
  { name: "Voitures d'Occasion",        clefCategories: CAT.Occasion },
  { name: "Motos d'Occasion",           clefCategories: CAT.Occasion },
  { name: "Livres d'Occasion",          clefCategories: CAT.Occasion },
  { name: "Matériel Pro d'Occasion",    clefCategories: CAT.Occasion },
  { name: "Divers Occasion",            clefCategories: CAT.Occasion },
  { name: "Autre Occasion",             clefCategories: CAT.Occasion },
];

// ─── Script principal ─────────────────────────────────────────────────────────
async function seedTypesProduits() {
  const MONGODB_URI = process.env.MONGODB_URI
    || "mongodb+srv://abdoulrazak9323:qrru0xfJGmJG0TSc@cluster0.mvrgous.mongodb.net/?retryWrites=true&w=majority";

  console.log('🔄 Connexion à MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connecté');

  // 1. Créer les nouvelles catégories (upsert — ne touche pas aux existantes)
  console.log('\n🔄 Upsert des nouvelles catégories...');
  let catCrees = 0;
  for (const cat of nouvellesCategories) {
    const result = await Categorie.updateOne(
      { _id: cat._id },
      { $setOnInsert: cat },
      { upsert: true }
    );
    if (result.upsertedCount > 0) {
      console.log(`   ✅ Créée: ${cat.name}`);
      catCrees++;
    } else {
      console.log(`   ⏭️  Déjà existante: ${cat.name}`);
    }
  }
  console.log(`\n   ${catCrees} nouvelle(s) catégorie(s) créée(s)`);

  // 2. Upsert des types (ne crée pas de doublons)
  console.log('\n🔄 Upsert des types de produits...');
  let crees = 0, existants = 0;

  for (const type of typesProduits) {
    const result = await TypeProduit.updateOne(
      { name: type.name, clefCategories: type.clefCategories },
      { $setOnInsert: type },
      { upsert: true }
    );
    if (result.upsertedCount > 0) crees++;
    else existants++;
  }

  console.log(`\n✅ Terminé:`);
  console.log(`   ${crees} type(s) créé(s)`);
  console.log(`   ${existants} type(s) déjà en base (ignorés)`);

  // 3. Résumé par catégorie
  const catNames = {
    [CAT.Mode]:           "Mode & Vêtements",
    [CAT.Textile]:        "Textile & Tissus",
    [CAT.Telephones]:     "Téléphones & Tablettes",
    [CAT.Electronique]:   "Électronique & Informatique",
    [CAT.Electromenager]: "Électroménager",
    [CAT.Maison]:         "Maison & Décoration",
    [CAT.Beaute]:         "Beauté & Santé",
    [CAT.Alimentation]:   "Alimentation & Boissons",
    [CAT.Agriculture]:    "Agriculture & Élevage",
    [CAT.Construction]:   "Construction & Matériaux",
    [CAT.Energie]:        "Énergie & Solaire",
    [CAT.Sports]:         "Sports & Loisirs",
    [CAT.Artisanat]:      "Artisanat & Art",
    [CAT.Bijoux]:         "Bijoux & Accessoires",
    [CAT.Livres]:         "Livres & Médias",
    [CAT.Enfants]:        "Enfants & Bébés",
    [CAT.Fournitures]:    "Fournitures Scolaires & Bureau",
    [CAT.Automobile]:     "Automobile & Moto",
    [CAT.Jardin]:         "Jardin & Bricolage",
    [CAT.Services]:       "Services",
    [CAT.Occasion]:       "Occasion & Reconditionné",
  };

  const summary = {};
  typesProduits.forEach(t => {
    const label = catNames[t.clefCategories] || t.clefCategories;
    summary[label] = (summary[label] || 0) + 1;
  });

  console.log('\n📊 Types par catégorie:');
  Object.entries(summary).sort().forEach(([cat, count]) => {
    console.log(`   ${cat}: ${count} types`);
  });
  console.log(`\n   TOTAL: ${typesProduits.length} types définis`);
}

seedTypesProduits()
  .catch(err => console.error('❌ Erreur:', err.message))
  .finally(() => mongoose.connection.close().then(() => console.log('\n🔌 Connexion fermée')));
