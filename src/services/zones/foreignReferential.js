/**
 * Référentiel des zones à l'étranger (v1 — 2026-10-13) : pays → région / État → grandes villes.
 * Livraison internationale au niveau de la ville (pas de quartiers).
 *
 * Les `aliases` des régions reprennent les anciens noms de la base (ex. « Cotonou », « Port harcourt »)
 * pour conserver leurs identifiants lors de la synchronisation.
 * ⚠ À FAIRE VALIDER : découpages administratifs (le Burkina Faso a revu ses régions en 2025 ;
 * les noms historiques sont gardés en synonymes).
 *
 * La livraison internationale reste fermée tant que la ligne « International » du modèle
 * de livraison n'est pas activée dans l'admin.
 */

const c = (lat, lng) => ({ lat, lng });
const city = (name, center, aliases = []) => ({ name, type: 'city', center, aliases, children: [] });
const region = (name, center, cities, aliases = []) => ({ name, type: 'region', center, aliases, children: cities });

const NIGERIA = {
  name: 'Nigeria', type: 'country', center: c(9.082, 8.6753), aliases: ['Nigéria'],
  children: [
    region('Kano', c(12.0022, 8.592), [city('Kano', c(12.0022, 8.592))]),
    region('Katsina', c(12.9908, 7.6018), [city('Katsina', c(12.9908, 7.6018)), city('Daura', c(13.0333, 8.3167))]),
    region('Sokoto', c(13.0059, 5.2476), [city('Sokoto', c(13.0059, 5.2476))]),
    region('Kebbi', c(12.4539, 4.1975), [city('Birnin Kebbi', c(12.4539, 4.1975))]),
    region('Zamfara', c(12.1628, 6.6614), [city('Gusau', c(12.1628, 6.6614))]),
    region('Jigawa', c(11.7562, 9.3389), [city('Dutse', c(11.7562, 9.3389))]),
    region('Kaduna', c(10.5105, 7.4165), [city('Kaduna', c(10.5105, 7.4165)), city('Zaria', c(11.0855, 7.7199))]),
    region('Borno', c(11.8311, 13.151), [city('Maiduguri', c(11.8311, 13.151))]),
    region('Yobe', c(11.747, 11.9609), [city('Damaturu', c(11.747, 11.9609))]),
    region('Abuja (FCT)', c(9.0765, 7.3986), [city('Abuja', c(9.0765, 7.3986))], ['Abuja', 'FCT']),
    region('Lagos', c(6.5244, 3.3792), [city('Lagos', c(6.5244, 3.3792)), city('Ikeja', c(6.6018, 3.3515))]),
    region('Oyo', c(7.3775, 3.947), [city('Ibadan', c(7.3775, 3.947))]),
    region('Rivers', c(4.8156, 7.0498), [city('Port Harcourt', c(4.8156, 7.0498))], ['Port harcourt']),
  ],
};

const BENIN = {
  name: 'Bénin', type: 'country', center: c(9.3077, 2.3158), aliases: ['Benin'],
  children: [
    region('Littoral', c(6.3703, 2.3912), [city('Cotonou', c(6.3703, 2.3912))], ['Cotonou']),
    region('Ouémé', c(6.4969, 2.6283), [city('Porto-Novo', c(6.4969, 2.6283), ['Porto Novo'])], ['Porto-novo', 'Oueme']),
    region('Atlantique', c(6.4485, 2.3557), [city('Abomey-Calavi', c(6.4485, 2.3557), ['Calavi']), city('Ouidah', c(6.3631, 2.0851))]),
    region('Borgou', c(9.3372, 2.6303), [city('Parakou', c(9.3372, 2.6303))], ['Parakou']),
    region('Alibori', c(11.1342, 2.9386), [city('Kandi', c(11.1342, 2.9386)), city('Malanville', c(11.8619, 3.3862))]),
    region('Atacora', c(10.3042, 1.3796), [city('Natitingou', c(10.3042, 1.3796))]),
    region('Donga', c(9.7085, 1.666), [city('Djougou', c(9.7085, 1.666))]),
    region('Zou', c(7.1829, 1.9912), [city('Abomey', c(7.1829, 1.9912)), city('Bohicon', c(7.1782, 2.0667))]),
    region('Collines', c(7.9281, 1.9756), [city('Savalou', c(7.9281, 1.9756))]),
    region('Mono', c(6.6387, 1.7167), [city('Lokossa', c(6.6387, 1.7167))]),
    region('Couffo', c(6.9333, 1.6833), [city('Aplahoué', c(6.9333, 1.6833), ['Aplahoue'])]),
    region('Plateau', c(6.98, 2.665), [city('Pobè', c(6.98, 2.665), ['Pobe'])]),
  ],
};

const BURKINA = {
  name: 'Burkina Faso', type: 'country', center: c(12.2383, -1.5616), aliases: ['Burkina'],
  children: [
    region('Centre', c(12.3714, -1.5197), [city('Ouagadougou', c(12.3714, -1.5197), ['Ouaga'])], ['Ouagadougou', 'Kadiogo']),
    region('Hauts-Bassins', c(11.1771, -4.2979), [city('Bobo-Dioulasso', c(11.1771, -4.2979), ['Bobo'])], ['Bobo-dioulasso', 'Guiriko']),
    region('Est', c(12.0616, 0.3584), [city('Fada N’Gourma', c(12.0616, 0.3584), ['Fada Ngourma', 'Fada'])], ['Goulmou']),
    region('Sahel', c(14.0354, -0.0345), [city('Dori', c(14.0354, -0.0345))], ['Liptako']),
    region('Centre-Nord', c(13.0917, -1.0844), [city('Kaya', c(13.0917, -1.0844))], ['Kuilsé']),
    region('Nord', c(13.5828, -2.4216), [city('Ouahigouya', c(13.5828, -2.4216))], ['Yadega']),
    region('Centre-Ouest', c(12.2526, -2.3627), [city('Koudougou', c(12.2526, -2.3627))], ['Nando']),
    region('Centre-Est', c(11.78, -0.37), [city('Tenkodogo', c(11.78, -0.37))], ['Nakambé']),
    region('Boucle du Mouhoun', c(12.4634, -3.4608), [city('Dédougou', c(12.4634, -3.4608), ['Dedougou'])], ['Bankui']),
    region('Cascades', c(10.6331, -4.7614), [city('Banfora', c(10.6331, -4.7614))], ['Tannounyan']),
  ],
};

const MALI = {
  name: 'Mali', type: 'country', center: c(17.5707, -3.9962),
  children: [
    region('District de Bamako', c(12.6392, -8.0029), [city('Bamako', c(12.6392, -8.0029))], ['Bamako']),
    region('Koulikoro', c(12.8628, -7.5599), [city('Koulikoro', c(12.8628, -7.5599))]),
    region('Sikasso', c(11.3176, -5.6665), [city('Sikasso', c(11.3176, -5.6665))]),
    region('Ségou', c(13.4317, -6.2157), [city('Ségou', c(13.4317, -6.2157), ['Segou'])], ['Segou']),
    region('Mopti', c(14.4843, -4.1828), [city('Mopti', c(14.4843, -4.1828))]),
    region('Kayes', c(14.4469, -11.4456), [city('Kayes', c(14.4469, -11.4456))]),
    region('Gao', c(16.2666, -0.04), [city('Gao', c(16.2666, -0.04))]),
    region('Tombouctou', c(16.7666, -3.0026), [city('Tombouctou', c(16.7666, -3.0026), ['Timbuktu'])]),
    region('Ménaka', c(15.9182, 2.4022), [city('Ménaka', c(15.9182, 2.4022), ['Menaka'])], ['Menaka']),
  ],
};

function foreignTrees() {
  return [NIGERIA, BENIN, BURKINA, MALI];
}

module.exports = { foreignTrees };
