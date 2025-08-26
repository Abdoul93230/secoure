// 1. ROUTES EXPRESS POUR LE SYSTÈME FINANCIER

const express = require('express');
const router = express.Router();
const {
  FinancialService
} = require('../services/FinancialService');
const Retrait = require('../models/retraitSchema');
const { getSellerDashboard, getHistoriqueTransactions, seller_orders_with_financial, demanderRetrait } = require('../controllers/financeController');

// Dashboard financier du seller
router.get('/seller/:sellerId/dashboard', getSellerDashboard);

// Historique des transactions
router.get('/seller/:sellerId/transactions', getHistoriqueTransactions);
router.get('/seller/:sellerId/orders-financial', seller_orders_with_financial);

// Demander un retrait
router.post('/seller/:sellerId/retrait', demanderRetrait);

// Obtenir les demandes de retrait
router.get('/seller/:sellerId/retraits', async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    const retraits = await Retrait.find({ sellerId })
      .sort({ datedemande: -1 })
      .limit(20);
    
    res.json({ success: true, data: retraits });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;