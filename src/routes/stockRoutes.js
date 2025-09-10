const express = require('express');
const router = express.Router();
const StockService = require('../services/stockService');

/**
 * Routes pour la gestion des stocks
 */

// GET /api/stock/report/:productId - Obtenir un rapport de stock pour un produit
router.get('/report/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const report = await StockService.getStockReport(productId);
    
    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('❌ Erreur lors de la génération du rapport de stock:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la génération du rapport de stock',
      error: error.message
    });
  }
});

// POST /api/stock/validate - Valider la disponibilité du stock
router.post('/validate', async (req, res) => {
  try {
    const { nbrProduits } = req.body;
    
    if (!nbrProduits || !Array.isArray(nbrProduits)) {
      return res.status(400).json({
        success: false,
        message: 'Le champ nbrProduits est requis et doit être un tableau'
      });
    }

    const validation = await StockService.validateStockAvailability(nbrProduits);
    
    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    console.error('❌ Erreur lors de la validation du stock:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la validation du stock',
      error: error.message
    });
  }
});

// POST /api/stock/decrement - Décrémenter le stock manuellement (admin uniquement)
router.post('/decrement', async (req, res) => {
  try {
    const { nbrProduits, reason } = req.body;
    
    if (!nbrProduits || !Array.isArray(nbrProduits)) {
      return res.status(400).json({
        success: false,
        message: 'Le champ nbrProduits est requis et doit être un tableau'
      });
    }

    const result = await StockService.decrementStock(nbrProduits);
    
    console.log(`📦 Décrémentation manuelle du stock - Raison: ${reason || 'Non spécifiée'}`);
    
    res.json({
      success: true,
      data: result,
      message: 'Stock décrémenté avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur lors de la décrémentation du stock:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la décrémentation du stock',
      error: error.message
    });
  }
});

// POST /api/stock/increment - Incrémenter le stock manuellement (admin uniquement)
router.post('/increment', async (req, res) => {
  try {
    const { nbrProduits, reason } = req.body;
    
    if (!nbrProduits || !Array.isArray(nbrProduits)) {
      return res.status(400).json({
        success: false,
        message: 'Le champ nbrProduits est requis et doit être un tableau'
      });
    }

    const result = await StockService.incrementStock(nbrProduits);
    
    console.log(`📦 Incrémentation manuelle du stock - Raison: ${reason || 'Non spécifiée'}`);
    
    res.json({
      success: true,
      data: result,
      message: 'Stock incrémenté avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur lors de l\'incrémentation du stock:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'incrémentation du stock',
      error: error.message
    });
  }
});

module.exports = router;
