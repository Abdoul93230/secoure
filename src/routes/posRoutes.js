const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const VenteDirecte = require('../models/VenteDirecte');
const StockService = require('../services/stockService');
const SUBSCRIPTION_CONFIG = require('../config/subscriptionConfig');

// Plans autorisés à utiliser la caisse POS
const POS_ALLOWED_PLANS = ['Pro', 'Business'];

// ─── Middleware : vérifier que le seller a un plan Pro ou Business ─────────────
async function requirePosAccess(req, res, next) {
  try {
    const sellerId = req.body.sellerId || req.params.sellerId;
    if (!sellerId) return res.status(400).json({ success: false, message: 'sellerId manquant' });

    const { SellerRequest, PricingPlan } = require('../Models');
    const seller = await SellerRequest.findById(sellerId).lean();
    if (!seller) return res.status(404).json({ success: false, message: 'Seller introuvable' });

    let planName = seller.subscription || 'Starter';

    // Priorité : plan actif lié au seller
    if (seller.subscriptionId) {
      const activePlan = await PricingPlan.findOne({
        _id: seller.subscriptionId,
        status: { $nin: ['expired', 'cancelled'] },
      }).lean();
      if (activePlan) planName = activePlan.planType || planName;
    }

    if (!POS_ALLOWED_PLANS.includes(planName)) {
      return res.status(403).json({
        success: false,
        posBlocked: true,
        planActuel: planName,
        plansRequis: POS_ALLOWED_PLANS,
        message: `La caisse POS est réservée aux plans Pro et Business. Votre plan actuel est "${planName}".`,
      });
    }

    // Injecter le plan dans la requête pour usage dans la route
    req.sellerPlan = planName;
    next();
  } catch (err) {
    console.error('❌ Erreur vérification accès POS:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pos/vente
// Crée une vente directe (caisse physique) — Pro & Business uniquement
// 0% commission POS : le revenu de la plateforme vient de l'abonnement
// ─────────────────────────────────────────────────────────────────────────────
router.post('/vente', requirePosAccess, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const {
      sellerId,
      lignes,          // [{ produitId, nom, image, prixUnitaire, quantite, varianteLabel, couleurs, tailles }]
      remise = 0,
      modePaiement,    // ESPECES | MOBILE_MONEY | AUTRE
      montantRecu = 0,
      telephoneClient,
    } = req.body;

    if (!sellerId || !lignes?.length || !modePaiement) {
      return res.status(400).json({ success: false, message: 'Données manquantes' });
    }

    const lignesCalculees = lignes.map(l => ({
      ...l,
      sousTotal: l.prixUnitaire * l.quantite,
    }));
    const sousTotal = lignesCalculees.reduce((s, l) => s + l.sousTotal, 0);
    const total = Math.max(0, sousTotal - remise);
    const monnaie = modePaiement === 'ESPECES' ? Math.max(0, montantRecu - total) : 0;

    // Modèle SaaS : 0% commission sur les ventes POS
    // Le revenu plateforme vient de l'abonnement mensuel, pas des transactions physiques
    const commission = 0;
    const tauxCommission = 0;
    const montantNet = total;
    const planName = req.sellerPlan;

    await session.withTransaction(async () => {
      // 1. Créer la vente
      const vente = new VenteDirecte({
        sellerId,
        lignes: lignesCalculees,
        sousTotal,
        remise,
        total,
        modePaiement,
        montantRecu,
        monnaie,
        telephoneClient,
        planSnapshot: { planName, tauxCommission: 0 },
        commission: 0,
        montantNet: total,
        statut: 'COMPLETEE',
      });
      await vente.save({ session });

      // 2. Décrémenter le stock — cibler la bonne variante si applicable
      const nbrProduitsFormat = lignes.map(l => ({
        produit: l.produitId,
        quantite: l.quantite,
        couleurs: l.couleurs || [],
        tailles: l.tailles || [],
      }));
      await StockService.decrementStock(nbrProduitsFormat, { session });
    });

    const venteCreee = await VenteDirecte.findOne({ sellerId }).sort({ createdAt: -1 });

    res.status(201).json({
      success: true,
      message: 'Vente enregistrée avec succès',
      data: {
        reference: venteCreee.reference,
        total,
        montantNet: total,
        commission: 0,
        tauxCommission: 0,
        monnaie,
        modePaiement,
        lignes: lignesCalculees,
        createdAt: venteCreee.createdAt,
        sellerId,
        telephoneClient,
        planSnapshot: { planName, tauxCommission: 0 },
      },
    });
  } catch (err) {
    console.error('❌ Erreur POS vente:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pos/receipt/:reference
// Route PUBLIQUE — vérification d'authenticité d'un reçu via QR code
// ─────────────────────────────────────────────────────────────────────────────
router.get('/receipt/:reference', async (req, res) => {
  try {
    const vente = await VenteDirecte.findOne({ reference: req.params.reference })
      .populate('lignes.produitId', 'name image1');

    if (!vente) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'Reçu introuvable ou invalide',
      });
    }

    const { SellerRequest } = require('../Models');
    const seller = await SellerRequest.findById(vente.sellerId).select('storeName').lean();

    res.json({
      success: true,
      verified: true,
      data: {
        reference: vente.reference,
        storeName: seller?.storeName || 'Boutique Ihambaobab',
        total: vente.total,
        montantNet: vente.montantNet,
        modePaiement: vente.modePaiement,
        statut: vente.statut,
        lignes: vente.lignes,
        createdAt: vente.createdAt,
      },
    });
  } catch (err) {
    console.error('❌ Erreur vérification reçu:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pos/historique/:sellerId
// Historique des ventes directes du seller avec pagination
// ─────────────────────────────────────────────────────────────────────────────
router.get('/historique/:sellerId', requirePosAccess, async (req, res) => {
  try {
    const { sellerId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = { sellerId };
    if (req.query.statut)       query.statut = req.query.statut;
    if (req.query.modePaiement) query.modePaiement = req.query.modePaiement;
    if (req.query.dateStart)    query.createdAt = { $gte: new Date(req.query.dateStart) };
    if (req.query.dateEnd)      query.createdAt = { ...query.createdAt, $lte: new Date(req.query.dateEnd) };

    const [ventes, total] = await Promise.all([
      VenteDirecte.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      VenteDirecte.countDocuments(query),
    ]);

    const stats = await VenteDirecte.aggregate([
      { $match: { ...query, statut: 'COMPLETEE' } },
      { $group: {
        _id: null,
        totalCA: { $sum: '$total' },
        nombreVentes: { $sum: 1 },
      }},
    ]);

    res.json({
      success: true,
      data: {
        ventes,
        pagination: {
          page, limit, total,
          pages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
        stats: stats[0] || { totalCA: 0, nombreVentes: 0 },
      },
    });
  } catch (err) {
    console.error('❌ Erreur historique POS:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pos/annuler/:reference
// Annuler une vente directe (remet le stock uniquement — pas de portefeuille à débiter)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/annuler/:reference', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const vente = await VenteDirecte.findOne({ reference: req.params.reference });
    if (!vente) return res.status(404).json({ success: false, message: 'Vente introuvable' });
    if (vente.statut === 'ANNULEE') return res.status(400).json({ success: false, message: 'Vente déjà annulée' });

    await session.withTransaction(async () => {
      // 1. Marquer annulée
      vente.statut = 'ANNULEE';
      await vente.save({ session });

      // 2. Remettre le stock sur la bonne variante
      const nbrProduitsFormat = vente.lignes.map(l => ({
        produit: l.produitId,
        quantite: l.quantite,
        couleurs: l.couleurs || [],
        tailles: l.tailles || [],
      }));
      await StockService.incrementStock(nbrProduitsFormat, { session, isRestoration: true });

      // Pas de transaction financière à annuler — modèle SaaS, 0% commission POS
    });

    res.json({ success: true, message: 'Vente annulée avec succès' });
  } catch (err) {
    console.error('❌ Erreur annulation POS:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pos/access-check/:sellerId
// Vérifie si le seller a accès au POS — utilisé par le frontend pour l'écran upgrade
// ─────────────────────────────────────────────────────────────────────────────
router.get('/access-check/:sellerId', async (req, res) => {
  try {
    const { SellerRequest, PricingPlan } = require('../Models');
    const seller = await SellerRequest.findById(req.params.sellerId).lean();
    if (!seller) return res.status(404).json({ success: false, message: 'Seller introuvable' });

    let planName = seller.subscription || 'Starter';
    if (seller.subscriptionId) {
      const activePlan = await PricingPlan.findOne({
        _id: seller.subscriptionId,
        status: { $nin: ['expired', 'cancelled'] },
      }).lean();
      if (activePlan) planName = activePlan.planType || planName;
    }

    const hasAccess = POS_ALLOWED_PLANS.includes(planName);
    const planConfig = SUBSCRIPTION_CONFIG.PLANS[planName] || SUBSCRIPTION_CONFIG.PLANS.Starter;
    const proPlan = SUBSCRIPTION_CONFIG.PLANS.Pro;

    res.json({
      success: true,
      data: {
        hasAccess,
        planActuel: planName,
        plansRequis: POS_ALLOWED_PLANS,
        prixUpgradePro: proPlan.pricing.monthly,
        commissionMarketplace: planConfig.commission,
        // Message clair : pas de commission sur les ventes POS
        modelePOS: 'SaaS — 0% commission sur ventes physiques. Inclus dans Pro et Business.',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
