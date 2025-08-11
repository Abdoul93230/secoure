const { body, validationResult } = require('express-validator');

// Règles de validation pour les produits
const productValidationRules = () => {
  return [
    body('name')
      .isLength({ min: 2 })
      .withMessage('Le nom doit comporter au moins 2 caractères')
      .trim(),
    
    body('prix')
      .isNumeric()
      .withMessage('Le prix doit être un nombre')
      .isFloat({ min: 10 })
      .withMessage('Le prix minimum est de 10 FCFA'),
    
    body('quantite')
      .isInt({ min: 1 })
      .withMessage('La quantité minimum est de 1'),
    
    body('description')
      .isLength({ min: 20 })
      .withMessage('La description doit comporter au moins 20 caractères')
      .trim(),
    
    body('ClefType')
      .notEmpty()
      .withMessage('Le type de produit est requis'),
    
    body('Clefournisseur')
      .notEmpty()
      .withMessage('Le fournisseur est requis'),
    
    body('prixPromo')
      .optional()
      .isNumeric()
      .withMessage('Le prix promo doit être un nombre')
      .isFloat({ min: 0 })
      .withMessage('Le prix promo ne peut pas être négatif'),
    
    body('shipping.origine')
      .optional()
      .notEmpty()
      .withMessage('La zone d\'origine est requise si shipping est fourni'),
    
    body('shipping.weight')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Le poids ne peut pas être négatif')
  ];
};

// Validation pour les catégories
const categoryValidationRules = () => {
  return [
    body('name')
      .isLength({ min: 2 })
      .withMessage('Le nom de la catégorie doit comporter au moins 2 caractères')
      .trim()
  ];
};

// Validation pour les types
const typeValidationRules = () => {
  return [
    body('name')
      .isLength({ min: 2 })
      .withMessage('Le nom du type doit comporter au moins 2 caractères')
      .trim(),
    
    body('clefCategories')
      .notEmpty()
      .withMessage('La catégorie est requise')
  ];
};

// Validation pour les commentaires
const commentValidationRules = () => {
  return [
    body('description')
      .isLength({ min: 5 })
      .withMessage('Le commentaire doit comporter au moins 5 caractères')
      .trim(),
    
    body('clefProduct')
      .notEmpty()
      .withMessage('L\'ID du produit est requis'),
    
    body('etoil')
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage('La note doit être entre 1 et 5')
  ];
};

// Fonction pour valider les données
const validateProduct = (data) => {
  const errors = [];
  
  if (!data.name || data.name.length < 2) {
    errors.push({ field: 'name', message: 'Le nom doit comporter au moins 2 caractères' });
  }
  
  if (!data.prix || isNaN(data.prix) || data.prix < 10) {
    errors.push({ field: 'prix', message: 'Le prix doit être un nombre supérieur à 10' });
  }
  
  if (!data.quantite || isNaN(data.quantite) || data.quantite < 1) {
    errors.push({ field: 'quantite', message: 'La quantité doit être supérieure à 0' });
  }
  
  if (!data.description || data.description.length < 20) {
    errors.push({ field: 'description', message: 'La description doit comporter au moins 20 caractères' });
  }
  
  if (!data.ClefType) {
    errors.push({ field: 'ClefType', message: 'Le type de produit est requis' });
  }
  
  if (!data.Clefournisseur) {
    errors.push({ field: 'Clefournisseur', message: 'Le fournisseur est requis' });
  }
  
  return errors.length > 0 ? errors : null;
};

// Middleware pour vérifier les erreurs de validation
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Erreurs de validation',
      errors: errors.array()
    });
  }
  next();
};

module.exports = {
  productValidationRules,
  categoryValidationRules,
  typeValidationRules,
  commentValidationRules,
  validateProduct,
  validate
};