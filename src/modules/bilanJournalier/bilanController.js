const VenteDirecte = require('../../models/VenteDirecte');
const Transaction = require('../../models/transactionSchema');

async function aggregateBilan(sellerId, startDate, endDate) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  // ── POS ────────────────────────────────────────────────────────────────────
  const posVentes = await VenteDirecte.find({
    sellerId: String(sellerId),
    statut: 'COMPLETEE',
    createdAt: { $gte: start, $lte: end },
  }).lean();

  const posTotal = posVentes.reduce((sum, v) => sum + (v.total || 0), 0);
  const posCount = posVentes.length;

  const modePaiement = { ESPECES: 0, MOBILE_MONEY: 0, AUTRE: 0 };
  for (const vente of posVentes) {
    const mode = vente.modePaiement || 'AUTRE';
    modePaiement[mode] = (modePaiement[mode] || 0) + (vente.total || 0);
  }

  const prodMap = {};
  for (const vente of posVentes) {
    for (const ligne of vente.lignes || []) {
      const key = (ligne.nom || String(ligne.produitId)).toLowerCase().trim();
      if (!prodMap[key]) {
        prodMap[key] = { id: String(ligne.produitId), nom: ligne.nom, image: ligne.image, quantite: 0, total: 0 };
      }
      prodMap[key].quantite += ligne.quantite;
      prodMap[key].total += ligne.sousTotal || ligne.prixUnitaire * ligne.quantite;
    }
  }

  // ── Commandes marketplace via Transaction ─────────────────────────────────
  // La Commande utilise nbrProduits[] + Clefournisseur sur le modèle Produit.
  // La source fiable par vendeur est la Transaction CREDIT_COMMANDE.
  const txns = await Transaction.find({
    sellerId: String(sellerId),
    type: 'CREDIT_COMMANDE',
    statut: { $in: ['EN_ATTENTE', 'CONFIRME'] },
    dateTransaction: { $gte: start, $lte: end },
  }).lean();

  const commandeTotal = txns.reduce((s, t) => s + (t.montant || 0), 0);
  const commandeCount = new Set(txns.map(t => String(t.commandeId))).size;

  for (const txn of txns) {
    for (const p of txn.metadata?.produits || []) {
      const key = (p.nom || 'produit').toLowerCase().trim();
      if (!prodMap[key]) {
        prodMap[key] = { id: key, nom: p.nom, image: null, quantite: 0, total: 0 };
      }
      prodMap[key].quantite += p.quantite || 1;
      prodMap[key].total += p.montant || 0;
    }
  }

  const topProduits = Object.values(prodMap)
    .sort((a, b) => b.quantite - a.quantite)
    .slice(0, 5);

  const articlesVendus = Object.values(prodMap).reduce((sum, p) => sum + p.quantite, 0);

  return {
    periode: { start: start.toISOString(), end: end.toISOString() },
    pos: { total: posTotal, ventes: posCount, modePaiement },
    marketplace: { total: commandeTotal, commandes: commandeCount },
    totalGeneral: posTotal + commandeTotal,
    articlesVendus,
    topProduits,
  };
}

// GET /today
const getBilanToday = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const today = new Date();
    const bilan = await aggregateBilan(sellerId, today, today);
    return res.json({ status: 'success', data: bilan });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// GET /history?days=7
const getBilanHistory = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const days = Math.min(parseInt(req.query.days) || 7, 90);

    const history = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const bilan = await aggregateBilan(sellerId, d, d);
      history.push({
        date: d.toISOString().split('T')[0],
        totalGeneral:  bilan.totalGeneral,
        posTotal:      bilan.pos.total,
        posVentes:     bilan.pos.ventes,
        commandeTotal: bilan.marketplace.total,
        articlesVendus: bilan.articlesVendus,
      });
    }

    return res.json({ status: 'success', data: history });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// GET /range?from=YYYY-MM-DD&to=YYYY-MM-DD
const getBilanRange = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const from = req.query.from ? new Date(req.query.from) : new Date();
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const bilan = await aggregateBilan(sellerId, from, to);
    return res.json({ status: 'success', data: bilan });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

module.exports = { getBilanToday, getBilanHistory, getBilanRange };
