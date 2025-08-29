const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const shippingService = require('../services/shippingServiceF');
const zoneService = require('../services/zoneService');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Body parsing middleware
router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ extended: true }));

// Middleware de validation des erreurs
const handleValidationErrors = (req, res, next) => {
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

// POST /api/shipping/calculate - Calculer les frais d'expédition
router.post('/calculate', [
  body('sellerId').notEmpty().isString(),
  body('customerZoneId').notEmpty().isMongoId(),
  body('weight').isFloat({ min: 0.1 }),
  handleValidationErrors
], async (req, res, next) => {
  try {
    
    const { sellerId, customerZoneId, weight } = req.body;
    // console.log({ sellerId, customerZoneId, weight });

    const result = await shippingService.calculateShippingCost(
      sellerId,
      customerZoneId,
      weight
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/shipping/calculate-multi-vendor - Calculer pour plusieurs vendeurs
router.post('/calculate-multi-vendor', [
  body('items').isArray({ min: 1 }),
  body('items.*.sellerId').notEmpty().isString(),
  body('items.*.sellerName').optional().isString(),
  body('items.*.weight').isFloat({ min: 0.1 }),
  body('items.*.items').optional().isInt({ min: 1 }),
  body('customerZoneId').notEmpty().isMongoId(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const { items, customerZoneId } = req.body;

    const result = await shippingService.calculateMultiVendorShipping(
      items,
      customerZoneId
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/shipping/zones - Obtenir les zones (pour sélecteur client)
router.get('/zones', [optionalAuth], [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('parent').optional().isMongoId(),
  query('type').optional().isIn(['country', 'region', 'city', 'district']),
  query('search').optional().isString().trim(),
  query('isActive').optional().isBoolean().toBoolean(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      parent,
      type,
      search,
      isActive = true
    } = req.query;

    const options = {
      page,
      limit,
      parent,
      type,
      search,
      includeInactive: !isActive
    };

    const result = await zoneService.getZones(options);


    res.json({
      success: true,
      data: result.zones,
      pagination: {
        currentPage: result.pagination.current,
        totalPages: result.pagination.total,
        totalItems: result.pagination.totalItems,
        itemsPerPage: result.pagination.limit,
        hasNextPage: result.pagination.current < result.pagination.total,
        hasPreviousPage: result.pagination.current > 1
      }
    });
  } catch (error) {
    next(error);
  }
});


// GET /api/shipping/zones/search - Recherche de zones avec pagination
router.get('/zones/search', [
  query('q').notEmpty().isString().trim().isLength({ min: 2 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const { 
      q, 
      page = 1, 
      limit = 20 
    } = req.query;
    
    // Modifiez searchZones pour accepter les options de pagination
    const results = await zoneService.searchZones(q, { page, limit });
    
    res.json({
      success: true,
      data: results.zones || results, // Compatible avec votre implémentation actuelle
      // Si searchZones ne retourne pas de pagination, on peut la calculer ou simplifier
      pagination: results.pagination || {
        currentPage: page,
        totalPages: Math.ceil((results.length || 0) / limit),
        totalItems: results.length || 0,
        itemsPerPage: limit,
        hasNextPage: false,
        hasPreviousPage: false
      }
    });
  } catch (error) {
    next(error);
  }
});


// GET /api/shipping/zones/hierarchy - Arbre hiérarchique pour sélecteur
router.get('/zones/hierarchy', [
  query('parent').optional().isMongoId(),
  query('maxLevel').optional().isInt({ min: 0, max: 3 }).toInt(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const { 
      parent = null, 
      maxLevel = 3
    } = req.query;
    
    const hierarchy = await zoneService.getHierarchy(parent, maxLevel);
    
    res.json({
      success: true,
      data: hierarchy
      // Pas de pagination pour la hiérarchie car c'est un arbre
    });
  } catch (error) {
    next(error);
  }
});


// GET /api/shipping/zones/:id/children - Zones enfants avec pagination
router.get('/zones/:id/children', [
  param('id').isMongoId(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const { 
      page, 
      limit 
    } = req.query;
    
    // Si pagination demandée, modifiez getZoneChildren pour l'accepter
    let result;
    if (page && limit) {
      // Vous devrez modifier getZoneChildren pour accepter les options de pagination
      result = await zoneService.getZoneChildren(req.params.id, false, { page, limit });
      
      res.json({
        success: true,
        data: result.children || result.zones,
        pagination: {
          currentPage: result.pagination?.current || page,
          totalPages: result.pagination?.total || 1,
          totalItems: result.pagination?.totalItems || (result.children || result.zones || []).length,
          itemsPerPage: result.pagination?.limit || limit,
          hasNextPage: (result.pagination?.current || page) < (result.pagination?.total || 1),
          hasPreviousPage: (result.pagination?.current || page) > 1
        }
      });
    } else {
      // Sans pagination (comportement actuel)
      result = await zoneService.getZoneChildren(req.params.id, false);
      
      res.json({
        success: true,
        data: result
      });
    }
  } catch (error) {
    next(error);
  }
});

// GET /api/shipping/zones/:id - Détail d'une zone
router.get('/zones/:id', [
  param('id').isMongoId(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const zone = await zoneService.getZoneById(req.params.id);

    res.json({
      success: true,
      data: zone
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;