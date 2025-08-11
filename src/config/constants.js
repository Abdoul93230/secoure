// Configuration et constantes de l'application

const PRODUCT_STATUS = {
  PUBLISHED: 'Published',
  UNPUBLISHED: 'UnPublished',
  PENDING: 'Attente',
  REJECTED: 'Refuser'
};

const ORDER_STATUS = {
  PROCESSING: 'traitement',
  RECEIVED_BY_DELIVERY: 'reçu par le livreur',
  IN_DELIVERY: 'en cours de livraison',
  DELIVERED: 'livraison reçu',
  PROCESSED: 'Traité'
};

const PAYMENT_STATUS = {
  PENDING: 'en cours',
  PAID: 'payé',
  FAILED: 'échec',
  REFUNDED: 'remboursé'
};

const USER_ROLES = {
  ADMIN: 'admin',
  SELLER: 'seller',
  USER: 'user'
};

const IMAGE_CONFIG = {
  FOLDER: 'images',
  MAX_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_FORMATS: ['jpg', 'jpeg', 'png', 'webp']
};

const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100
};

const VALIDATION_RULES = {
  MIN_NAME_LENGTH: 2,
  MIN_DESCRIPTION_LENGTH: 20,
  MIN_PRICE: 10,
  MIN_QUANTITY: 1,
  MAX_RATING: 5,
  MIN_RATING: 1
};

module.exports = {
  PRODUCT_STATUS,
  ORDER_STATUS,
  PAYMENT_STATUS,
  USER_ROLES,
  IMAGE_CONFIG,
  PAGINATION,
  VALIDATION_RULES
};