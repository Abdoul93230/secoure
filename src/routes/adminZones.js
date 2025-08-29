const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const zoneService = require('../services/zoneService');
const importService = require('../services/importService');
const { uploadImportFile, cleanupFile } = require('../middleware/upload');

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

// GET /api/admin/zones - Liste des zones avec pagination et filtres
router.get('/', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('type').optional().isIn(['country', 'region', 'city', 'district']),
  query('search').optional().isString().trim(),
  query('sortBy').optional().isString(),
  query('sortOrder').optional().isIn(['1', '-1']).toInt(),
  query('includeInactive').optional().isBoolean().toBoolean(),
  query('parent').optional().isMongoId(),
  query('isActive').optional().isBoolean().toBoolean(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const result = await zoneService.getZones(req.query);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/zones/stats - Statistiques des zones
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await zoneService.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/zones/hierarchy - Arbre hiérarchique
router.get('/hierarchy', [
  query('parent').optional().isMongoId(),
  query('maxLevel').optional().isInt({ min: 0, max: 3 }).toInt(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const { parent = null, maxLevel = 3 } = req.query;
    const hierarchy = await zoneService.getHierarchy(parent, maxLevel);
    res.json({
      success: true,
      data: hierarchy
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/zones/search - Recherche avec auto-complétion
router.get('/search', [
  query('q').notEmpty().isString().trim().isLength({ min: 2 }),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const { q, limit = 20 } = req.query;
    const results = await zoneService.searchZones(q, limit);
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/zones/:id - Détail d'une zone
router.get('/:id', [
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

// GET /api/admin/zones/:id/children - Sous-zones d'une zone
router.get('/:id/children', [
  param('id').isMongoId(),
  query('includeInactive').optional().isBoolean().toBoolean(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const { includeInactive = false } = req.query;
    const children = await zoneService.getZoneChildren(req.params.id, includeInactive);
    res.json({
      success: true,
      data: children
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/zones - Créer une zone
router.post('/', [
  body('name').notEmpty().isString().trim().isLength({ min: 1, max: 100 }),
  body('code').optional().isString().trim().isLength({ max: 20 }),
  body('type').isIn(['country', 'region', 'city', 'district']),
  body('parent').optional().isMongoId(),
  body('isActive').optional().isBoolean(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const zone = await zoneService.createZone(req.body);
    res.status(201).json({
      success: true,
      message: 'Zone créée avec succès',
      data: zone
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/zones/:id - Mettre à jour une zone
router.put('/:id', [
  param('id').isMongoId(),
  body('name').optional().isString().trim().isLength({ min: 1, max: 100 }),
  body('code').optional().isString().trim().isLength({ max: 20 }),
  body('type').optional().isIn(['country', 'region', 'city', 'district']),
  body('isActive').optional().isBoolean(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const zone = await zoneService.updateZone(req.params.id, req.body);
    res.json({
      success: true,
      message: 'Zone mise à jour avec succès',
      data: zone
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/zones/:id - Supprimer une zone
router.delete('/:id', [
  param('id').isMongoId(),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const result = await zoneService.deleteZone(req.params.id);
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/zones/import - Importer zones depuis CSV/Excel
router.post('/import', uploadImportFile, async (req, res, next) => {
  let filePath = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Aucun fichier fourni'
      });
    }

    filePath = req.file.path;
    const fileType = req.file.originalname.split('.').pop().toLowerCase();

    // Parser et valider le fichier
    const { validatedData, errors } = await importService.parseFile(filePath, fileType);

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Erreurs dans le fichier',
        errors
      });
    }

    // Importer les zones
    const importResult = await importService.importZones(validatedData);
    const report = importService.generateImportReport(importResult);

    res.json({
      success: true,
      message: `Import terminé: ${importResult.created} zones créées, ${importResult.duplicates} doublons ignorés`,
      data: report
    });

  } catch (error) {
    next(error);
  } finally {
    // Nettoyer le fichier uploadé
    if (filePath) {
      cleanupFile(filePath);
    }
  }
});

// POST /api/admin/zones/validate-import - Valider un fichier avant import
router.post('/validate-import', uploadImportFile, async (req, res, next) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Aucun fichier fourni'
      });
    }

    filePath = req.file.path;
    const fileType = req.file.originalname.split('.').pop().toLowerCase();

    const validation = await importService.validateFile(filePath, fileType);

    res.json({
      success: true,
      data: validation
    });

  } catch (error) {
    next(error);
  } finally {
    if (filePath) {
      cleanupFile(filePath);
    }
  }
});

module.exports = router;