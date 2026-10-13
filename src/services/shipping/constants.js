/**
 * Constantes du moteur de livraison Ihambaobab.
 * Toute valeur tarifaire « métier » vit dans les modèles (ShippingTemplate) et se règle
 * depuis l'admin ; ce fichier ne contient que des invariants et des valeurs de repli.
 */

/** Relation entre le lieu d'expédition de la boutique et l'adresse du client */
const RELATIONS = Object.freeze({
  SAME_DISTRICT: 'sameDistrict', // même quartier
  SAME_CITY: 'sameCity', // même ville / commune
  SAME_REGION: 'sameRegion', // même région
  OTHER_REGION: 'otherRegion', // autre région du même pays
  INTERNATIONAL: 'international', // autre pays
});

const RELATION_LABELS = Object.freeze({
  sameDistrict: 'Même quartier',
  sameCity: 'Même ville',
  sameRegion: 'Même région',
  otherRegion: 'Autre région',
  international: 'International',
});

/** Classes de taille des produits (ordre croissant) */
const SIZE_CLASSES = Object.freeze({
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
  XL: 'xl', // très volumineux : livraison sur devis
});

const SIZE_ORDER = ['small', 'medium', 'large', 'xl'];

const SIZE_LABELS = Object.freeze({
  small: 'Petit',
  medium: 'Moyen',
  large: 'Grand',
  xl: 'Très volumineux',
});

/** Poids retenu quand le produit n'a pas de poids exact (kg) */
const DEFAULT_WEIGHT_BY_CLASS = Object.freeze({ small: 0.5, medium: 2, large: 8, xl: 30 });

/** Classe déduite d'un poids exact quand le produit n'a pas de classe */
const classFromWeight = (kg) => (kg <= 1.5 ? 'small' : kg <= 6 ? 'medium' : 'large');

/** Niger : UTC+1 toute l'année (pas d'heure d'été) */
const PLATFORM_UTC_OFFSET_MINUTES = 60;

/** Raisons de non-livraison renvoyées au client */
const REASONS = Object.freeze({
  QUOTE_REQUIRED: 'QUOTE_REQUIRED', // très volumineux : sur devis
  ZONE_UNAVAILABLE: 'ZONE_UNAVAILABLE', // zone non desservie
  INTERNATIONAL_UNAVAILABLE: 'INTERNATIONAL_UNAVAILABLE',
  TOO_HEAVY: 'TOO_HEAVY',
  DESTINATION_UNKNOWN: 'DESTINATION_UNKNOWN',
});

const REASON_MESSAGES = Object.freeze({
  QUOTE_REQUIRED: 'Livraison sur devis : notre équipe vous contacte pour fixer les frais.',
  ZONE_UNAVAILABLE: 'Cette boutique ne livre pas encore dans votre zone.',
  INTERNATIONAL_UNAVAILABLE: 'La livraison hors du pays n’est pas encore disponible.',
  TOO_HEAVY: 'Colis trop lourd pour la livraison standard : notre équipe vous contacte.',
  DESTINATION_UNKNOWN: 'Choisissez votre zone de livraison.',
});

module.exports = {
  RELATIONS,
  RELATION_LABELS,
  SIZE_CLASSES,
  SIZE_ORDER,
  SIZE_LABELS,
  DEFAULT_WEIGHT_BY_CLASS,
  classFromWeight,
  PLATFORM_UTC_OFFSET_MINUTES,
  REASONS,
  REASON_MESSAGES,
};
