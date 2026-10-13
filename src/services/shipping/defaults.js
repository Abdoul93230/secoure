/**
 * Modèle « Standard Niger » — valeurs validées par la direction (2026-10-13).
 * Modifiable ensuite depuis l'admin ; ce fichier ne sert qu'à la création initiale.
 */
const STANDARD_TEMPLATE_CODE = 'standard-niger';

/**
 * @param {{ niameyZoneId?: string }} refs  identifiants de zones connus au moment de la création
 */
function buildStandardTemplate({ niameyZoneId } = {}) {
  return {
    code: STANDARD_TEMPLATE_CODE,
    name: 'Standard Niger',
    description: 'Modèle par défaut de la plateforme : tarif selon la distance boutique → client.',
    kind: 'platform',
    isDefault: true,
    isActive: true,
    relations: {
      sameDistrict: { baseFee: 500, available: true, delay: { sameDay: true } },
      sameCity: { baseFee: 1000, available: true, delay: { sameDay: true } },
      sameRegion: { baseFee: 1000, available: true, delay: { sameDay: true } },
      otherRegion: { baseFee: 2000, available: true, delay: { minDays: 1, maxDays: 2 } },
      international: { baseFee: 5000, available: true, delay: { minDays: 3, maxDays: 7 } },
    },
    // Même quartier : 1 000 F à Niamey, 500 F ailleurs
    areaRates: niameyZoneId ? [{ zoneId: niameyZoneId, relation: 'sameDistrict', baseFee: 1000 }] : [],
    regionRoutes: [],
    destinationRules: [],
    includedWeightKg: 1,
    extraPerKgByClass: { small: 150, medium: 200, large: 500 },
    sameDayCutoff: '18:30',
    maxWeightKg: 0,
    codAllowed: true,
  };
}

module.exports = { STANDARD_TEMPLATE_CODE, buildStandardTemplate };
