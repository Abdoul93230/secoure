/**
 * Routes agents caissier — /api/agents
 *
 * Toutes les routes CRUD nécessitent requireSeller (le propriétaire de la boutique).
 * La route de login /api/agents/login est publique (retourne un token agent).
 *
 * Quota par plan :
 *   Starter  → 0 agent
 *   Pro      → 2 agents
 *   Business → 6 agents
 */
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { SellerAgent, PricingPlan, SellerRequest } = require('../Models');
const { AGENT_PRIVATE_KEY, requireSeller } = require('../middleware/auth');

// Quota par plan
const AGENT_QUOTA = { Starter: 0, Pro: 2, Business: 6 };

// Helper : récupère le planType actif du seller
async function getSellerPlanType(sellerId) {
  const seller = await SellerRequest.findById(sellerId).lean();
  if (!seller) return 'Starter';
  let planType = seller.subscription || 'Starter';
  if (seller.subscriptionId) {
    const activePlan = await PricingPlan.findOne({
      _id: seller.subscriptionId,
      status: { $nin: ['expired', 'cancelled'] },
    }).lean();
    if (activePlan) planType = activePlan.planType || planType;
  }
  return planType;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agents/verify
// Pré-vérification (public) : vérifie boutique + agent SANS le PIN
// Retourne le nom de l'agent et de la boutique pour confirmation à l'écran
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify', async (req, res) => {
  try {
    const { storePhone, phone } = req.body;
    if (!storePhone || !phone) {
      return res.status(400).json({ success: false, message: 'storePhone et phone requis' });
    }

    const seller = await SellerRequest.findOne({ phone: storePhone }).select('_id storeName').lean();
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Aucune boutique trouvée pour ce numéro' });
    }

    const planType = await getSellerPlanType(String(seller._id));
    if (!['Pro', 'Business'].includes(planType)) {
      return res.status(403).json({ success: false, message: 'Cette boutique ne dispose pas de l\'espace caissier' });
    }

    const agent = await SellerAgent.findOne({ storeId: seller._id, phone }).select('name isActive').lean();
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Numéro de téléphone non reconnu dans cette boutique' });
    }
    if (!agent.isActive) {
      return res.status(403).json({ success: false, message: 'Ce compte agent est désactivé' });
    }

    return res.json({
      success: true,
      data: {
        agentName:  agent.name,
        storeName:  seller.storeName,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agents/login
// Login agent (public) : phone + PIN → token agent JWT
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { storeId, storePhone, phone, pin } = req.body;
    if ((!storeId && !storePhone) || !phone || !pin) {
      return res.status(400).json({ success: false, message: 'storeId (ou storePhone), phone et pin requis' });
    }

    // Résolution du storeId depuis le numéro de téléphone du vendeur si fourni
    let resolvedStoreId = storeId;
    if (!resolvedStoreId && storePhone) {
      const seller = await SellerRequest.findOne({ phone: storePhone }).select('_id').lean();
      if (!seller) {
        return res.status(404).json({ success: false, message: 'Boutique introuvable pour ce numéro de téléphone' });
      }
      resolvedStoreId = String(seller._id);
    }

    const agent = await SellerAgent.findOne({ storeId: resolvedStoreId, phone }).lean();
    if (!agent) {
      return res.status(401).json({ success: false, message: 'Numéro de téléphone introuvable pour cette boutique' });
    }
    if (!agent.isActive) {
      return res.status(403).json({ success: false, message: 'Ce compte agent est désactivé' });
    }

    const pinOk = await bcrypt.compare(String(pin), agent.pin);
    if (!pinOk) {
      return res.status(401).json({ success: false, message: 'PIN incorrect' });
    }

    // Vérifier que la boutique a bien accès au POS
    const planType = await getSellerPlanType(resolvedStoreId);
    if (!['Pro', 'Business'].includes(planType)) {
      return res.status(403).json({ success: false, message: 'La boutique ne dispose pas du plan POS requis' });
    }

    // Récupère le nom de la boutique pour l'afficher dans l'app agent
    const seller = await SellerRequest.findById(resolvedStoreId).select('storeName logo').lean();

    const token = jwt.sign(
      { agentId: String(agent._id), storeId: String(resolvedStoreId), role: 'agent' },
      AGENT_PRIVATE_KEY,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      data: {
        token,
        agent: {
          id:        String(agent._id),
          name:      agent.name,
          role:      agent.role,
          storeId:   String(resolvedStoreId),
          storeName: seller?.storeName || '',
          storeLogo: seller?.logo || null,
        },
      },
    });
  } catch (err) {
    console.error('❌ Agent login error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Toutes les routes suivantes nécessitent que le seller soit connecté
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/agents — liste les agents de la boutique du seller connecté
router.get('/', requireSeller, async (req, res) => {
  try {
    const sellerId = req.user.id;
    const agents = await SellerAgent.find({ storeId: sellerId })
      .select('-pin')
      .sort({ createdAt: -1 })
      .lean();

    const planType = await getSellerPlanType(sellerId);
    const quota    = AGENT_QUOTA[planType] ?? 0;
    const activeCount = agents.filter(a => a.isActive).length;

    return res.json({
      success: true,
      data: {
        agents,
        quota,
        activeCount,
        planType,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/agents — créer un agent
router.post('/', requireSeller, async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { name, phone, pin } = req.body;

    if (!name || !phone || !pin) {
      return res.status(400).json({ success: false, message: 'name, phone et pin (4 chiffres) requis' });
    }
    if (!/^\d{4}$/.test(String(pin))) {
      return res.status(400).json({ success: false, message: 'Le PIN doit être composé de 4 chiffres' });
    }

    const planType = await getSellerPlanType(sellerId);
    const quota    = AGENT_QUOTA[planType] ?? 0;

    if (quota === 0) {
      return res.status(403).json({
        success: false,
        message: `Votre plan ${planType} ne permet pas de créer des agents. Passez au plan Pro ou Business.`,
        upgradeRequired: true,
      });
    }

    const activeCount = await SellerAgent.countDocuments({ storeId: sellerId, isActive: true });
    if (activeCount >= quota) {
      return res.status(403).json({
        success: false,
        message: `Vous avez atteint la limite de ${quota} agent(s) pour le plan ${planType}.`,
        quota,
        activeCount,
      });
    }

    // Vérifier unicité téléphone dans la boutique
    const existing = await SellerAgent.findOne({ storeId: sellerId, phone });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Un agent avec ce numéro existe déjà dans votre boutique' });
    }

    const hashedPin = await bcrypt.hash(String(pin), 10);
    const agent = await SellerAgent.create({
      storeId: sellerId,
      name: name.trim(),
      phone,
      pin: hashedPin,
      role: 'caissier',
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: 'Agent créé avec succès',
      data: {
        id:       String(agent._id),
        name:     agent.name,
        phone:    agent.phone,
        role:     agent.role,
        isActive: agent.isActive,
        storeId:  String(agent.storeId),
        createdAt: agent.createdAt,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Un agent avec ce numéro existe déjà dans votre boutique' });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/agents/:agentId — activer/désactiver ou modifier un agent
router.patch('/:agentId', requireSeller, async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { agentId } = req.params;
    const { name, phone, pin, isActive } = req.body;

    const agent = await SellerAgent.findOne({ _id: agentId, storeId: sellerId });
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent introuvable' });
    }

    // Si on réactive et que le quota est déjà atteint → refus
    if (isActive === true && !agent.isActive) {
      const planType    = await getSellerPlanType(sellerId);
      const quota       = AGENT_QUOTA[planType] ?? 0;
      const activeCount = await SellerAgent.countDocuments({ storeId: sellerId, isActive: true });
      if (activeCount >= quota) {
        return res.status(403).json({
          success: false,
          message: `Limite de ${quota} agent(s) atteinte pour le plan ${planType}.`,
          quota, activeCount,
        });
      }
    }

    if (name  !== undefined) agent.name   = name.trim();
    if (phone !== undefined) agent.phone  = phone;
    if (isActive !== undefined) agent.isActive = Boolean(isActive);
    if (pin !== undefined) {
      if (!/^\d{4}$/.test(String(pin))) {
        return res.status(400).json({ success: false, message: 'Le PIN doit être composé de 4 chiffres' });
      }
      agent.pin = await bcrypt.hash(String(pin), 10);
    }

    await agent.save();

    return res.json({
      success: true,
      message: 'Agent mis à jour',
      data: {
        id:       String(agent._id),
        name:     agent.name,
        phone:    agent.phone,
        role:     agent.role,
        isActive: agent.isActive,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/agents/:agentId — supprime définitivement un agent
router.delete('/:agentId', requireSeller, async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { agentId } = req.params;

    const deleted = await SellerAgent.findOneAndDelete({ _id: agentId, storeId: sellerId });
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Agent introuvable' });
    }

    return res.json({ success: true, message: 'Agent supprimé' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
