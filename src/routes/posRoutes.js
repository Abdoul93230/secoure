const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const VenteDirecte = require('../models/VenteDirecte');
const StockService = require('../services/stockService');
const SUBSCRIPTION_CONFIG = require('../config/subscriptionConfig');
const { AGENT_PRIVATE_KEY, requireAgent, requireSeller } = require('../middleware/auth');

// ─── Middleware : extrait sellerId depuis token seller OU token agent ─────────
// Pour les ventes : un caissier agent peut vendre au nom de la boutique.
// req.resolvedSellerId est toujours l'ID de la boutique propriétaire.
async function extractPosSeller(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: "Token d'authentification requis" });
  }
  const token = authHeader.substring(7);

  // 1. Essayer token agent
  try {
    const decoded = jwt.verify(token, AGENT_PRIVATE_KEY);
    if (decoded.role === 'agent') {
      const { SellerAgent } = require('../Models');
      const agent = await SellerAgent.findById(decoded.agentId).lean();
      if (!agent || !agent.isActive) {
        return res.status(403).json({ success: false, message: 'Ce compte agent est désactivé' });
      }
      req.resolvedSellerId = String(agent.storeId);
      req.agentId          = String(agent._id);
      req.isAgent          = true;
      return next();
    }
  } catch (_) { /* pas un token agent */ }

  // 2. Seller classique — sellerId vient du body (comportement existant)
  req.isAgent = false;
  return next();
}

// ─── Middleware : résoudre et injecter le plan du seller ──────────────────────
// La caisse POS est disponible pour tous les plans — ce middleware injecte
// uniquement req.sellerPlan pour usage dans les routes (commissions, etc.)
async function requirePosAccess(req, res, next) {
  try {
    const sellerId = req.resolvedSellerId || req.body.sellerId || req.params.sellerId;
    if (!sellerId) return res.status(400).json({ success: false, message: 'sellerId manquant' });

    const { SellerRequest, PricingPlan } = require('../Models');
    const seller = await SellerRequest.findById(sellerId).lean();
    if (!seller) return res.status(404).json({ success: false, message: 'Seller introuvable' });

    let planName = seller.subscription || 'Starter';

    if (seller.subscriptionId) {
      const activePlan = await PricingPlan.findOne({
        _id: seller.subscriptionId,
        status: { $nin: ['expired', 'cancelled'] },
      }).lean();
      if (activePlan) planName = activePlan.planType || planName;
    }

    if (!SUBSCRIPTION_CONFIG.hasPosAccess(planName)) {
      return res.status(403).json({
        success: false,
        posBlocked: true,
        planActuel: planName,
        message: `La caisse POS n'est pas disponible pour le plan "${planName}".`,
      });
    }

    req.sellerPlan = planName;
    next();
  } catch (err) {
    console.error('❌ Erreur vérification accès POS:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pos/vente
// Crée une vente directe (caisse physique) — tous les plans
// 0% commission POS : le revenu de la plateforme vient de l'abonnement
// ─────────────────────────────────────────────────────────────────────────────
router.post('/vente', extractPosSeller, requirePosAccess, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const {
      lignes,          // [{ produitId, nom, image, prixUnitaire, quantite, varianteLabel, couleurs, tailles }]
      remise = 0,
      modePaiement,    // ESPECES | MOBILE_MONEY | AUTRE
      montantRecu = 0,
      telephoneClient,
      referenceOffline, // référence pré-générée côté mobile (vente offline)
    } = req.body;

    // Si token agent → sellerId = storeId de l'agent, sinon vient du body
    const sellerId = req.resolvedSellerId || req.body.sellerId;

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
        // Référence pré-générée offline — respectée par le pre('validate') qui ne l'écrase pas si déjà définie
        ...(referenceOffline ? { reference: referenceOffline } : {}),
        // Traçabilité agent
        ...(req.agentId ? { agentId: req.agentId } : {}),
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

    // Notifie l'app mobile du vendeur que le bilan a changé
    try {
      const io = req.app?.get?.('io');
      const heartbeatCache = require('../services/heartbeatCache');
      heartbeatCache.invalidate(sellerId);
      if (io) {
        io.to(`seller:${sellerId}`).emit('bilan_updated', {
          source: 'pos',
          total,
          createdAt: venteCreee.createdAt,
        });
      }
    } catch (_) {}

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

    const baseQuery = { sellerId };
    if (req.query.dateStart || req.query.dateEnd) {
      baseQuery.createdAt = query.createdAt;
    }

    const [ventes, total, statsAgg, topArticlesAgg, annulCount] = await Promise.all([
      VenteDirecte.find(query).populate('agentId', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit),
      VenteDirecte.countDocuments(query),
      VenteDirecte.aggregate([
        { $match: { ...baseQuery, statut: 'COMPLETEE' } },
        { $group: {
          _id: null,
          totalCA:       { $sum: '$total' },
          nombreVentes:  { $sum: 1 },
          totalEspeces:  { $sum: { $cond: [{ $eq: ['$modePaiement', 'ESPECES'] },      '$total', 0] } },
          totalMobile:   { $sum: { $cond: [{ $eq: ['$modePaiement', 'MOBILE_MONEY'] }, '$total', 0] } },
          panierMoyen:   { $avg: '$total' },
        }},
      ]),
      VenteDirecte.aggregate([
        { $match: { ...baseQuery, statut: 'COMPLETEE' } },
        { $unwind: '$lignes' },
        { $group: {
          _id:   '$lignes.nom',
          image: { $first: '$lignes.image' },
          qte:   { $sum: '$lignes.quantite' },
          ca:    { $sum: '$lignes.sousTotal' },
        }},
        { $sort: { ca: -1 } },
        { $limit: 5 },
        { $project: { _id: 0, nom: '$_id', image: 1, qte: 1, ca: 1 } },
      ]),
      VenteDirecte.countDocuments({ ...baseQuery, statut: 'ANNULEE' }),
    ]);

    const s = statsAgg[0] || {};
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
        stats: {
          totalCA:       s.totalCA      || 0,
          nombreVentes:  s.nombreVentes || 0,
          totalEspeces:  s.totalEspeces || 0,
          totalMobile:   s.totalMobile  || 0,
          panierMoyen:   s.panierMoyen  ? Math.round(s.panierMoyen) : 0,
          nombreAnnulations: annulCount || 0,
          topArticles:   topArticlesAgg,
        },
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pos/agent/historique
// Historique des ventes de l'agent connecté — paginé, filtrable par statut
// ─────────────────────────────────────────────────────────────────────────────
router.get('/agent/historique', requireAgent, async (req, res) => {
  try {
    const { Types } = mongoose;
    // sellerId est stocké comme String dans VenteDirecte — ne pas convertir en ObjectId
    const agentId  = Types.ObjectId.isValid(req.agent.id) ? new Types.ObjectId(req.agent.id) : req.agent.id;
    const sellerId = String(req.agent.storeId);

    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;

    const baseQuery = { sellerId, agentId };
    if (req.query.dateStart) baseQuery.createdAt = { $gte: new Date(req.query.dateStart) };
    if (req.query.dateEnd)   baseQuery.createdAt = { ...baseQuery.createdAt, $lte: new Date(req.query.dateEnd) };

    const query = { ...baseQuery };
    if (req.query.statut) query.statut = req.query.statut;

    // Ventes paginées + total en parallèle avec les stats (page 1 seulement)
    const [ventes, total, facetResult] = await Promise.all([
      VenteDirecte.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      VenteDirecte.countDocuments(query),
      page === 1
        ? VenteDirecte.aggregate([
            { $match: baseQuery },
            { $facet: {
              completees: [
                { $match: { statut: 'COMPLETEE' } },
                { $group: {
                  _id:          null,
                  totalCA:      { $sum: '$total' },
                  nombreVentes: { $sum: 1 },
                  totalEspeces: { $sum: { $cond: [{ $eq: ['$modePaiement', 'ESPECES'] },      '$total', 0] } },
                  totalMobile:  { $sum: { $cond: [{ $eq: ['$modePaiement', 'MOBILE_MONEY'] }, '$total', 0] } },
                  panierMoyen:  { $avg: '$total' },
                }},
              ],
              topArticles: [
                { $match: { statut: 'COMPLETEE' } },
                { $unwind: '$lignes' },
                { $group: {
                  _id:   '$lignes.nom',
                  image: { $first: '$lignes.image' },
                  qte:   { $sum: '$lignes.quantite' },
                  ca:    { $sum: '$lignes.sousTotal' },
                }},
                { $sort: { ca: -1 } },
                { $limit: 5 },
                { $project: { _id: 0, nom: '$_id', image: 1, qte: 1, ca: 1 } },
              ],
              annulees: [
                { $match: { statut: 'ANNULEE' } },
                { $count: 'count' },
              ],
            }},
          ])
        : Promise.resolve(null),
    ]);

    const pages   = Math.ceil(total / limit);
    const hasNext = page < pages;

    let stats = null;
    if (page === 1 && facetResult) {
      const f  = facetResult[0] || {};
      const s  = (f.completees || [])[0] || {};
      const annulCount = (f.annulees || [])[0]?.count || 0;
      stats = {
        totalCA:           s.totalCA      || 0,
        nombreVentes:      s.nombreVentes || 0,
        totalEspeces:      s.totalEspeces || 0,
        totalMobile:       s.totalMobile  || 0,
        panierMoyen:       s.panierMoyen  ? Math.round(s.panierMoyen) : 0,
        nombreAnnulations: annulCount,
        topArticles:       f.topArticles  || [],
      };
    }

    res.json({
      success: true,
      data: { ventes, pagination: { page, limit, total, pages, hasNext }, stats },
    });
  } catch (err) {
    console.error('❌ Erreur historique agent POS:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pos/agent/annuler/:reference
// Annulation d'une vente par l'agent — ownership vérifié + délai 24h
// ─────────────────────────────────────────────────────────────────────────────
router.post('/agent/annuler/:reference', requireAgent, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const vente = await VenteDirecte.findOne({ reference: req.params.reference });
    if (!vente) return res.status(404).json({ success: false, message: 'Vente introuvable' });

    // Vérification ownership agent
    if (String(vente.agentId) !== String(req.agent.id)) {
      return res.status(403).json({ success: false, message: 'Vous ne pouvez annuler que vos propres ventes' });
    }

    // Vérification appartenance à la boutique de l'agent
    if (String(vente.sellerId) !== String(req.agent.storeId)) {
      return res.status(403).json({ success: false, message: 'Vente non associée à votre boutique' });
    }

    // Vérification statut
    if (vente.statut === 'ANNULEE') {
      return res.status(400).json({ success: false, message: 'Vente déjà annulée' });
    }

    // Vérification délai 24h
    const delai24h = 24 * 60 * 60 * 1000;
    if (Date.now() - new Date(vente.createdAt).getTime() > delai24h) {
      return res.status(403).json({ success: false, message: 'Annulation impossible après 24h' });
    }

    await session.withTransaction(async () => {
      // 1. Marquer annulée
      vente.statut = 'ANNULEE';
      await vente.save({ session });

      // 2. Remettre le stock sur la bonne variante
      const nbrProduitsFormat = vente.lignes.map(l => ({
        produit:  l.produitId,
        quantite: l.quantite,
        couleurs: l.couleurs || [],
        tailles:  l.tailles  || [],
      }));
      await StockService.incrementStock(nbrProduitsFormat, { session, isRestoration: true });
    });

    res.json({ success: true, message: 'Vente annulée avec succès' });
  } catch (err) {
    console.error('❌ Erreur annulation agent POS:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pos/seller/agents-stats
// Performances de tous les agents de la boutique — visible par le seller
// Query params : dateStart, dateEnd (ISO strings)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/seller/agents-stats', requireSeller, async (req, res) => {
  try {
    // sellerId est stocké comme String dans VenteDirecte — ne pas convertir en ObjectId
    const sellerId = String(req.user.id);

    const baseQuery = { sellerId };
    if (req.query.dateStart) baseQuery.createdAt = { $gte: new Date(req.query.dateStart) };
    if (req.query.dateEnd)   baseQuery.createdAt = { ...baseQuery.createdAt, $lte: new Date(req.query.dateEnd) };

    // Stats globales boutique POS
    const [globalStats, agentStats, topArticles] = await Promise.all([
      VenteDirecte.aggregate([
        { $match: { ...baseQuery, statut: 'COMPLETEE' } },
        { $group: {
          _id: null,
          totalCA:      { $sum: '$total' },
          nombreVentes: { $sum: 1 },
          totalEspeces: { $sum: { $cond: [{ $eq: ['$modePaiement', 'ESPECES'] },      '$total', 0] } },
          totalMobile:  { $sum: { $cond: [{ $eq: ['$modePaiement', 'MOBILE_MONEY'] }, '$total', 0] } },
          panierMoyen:  { $avg: '$total' },
        }},
      ]),
      // Stats par agent
      VenteDirecte.aggregate([
        { $match: { ...baseQuery, agentId: { $exists: true, $ne: null } } },
        { $group: {
          _id:           '$agentId',
          totalCA:       { $sum: { $cond: [{ $eq: ['$statut', 'COMPLETEE'] }, '$total', 0] } },
          nombreVentes:  { $sum: { $cond: [{ $eq: ['$statut', 'COMPLETEE'] }, 1, 0] } },
          nombreAnnul:   { $sum: { $cond: [{ $eq: ['$statut', 'ANNULEE']   }, 1, 0] } },
          panierMoyen:   { $avg: { $cond: [{ $eq: ['$statut', 'COMPLETEE'] }, '$total', null] } },
          totalEspeces:  { $sum: { $cond: [{ $and: [{ $eq: ['$statut', 'COMPLETEE'] }, { $eq: ['$modePaiement', 'ESPECES'] }] },      '$total', 0] } },
          totalMobile:   { $sum: { $cond: [{ $and: [{ $eq: ['$statut', 'COMPLETEE'] }, { $eq: ['$modePaiement', 'MOBILE_MONEY'] }] }, '$total', 0] } },
          derniereVente: { $max: '$createdAt' },
        }},
      ]),
      // Top 5 articles toute boutique
      VenteDirecte.aggregate([
        { $match: { ...baseQuery, statut: 'COMPLETEE' } },
        { $unwind: '$lignes' },
        { $group: { _id: '$lignes.nom', image: { $first: '$lignes.image' }, qte: { $sum: '$lignes.quantite' }, ca: { $sum: '$lignes.sousTotal' } } },
        { $sort: { ca: -1 } }, { $limit: 5 },
        { $project: { _id: 0, nom: '$_id', image: 1, qte: 1, ca: 1 } },
      ]),
    ]);

    // Récupère les infos des agents (nom, téléphone) depuis SellerAgent
    const { SellerAgent } = require('../Models');
    const agentIds = agentStats.map(a => a._id).filter(Boolean);
    const agents = agentIds.length
      ? await SellerAgent.find({ _id: { $in: agentIds } }).select('name phone isActive').lean()
      : [];
    const agentMap = Object.fromEntries(agents.map(a => [String(a._id), a]));

    const agentsFormatted = agentStats.map(a => ({
      agentId:      String(a._id),
      nom:          agentMap[String(a._id)]?.name  || 'Agent inconnu',
      telephone:    agentMap[String(a._id)]?.phone || '',
      isActive:     agentMap[String(a._id)]?.isActive ?? false,
      totalCA:      a.totalCA      || 0,
      nombreVentes: a.nombreVentes || 0,
      nombreAnnul:  a.nombreAnnul  || 0,
      panierMoyen:  a.panierMoyen  ? Math.round(a.panierMoyen) : 0,
      totalEspeces: a.totalEspeces || 0,
      totalMobile:  a.totalMobile  || 0,
      derniereVente: a.derniereVente || null,
    })).sort((a, b) => b.totalCA - a.totalCA); // tri par CA décroissant

    const annulCount = await VenteDirecte.countDocuments({ ...baseQuery, statut: 'ANNULEE' });
    const g = globalStats[0] || {};

    res.json({
      success: true,
      data: {
        global: {
          totalCA:           g.totalCA      || 0,
          nombreVentes:      g.nombreVentes || 0,
          totalEspeces:      g.totalEspeces || 0,
          totalMobile:       g.totalMobile  || 0,
          panierMoyen:       g.panierMoyen  ? Math.round(g.panierMoyen) : 0,
          nombreAnnulations: annulCount     || 0,
          topArticles,
        },
        agents: agentsFormatted,
      },
    });
  } catch (err) {
    console.error('❌ Erreur agents-stats POS:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/pos/seller/agents-stats/all-periods
// Toutes les périodes en un seul appel — agents fetched une fois, agrégations en parallèle
router.get('/seller/agents-stats/all-periods', requireSeller, async (req, res) => {
  try {
    const sellerId = String(req.user.id);
    const { SellerAgent } = require('../Models');

    const PERIODS = { '1': 1, '7': 7, '30': 30, '90': 90 };

    // Agents fetched une seule fois
    const buildRange = (days) => {
      const end   = new Date(); end.setHours(23, 59, 59, 999);
      const start = new Date(); start.setDate(start.getDate() - (days - 1)); start.setHours(0, 0, 0, 0);
      return { $gte: start, $lte: end };
    };

    const computePeriod = async (days) => {
      const createdAt   = buildRange(days);
      const baseQuery   = { sellerId, createdAt };

      const [globalStats, agentStats, topArticles, annulCount] = await Promise.all([
        VenteDirecte.aggregate([
          { $match: { ...baseQuery, statut: 'COMPLETEE' } },
          { $group: { _id: null, totalCA: { $sum: '$total' }, nombreVentes: { $sum: 1 },
              totalEspeces: { $sum: { $cond: [{ $eq: ['$modePaiement', 'ESPECES'] },      '$total', 0] } },
              totalMobile:  { $sum: { $cond: [{ $eq: ['$modePaiement', 'MOBILE_MONEY'] }, '$total', 0] } },
              panierMoyen:  { $avg: '$total' } } },
        ]),
        VenteDirecte.aggregate([
          { $match: { ...baseQuery, agentId: { $exists: true, $ne: null } } },
          { $group: { _id: '$agentId',
              totalCA:       { $sum: { $cond: [{ $eq: ['$statut', 'COMPLETEE'] }, '$total', 0] } },
              nombreVentes:  { $sum: { $cond: [{ $eq: ['$statut', 'COMPLETEE'] }, 1, 0] } },
              nombreAnnul:   { $sum: { $cond: [{ $eq: ['$statut', 'ANNULEE']   }, 1, 0] } },
              panierMoyen:   { $avg: { $cond: [{ $eq: ['$statut', 'COMPLETEE'] }, '$total', null] } },
              totalEspeces:  { $sum: { $cond: [{ $and: [{ $eq: ['$statut', 'COMPLETEE'] }, { $eq: ['$modePaiement', 'ESPECES'] }] },      '$total', 0] } },
              totalMobile:   { $sum: { $cond: [{ $and: [{ $eq: ['$statut', 'COMPLETEE'] }, { $eq: ['$modePaiement', 'MOBILE_MONEY'] }] }, '$total', 0] } },
              derniereVente: { $max: '$createdAt' } } },
        ]),
        VenteDirecte.aggregate([
          { $match: { ...baseQuery, statut: 'COMPLETEE' } },
          { $unwind: '$lignes' },
          { $group: { _id: '$lignes.nom', image: { $first: '$lignes.image' }, qte: { $sum: '$lignes.quantite' }, ca: { $sum: '$lignes.sousTotal' } } },
          { $sort: { ca: -1 } }, { $limit: 5 },
          { $project: { _id: 0, nom: '$_id', image: 1, qte: 1, ca: 1 } },
        ]),
        VenteDirecte.countDocuments({ ...baseQuery, statut: 'ANNULEE' }),
      ]);

      return { globalStats, agentStats, topArticles, annulCount };
    };

    // Fetch agents + toutes périodes en parallèle
    const periodKeys = Object.keys(PERIODS);
    const [agentDocs, ...periodResults] = await Promise.all([
      SellerAgent.find({ sellerId }).select('name phone isActive').lean(),
      ...periodKeys.map(k => computePeriod(PERIODS[k])),
    ]);

    const agentMap = Object.fromEntries(agentDocs.map(a => [String(a._id), a]));

    const formatPeriod = ({ globalStats, agentStats, topArticles, annulCount }) => {
      const g = globalStats[0] || {};
      const agents = agentStats.map(a => ({
        agentId:      String(a._id),
        nom:          agentMap[String(a._id)]?.name  || 'Agent inconnu',
        telephone:    agentMap[String(a._id)]?.phone || '',
        isActive:     agentMap[String(a._id)]?.isActive ?? false,
        totalCA:      a.totalCA      || 0,
        nombreVentes: a.nombreVentes || 0,
        nombreAnnul:  a.nombreAnnul  || 0,
        panierMoyen:  a.panierMoyen  ? Math.round(a.panierMoyen) : 0,
        totalEspeces: a.totalEspeces || 0,
        totalMobile:  a.totalMobile  || 0,
        derniereVente: a.derniereVente || null,
      })).sort((a, b) => b.totalCA - a.totalCA);

      return {
        global: {
          totalCA:           g.totalCA      || 0,
          nombreVentes:      g.nombreVentes || 0,
          totalEspeces:      g.totalEspeces || 0,
          totalMobile:       g.totalMobile  || 0,
          panierMoyen:       g.panierMoyen  ? Math.round(g.panierMoyen) : 0,
          nombreAnnulations: annulCount     || 0,
          topArticles,
        },
        agents,
      };
    };

    const byPeriod = {};
    periodKeys.forEach((k, i) => { byPeriod[PERIODS[k]] = formatPeriod(periodResults[i]); });

    res.json({ success: true, data: byPeriod });
  } catch (err) {
    console.error('❌ Erreur agents-stats all-periods:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
