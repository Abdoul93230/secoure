/**
 * Middleware de validation des comptes vendeurs
 * Vérifie le statut isvalid avant d'autoriser les actions sensibles
 */

const { SellerRequest } = require('../Models');
const jwt = require('jsonwebtoken');
const privateKeSeller = require('../auth/clefSeller');

/**
 * Middleware pour vérifier si le vendeur est validé
 */
const requireValidatedSeller = async (req, res, next) => {
  try {
    // Extraire le token
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        message: 'Token d\'authentification manquant',
        code: 'NO_TOKEN'
      });
    }

    // Décoder le token
    const decoded = jwt.verify(token, privateKeSeller);
    const sellerId = decoded.userId;

    // Récupérer le vendeur
    const seller = await SellerRequest.findById(sellerId);
    if (!seller) {
      return res.status(404).json({
        message: 'Vendeur non trouvé',
        code: 'SELLER_NOT_FOUND'
      });
    }

    // Vérifier la validation
    if (!seller.isvalid) {
      return res.status(403).json({
        message: 'Votre compte doit être validé pour effectuer cette action',
        code: 'ACCOUNT_NOT_VALIDATED',
        accountStatus: seller.suspensionReason ? 'suspended' : 'pending_validation',
        suspensionReason: seller.suspensionReason,
        nextSteps: [
          "Votre dossier est en cours de vérification",
          "Contactez le support si nécessaire",
          "Certaines fonctionnalités sont limitées en attendant"
        ]
      });
    }

    // Vérifier la suspension
    if (seller.suspensionReason) {
      return res.status(403).json({
        message: `Compte suspendu: ${seller.suspensionReason}`,
        code: 'ACCOUNT_SUSPENDED',
        accountStatus: 'suspended',
        suspensionReason: seller.suspensionReason
      });
    }

    // Ajouter le vendeur à la requête
    req.seller = seller;
    req.sellerId = sellerId;
    
    next();

  } catch (error) {
    console.error('Erreur middleware validation seller:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        message: 'Token invalide',
        code: 'INVALID_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Token expiré',
        code: 'TOKEN_EXPIRED'
      });
    }

    return res.status(500).json({
      message: 'Erreur de validation du compte',
      code: 'VALIDATION_ERROR'
    });
  }
};

/**
 * Middleware plus souple - permet l'accès mais ajoute des warnings
 */
const checkSellerValidation = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return next(); // Pas de token, laisser passer pour d'autres middleware
    }

    const decoded = jwt.verify(token, privateKeSeller);
    const seller = await SellerRequest.findById(decoded.userId);

    if (seller) {
      req.seller = seller;
      req.sellerId = decoded.userId;
      
      // Ajouter des warnings si non validé
      if (!seller.isvalid) {
        req.validationWarnings = {
          accountNotValidated: true,
          message: 'Compte en attente de validation',
          limitations: [
            'Certaines fonctionnalités peuvent être limitées',
            'Validez votre compte pour un accès complet'
          ]
        };
      }
    }

    next();

  } catch (error) {
    // En cas d'erreur, continuer sans bloquer
    console.error('Erreur middleware check validation:', error);
    next();
  }
};

/**
 * Actions autorisées même sans validation
 */
const ALLOWED_ACTIONS_WITHOUT_VALIDATION = [
  'profile_view',
  'profile_update',
  'upload_documents',
  'contact_support',
  'view_validation_status'
];

/**
 * Actions nécessitant une validation obligatoire
 */
const VALIDATION_REQUIRED_ACTIONS = [
  'create_product',
  'publish_product',
  'process_order',
  'receive_payment',
  'withdraw_funds',
  'configure_shipping',
  'access_analytics',
  'manage_promotions'
];

/**
 * Middleware conditionnel selon l'action
 */
const requireValidationForAction = (action) => {
  return async (req, res, next) => {
    if (ALLOWED_ACTIONS_WITHOUT_VALIDATION.includes(action)) {
      return next(); // Action autorisée sans validation
    }

    if (VALIDATION_REQUIRED_ACTIONS.includes(action)) {
      return requireValidatedSeller(req, res, next); // Validation obligatoire
    }

    // Action non définie - par défaut, demander validation
    return requireValidatedSeller(req, res, next);
  };
};

/**
 * Fonction utilitaire pour vérifier le statut de validation
 */
const getValidationStatus = async (sellerId) => {
  try {
    const seller = await SellerRequest.findById(sellerId);
    if (!seller) {
      return { status: 'not_found' };
    }

    if (seller.isvalid) {
      return { 
        status: 'validated',
        validatedAt: seller.validatedAt,
        message: 'Compte validé et actif'
      };
    }

    if (seller.suspensionReason) {
      return { 
        status: 'suspended',
        reason: seller.suspensionReason,
        suspendedAt: seller.suspensionDate,
        message: `Compte suspendu: ${seller.suspensionReason}`
      };
    }

    return { 
      status: 'pending',
      accountCreatedAt: seller.accountCreatedAt || seller.createdAt,
      message: 'Compte en attente de validation',
      estimatedValidationTime: '24-48h ouvrées'
    };

  } catch (error) {
    console.error('Erreur récupération statut validation:', error);
    return { status: 'error', message: 'Erreur système' };
  }
};

/**
 * Endpoint pour vérifier le statut de validation
 */
const getMyValidationStatus = async (req, res) => {
  try {
    const sellerId = req.sellerId || req.params.sellerId;
    const status = await getValidationStatus(sellerId);

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('Erreur endpoint validation status:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du statut'
    });
  }
};

module.exports = {
  requireValidatedSeller,
  checkSellerValidation,
  requireValidationForAction,
  getValidationStatus,
  getMyValidationStatus,
  ALLOWED_ACTIONS_WITHOUT_VALIDATION,
  VALIDATION_REQUIRED_ACTIONS
};
