// 1. ROUTES EXPRESS POUR LE SYSTÈME FINANCIER

const express = require('express');
const router = express.Router();
const FinancialService = require('../services/FinancialService');
const Retrait = require('../models/retraitSchema');
const Transaction = require('../models/transactionSchema');
const Portefeuille = require('../models/portefeuilleSchema');
const { Commande } = require('../Models');
const { getSellerDashboard, getHistoriqueTransactions, seller_orders_with_financial, demanderRetrait } = require('../controllers/financeController');

// Dashboard financier du seller
router.get('/seller/:sellerId/dashboard', getSellerDashboard);

// Historique des transactions
router.get('/seller/:sellerId/transactions', getHistoriqueTransactions);
router.get('/seller/:sellerId/orders-financial', seller_orders_with_financial);

// Demander un retrait
router.post('/seller/:sellerId/retrait', demanderRetrait);

// Vérifier les mises à jour du portefeuille (polling)
router.get('/seller/:sellerId/check-updates', async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    const { lastUpdate } = req.query;
    
    // console.log(`🔍 CHECK-UPDATES: sellerId=${sellerId}, lastUpdate=${lastUpdate}`);
    
    // Récupérer les transactions récentes
    const dateFilter = lastUpdate ? { $gt: new Date(lastUpdate) } : { $gte: new Date(Date.now() - 5 * 60 * 1000) }; // 5 min
    const transactions = await Transaction.find({
      sellerId,
      dateTransaction: dateFilter
    }).sort({ dateTransaction: -1 });
    
    // console.log(`📊 CHECK-UPDATES: ${transactions.length} nouvelles transactions trouvées`);
    
    // Récupérer le portefeuille actuel
    const portefeuille = await Portefeuille.findOne({ sellerId });
    
    res.json({
      success: true,
      hasUpdates: transactions.length > 0,
      newTransactions: transactions.map(t => ({
        _id: t._id,
        type: t.type,
        statut: t.statut,
        montant: t.montant,
        montantNet: t.montantNet,
        dateTransaction: t.dateTransaction
      })),
      portefeuille,
      lastCheck: new Date()
    });
  } catch (error) {
    console.error('❌ Erreur check-updates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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

// 🔥 NOUVEAU: Endpoint de test pour diagnostiquer les problèmes de portefeuille
router.get('/seller/:sellerId/debug', async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    
    console.log(`🔍 DEBUG: Analyse pour sellerId=${sellerId}`);
    
    // Récupérer toutes les données pour ce seller
    const [portefeuille, transactions, allTransactions, commandes] = await Promise.all([
      Portefeuille.findOne({ sellerId }),
      Transaction.find({ sellerId }).sort({ dateTransaction: -1 }).limit(10),
      Transaction.find({ sellerId }).sort({ dateTransaction: -1 }), // Toutes les transactions
      Commande.find({
        'prod.Clefournisseur': sellerId,
        $or: [
          { etatTraitement: 'reçu par le livreur' },
          { etatTraitement: 'en cours de livraison' },
          { statusLivraison: 'livré' }
        ]
      }).limit(5)
    ]);
    
    console.log(`📊 DEBUG RESULTS: portefeuille=${!!portefeuille}, transactions récentes=${transactions.length}, transactions totales=${allTransactions.length}, commandes=${commandes.length}`);
    
    res.json({
      success: true,
      debug: {
        sellerId,
        portefeuille,
        transactionsCount: transactions.length,
        allTransactionsCount: allTransactions.length,
        transactions: transactions.map(t => ({
          _id: t._id,
          type: t.type,
          statut: t.statut,
          montant: t.montant,
          montantNet: t.montantNet,
          commandeId: t.commandeId,
          dateTransaction: t.dateTransaction,
          estDisponible: t.estDisponible
        })),
        allTransactions: allTransactions.map(t => ({
          _id: t._id,
          type: t.type,
          statut: t.statut,
          montant: t.montant,
          montantNet: t.montantNet,
          commandeId: t.commandeId,
          dateTransaction: t.dateTransaction,
          estDisponible: t.estDisponible
        })),
        commandesCount: commandes.length,
        commandes: commandes.map(c => ({
          _id: c._id,
          reference: c.reference,
          etatTraitement: c.etatTraitement,
          statusLivraison: c.statusLivraison,
          prix: c.prix,
          createdAt: c.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('❌ Erreur debug:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🧪 ENDPOINT DE TEST: Créer une transaction manuelle pour tester
router.post('/test/create-transaction/:sellerId', async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    const { commandeId, commandeData, reference } = req.body;
    
    console.log('🧪 TEST: Création transaction pour seller:', sellerId);
    
    // Utiliser le FinancialService pour créer une transaction réelle
    const result = await FinancialService.creerTransactionsCommande(
      commandeId || 'TEST_' + Date.now(),
      commandeData,
      reference || 'TEST_REF_' + Date.now()
    );
    
    console.log('✅ Transaction test créée:', result);
    
    res.json({
      success: true,
      message: 'Transaction de test créée avec succès',
      data: result
    });
    
  } catch (error) {
    console.error('❌ Erreur création transaction test:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Évolution temporelle du portefeuille (depuis la création du seller)
router.get('/seller/:sellerId/evolution', async (req, res) => {
  try {
    const sellerId = req.params.sellerId;

    // Toutes les transactions (tous statuts sauf ANNULE/EXPIRE) triées chronologiquement
    const transactions = await Transaction.find({
      sellerId,
      statut: { $nin: ['ANNULE', 'EXPIRE'] }
    }).sort({ dateTransaction: 1 });

    if (!transactions.length) {
      return res.json({ success: true, data: [] });
    }

    // Grouper par mois (YYYY-MM)
    const byMonth = {};
    for (const t of transactions) {
      const d = new Date(t.dateTransaction);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[key]) byMonth[key] = { key, ventes: 0, commissions: 0, retraits: 0, net: 0 };

      if (t.type === 'CREDIT_COMMANDE') {
        byMonth[key].ventes      += t.montant || 0;
        byMonth[key].commissions += t.commission || 0;
        byMonth[key].net         += t.montantNet || 0;
      } else if (t.type === 'RETRAIT') {
        byMonth[key].retraits += Math.abs(t.montantNet || 0);
      } else if (t.type === 'ANNULATION') {
        byMonth[key].net -= Math.abs(t.montantNet || 0);
      } else if (t.type === 'CORRECTION') {
        byMonth[key].net += t.montantNet || 0;
      }
    }

    // Remplir les mois vides entre le premier et le dernier mois
    const keys = Object.keys(byMonth).sort();
    const [firstYear, firstMonth] = keys[0].split('-').map(Number);
    const now = new Date();
    const lastYear = now.getFullYear();
    const lastMonth = now.getMonth() + 1;

    const allMonths = [];
    let y = firstYear, m = firstMonth;
    while (y < lastYear || (y === lastYear && m <= lastMonth)) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      allMonths.push(byMonth[key] || { key, ventes: 0, commissions: 0, retraits: 0, net: 0 });
      m++;
      if (m > 12) { m = 1; y++; }
    }

    // Calculer le solde cumulé mois par mois
    let cumulNet = 0;
    const data = allMonths.map(mo => {
      cumulNet += mo.net - mo.retraits;
      const [yr, mn] = mo.key.split('-');
      const label = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' })
        .format(new Date(Number(yr), Number(mn) - 1, 1));
      return {
        key: mo.key,
        label,
        ventes: Math.round(mo.ventes),
        commissions: Math.round(mo.commissions),
        retraits: Math.round(mo.retraits),
        net: Math.round(mo.net),
        soldesCumule: Math.max(0, Math.round(cumulNet))
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Erreur évolution portefeuille:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🔧 ENDPOINT DE RÉPARATION: Corriger les incohérences du portefeuille
router.post('/seller/:sellerId/fix-coherence', async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    
    console.log('🔧 RÉPARATION: Correction des incohérences pour seller:', sellerId);
    
    // Utiliser la fonction de recalcul du FinancialService
    const result = await FinancialService.recalculerSoldes(sellerId);
    
    console.log('✅ Incohérences corrigées:', result);
    
    res.json({
      success: true,
      message: 'Incohérences corrigées avec succès',
      nouveauxSoldes: result
    });
    
  } catch (error) {
    console.error('❌ Erreur correction incohérences:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;