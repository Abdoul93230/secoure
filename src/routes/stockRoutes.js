const express = require('express');
const router = express.Router();
const StockService = require('../services/stockService');
const { Produit } = require('../Models');

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

// GET /api/stock/inventory/:sellerId — inventaire complet du seller
router.get('/inventory/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { threshold } = req.query; // seuil d'alerte optionnel (défaut: 5)
    const alertThreshold = parseInt(threshold) || 5;

    const products = await Produit.find(
      { Clefournisseur: sellerId, isDeleted: { $ne: true } },
      { name: 1, quantite: 1, prix: 1, pictures: 1, variants: 1, ClefType: 1, isPublished: 1 }
    ).lean();

    const inventory = products.map(p => {
      const hasVariants = p.variants && p.variants.length > 0;
      const stockTotal = hasVariants
        ? p.variants.reduce((s, v) => s + (v.stock || 0), 0)
        : (p.quantite || 0);

      return {
        _id: p._id,
        name: p.name,
        prix: p.prix,
        picture: p.pictures?.[0] || null,
        isPublished: p.isPublished,
        hasVariants,
        stockPrincipal: hasVariants ? null : (p.quantite || 0),
        stockTotal,
        isLow: stockTotal <= alertThreshold,
        isOutOfStock: stockTotal === 0,
        variants: hasVariants ? p.variants.map(v => ({
          _id: v._id,
          color: v.color,
          colorCode: v.colorCode,
          sizes: v.sizes,
          stock: v.stock || 0,
          isLow: (v.stock || 0) <= alertThreshold,
        })) : [],
      };
    });

    const stats = {
      total: inventory.length,
      outOfStock: inventory.filter(p => p.isOutOfStock).length,
      lowStock: inventory.filter(p => p.isLow && !p.isOutOfStock).length,
      ok: inventory.filter(p => !p.isLow).length,
    };

    res.json({ success: true, data: inventory, stats });
  } catch (error) {
    console.error('❌ Erreur inventaire:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération de l\'inventaire', error: error.message });
  }
});

// PATCH /api/stock/adjust/:productId — ajustement rapide du stock
router.patch('/adjust/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { stock, variantId } = req.body;

    if (stock === undefined || stock < 0) {
      return res.status(400).json({ success: false, message: 'Stock invalide' });
    }

    let updatedProduct;
    if (variantId) {
      updatedProduct = await Produit.findOneAndUpdate(
        { _id: productId, 'variants._id': variantId },
        { $set: { 'variants.$.stock': stock } },
        { new: true, select: 'name variants quantite' }
      );
    } else {
      updatedProduct = await Produit.findByIdAndUpdate(
        productId,
        { $set: { quantite: stock } },
        { new: true, select: 'name variants quantite' }
      );
    }

    if (!updatedProduct) {
      return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    }

    res.json({ success: true, message: 'Stock mis à jour', data: updatedProduct });
  } catch (error) {
    console.error('❌ Erreur ajustement stock:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de l\'ajustement du stock', error: error.message });
  }
});

module.exports = router;
