/**
 * Référentiel des zones de livraison du Niger (v1 — 2026-10-13).
 *
 * Structure du moteur : pays → région → ville / commune → quartier.
 *   - Niamey : la région contient les 5 communes (Niamey I à V), chacune avec ses quartiers.
 *   - Autres régions : chef-lieu + villes chefs-lieux de département ; quartiers pour les grandes villes.
 *
 * ⚠ À FAIRE VALIDER PAR L'ÉQUIPE TERRAIN : la liste des quartiers et leur commune de rattachement.
 *   Impact tarifaire limité : à Niamey, même quartier / même commune / autre commune = 1 000 F.
 *   Une zone manquante s'ajoute depuis l'admin, sans redéploiement.
 *
 * `aliases` : autres graphies reconnues (recherche client, détection du lieu des boutiques).
 * `center`  : point approximatif { lat, lng } (préparation du filtre « Près de chez moi »).
 */

const c = (lat, lng) => ({ lat, lng });
const q = (name, aliases = []) => ({ name, type: 'district', aliases });

const NIAMEY_COMMUNES = [
  {
    name: 'Commune 1', center: c(13.528, 2.085), aliases: ['Niamey I', 'Niamey 1', 'Commune I', 'Arrondissement 1'],
    children: [
      q('Plateau'), q('Yantala Haut', ['Yantala']), q('Yantala Bas'), q('Koira Kano', ['Koirakano']), q('Koira Kano Nord'),
      q('Kouara Kano', ['Kwara Kano']), q('Goudel'), q('Bobiel'), q('Koubia'), q('Cité Chinoise'), q('Issa Béri'),
      q('Recasement'), q('Tchangarey'), q('Niamey 2000'), q('Cité Fayçal', ['Cite Faycal']),
    ],
  },
  {
    name: 'Commune 2', center: c(13.540, 2.112), aliases: ['Niamey II', 'Niamey 2', 'Commune II', 'Arrondissement 2'],
    children: [
      q('Boukoki'), q('Lazaret'), q('Banizoumbou'), q('Abidjan'), q('Zongo'), q('Bandabari'), q('Koira Tégui', ['Koira Tegui']),
      q('Kalley Est'), q('Couronne Nord'), q('Dar Es Salam', ['Dar Salam']), q('Wadata'),
    ],
  },
  {
    name: 'Commune 3', center: c(13.515, 2.118), aliases: ['Niamey III', 'Niamey 3', 'Commune III', 'Arrondissement 3'],
    children: [
      q('Maourey'), q('Kalley Centre'), q('Kalley Nord'), q('Lacouroussou'), q('Poudrière', ['Poudriere']), q('Liberté'),
      q('Deyzeibon'), q('Banifandou'), q('Grand Marché'), q('Nouveau Marché'), q('Terminus'), q('Gawèye', ['Gaweye']),
    ],
  },
  {
    name: 'Commune 4', center: c(13.500, 2.165), aliases: ['Niamey IV', 'Niamey 4', 'Commune IV', 'Arrondissement 4'],
    children: [
      q('Talladjé', ['Talladje']), q('Aéroport', ['Aeroport']), q('Saga'), q('Gamkallé', ['Gamkalé', 'Gamkale']), q('Nogaré'),
      q('Zarmagandey'), q('Gountou Yéna', ['Gountou Yena']), q('Cité Députés'),
    ],
  },
  {
    name: 'Commune 5', center: c(13.488, 2.100), aliases: ['Niamey V', 'Niamey 5', 'Commune V', 'Arrondissement 5', 'Rive droite'],
    children: [
      q('Harobanda'), q('Lamordé', ['Lamorde']), q('Kirkissoye'), q('Karadjé', ['Karadje']), q('Saguia'), q('Nordiré'),
      q('Banga Bana'), q('Tagabati'),
    ],
  },
];

/** Région → villes (la première porte le nom du chef-lieu) */
const REGIONS = [
  { name: 'Niamey', center: c(13.5116, 2.1254), children: NIAMEY_COMMUNES },
  {
    name: 'Agadez', center: c(16.9742, 7.9865),
    cities: [
      ['Agadez', c(16.9742, 7.9865), ['Dagmanet', 'Katanga', 'Obitara', 'Pays-Bas', 'Sabon Gari', 'Toudou']],
      ['Arlit', c(18.7369, 7.3853)], ['Tchirozérine', c(17.26, 7.88)], ['Ingall', c(16.787, 6.933)], ['Bilma', c(18.6853, 12.9164)],
      ['Aderbissinat', c(15.62, 7.9)], ['Iférouane', c(19.07, 8.42)],
    ],
  },
  {
    name: 'Diffa', center: c(13.3154, 12.6113),
    cities: [
      ['Diffa', c(13.3154, 12.6113)], ['Mainé-Soroa', c(13.2114, 12.0241), [], ['Maine Soroa']], ['N’Guigmi', c(14.2532, 13.1112), [], ['Nguigmi']],
      ['Bosso', c(13.697, 13.311)], ['Goudoumaria', c(13.71, 11.18)], ['N’Gourti', c(15.32, 13.2), [], ['Ngourti']],
    ],
  },
  {
    name: 'Dosso', center: c(13.049, 3.1937),
    cities: [
      ['Dosso', c(13.049, 3.1937)], ['Dogondoutchi', c(13.6403, 4.0287), [], ['Doutchi']], ['Birni N’Gaouré', c(13.0889, 2.9167), [], ['Birni Ngaoure', 'Boboye']],
      ['Gaya', c(11.8843, 3.4492)], ['Loga', c(13.617, 3.233)], ['Falmey', c(12.6, 2.85)], ['Dioundiou', c(12.62, 3.55)], ['Tibiri (Doutchi)', c(13.56, 4.0), [], ['Tibiri Doutchi']],
    ],
  },
  {
    name: 'Maradi', center: c(13.5, 7.1017),
    cities: [
      ['Maradi', c(13.5, 7.1017), ['Sabon Gari', 'Zaria', 'Maradawa', 'Dan Goulbi', 'Ali Dan Sofo', 'Kaguirawa', 'Bagalam', 'Tarna', 'Dar Es Salam']],
      ['Tessaoua', c(13.757, 7.9874)], ['Madarounfa', c(13.3064, 7.1556)], ['Dakoro', c(14.5106, 6.765)], ['Guidan Roumdji', c(13.6571, 6.6965), [], ['Guidan Roumji']],
      ['Mayahi', c(13.955, 7.672)], ['Aguié', c(13.5056, 7.7787), [], ['Aguie']], ['Gazaoua', c(13.53, 7.92)], ['Bermo', c(14.95, 6.9)],
    ],
  },
  {
    name: 'Tahoua', center: c(14.8888, 5.2692),
    cities: [
      ['Tahoua', c(14.8888, 5.2692)], ['Birni N’Konni', c(13.7904, 5.2499), [], ['Konni', 'Birni Nkonni']], ['Madaoua', c(14.0731, 5.9603)], ['Bouza', c(14.4222, 6.0428)],
      ['Keita', c(14.756, 5.774)], ['Illéla', c(14.4608, 5.2436), [], ['Illela']], ['Abalak', c(15.4579, 6.2791)], ['Tchintabaraden', c(15.8969, 5.7985)],
      ['Tillia', c(16.13, 4.79)], ['Malbaza', c(13.96, 5.52)], ['Bagaroua', c(14.53, 4.38)],
    ],
  },
  {
    name: 'Tillabéri', center: c(14.2117, 1.4531),
    cities: [
      ['Tillabéri', c(14.2117, 1.4531), [], ['Tillaberi']], ['Kollo', c(13.307, 2.339)], ['Say', c(13.1007, 2.36)], ['Téra', c(14.0078, 0.7531), [], ['Tera']],
      ['Filingué', c(14.3521, 3.3168), [], ['Filingue']], ['Ouallam', c(14.3189, 2.0864)], ['Torodi', c(13.117, 1.797)], ['Gothèye', c(13.86, 1.57), [], ['Gotheye']],
      ['Ayorou', c(14.7308, 0.9174)], ['Abala', c(14.93, 3.43)], ['Balléyara', c(13.78, 2.95), [], ['Balleyara']], ['Banibangou', c(15.04, 2.7)], ['Bankilaré', c(14.58, 0.73), [], ['Bankilare']],
    ],
  },
  {
    name: 'Zinder', center: c(13.8053, 8.9881),
    cities: [
      ['Zinder', c(13.8053, 8.9881), ['Birni', 'Zengou', 'Sabon Gari', 'Kara-Kara', 'Garin Malam', 'Dar Es Salam']],
      ['Magaria', c(12.9983, 8.9097)], ['Mirriah', c(13.7071, 9.1508)], ['Matamèye', c(13.423, 8.477), [], ['Matameye']], ['Gouré', c(13.9835, 10.2704), [], ['Goure']],
      ['Tanout', c(14.9709, 8.8879)], ['Kantché', c(13.53, 8.47), [], ['Kantche']], ['Dungass', c(13.07, 9.33)], ['Takeita', c(13.68, 8.55)],
      ['Tesker', c(15.07, 10.69)], ['Belbédji', c(14.6, 8.0), [], ['Belbedji']], ['Damagaram Takaya', c(14.1, 9.43)],
    ],
  },
];

/** Arbre complet au format du script de synchronisation */
function nigerTree() {
  return {
    name: 'Niger',
    type: 'country',
    center: c(17.6078, 8.0817),
    children: REGIONS.map((r) => ({
      name: r.name,
      type: 'region',
      center: r.center,
      aliases: [],
      children: r.children
        ? r.children.map((commune) => ({ ...commune, type: 'city', children: commune.children }))
        : r.cities.map(([name, center, districts = [], aliases = []]) => ({
          name, type: 'city', center, aliases, children: districts.map((d) => q(d)),
        })),
    })),
  };
}

module.exports = { nigerTree };
