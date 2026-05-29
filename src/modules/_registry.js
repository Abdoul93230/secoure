/**
 * Registre des modules métier.
 * Pour activer/désactiver un module : passer enabled à false.
 * Pour ajouter un module : ajouter une entrée et monter sa route dans App.js.
 */
const MODULES = {
  bilanJournalier: {
    id: 'bilanJournalier',
    name: 'Bilan Journalier',
    enabled: true,
    route: '/api/modules/bilan',
  },
  alertesStock: {
    id: 'alertesStock',
    name: 'Alertes Stock',
    enabled: true,
    route: '/api/modules/stock',
  },
  performanceProduits: {
    id: 'performanceProduits',
    name: 'Performance Produits',
    enabled: true,
    route: '/api/modules/performance',
  },
  carnetCreances: {
    id: 'carnetCreances',
    name: 'Carnet de Créances',
    enabled: true,
    route: '/api/modules/creances',
  },
  rapportPeriodique: {
    id: 'rapportPeriodique',
    name: 'Rapport Périodique',
    enabled: true,
    route: '/api/modules/rapports',
  },
};

const isEnabled = (moduleId) => MODULES[moduleId]?.enabled === true;

module.exports = { MODULES, isEnabled };
