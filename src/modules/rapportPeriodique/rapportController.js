const VenteDirecte = require('../../models/VenteDirecte');
const Transaction = require('../../models/transactionSchema');
const CreditClient = require('../carnetCreances/CreditClient');

async function buildRapport(sellerId, start, end) {
  // ── POS ────────────────────────────────────────────────────────────────────
  const posVentes = await VenteDirecte.find({
    sellerId: String(sellerId),
    statut: 'COMPLETEE',
    createdAt: { $gte: start, $lte: end },
  }).lean();

  const posTotal = posVentes.reduce((s, v) => s + (v.total || 0), 0);

  const posMap = {};
  for (const v of posVentes) {
    for (const l of v.lignes || []) {
      const k = String(l.produitId);
      posMap[k] = posMap[k] || { nom: l.nom, image: l.image, quantite: 0, chiffre: 0 };
      posMap[k].quantite += l.quantite;
      posMap[k].chiffre += l.sousTotal || 0;
    }
  }

  // ── Commandes marketplace via Transaction ─────────────────────────────────
  // Commande.nbrProduits + Clefournisseur est sur le modèle Produit, pas dans nbrProduits.
  // La source fiable par vendeur est Transaction CREDIT_COMMANDE.
  const txns = await Transaction.find({
    sellerId: String(sellerId),
    type: 'CREDIT_COMMANDE',
    statut: { $in: ['EN_ATTENTE', 'CONFIRME'] },
    dateTransaction: { $gte: start, $lte: end },
  }).lean();

  const commandeTotal = txns.reduce((s, t) => s + (t.montant || 0), 0);
  const commandeCount = new Set(txns.map(t => String(t.commandeId))).size;

  const cmdMap = {};
  for (const txn of txns) {
    for (const p of txn.metadata?.produits || []) {
      const k = `mkt_${(p.nom || '').toLowerCase().trim()}`;
      cmdMap[k] = cmdMap[k] || { nom: p.nom, image: null, quantite: 0, chiffre: 0 };
      cmdMap[k].quantite += p.quantite || 1;
      cmdMap[k].chiffre += p.montant || 0;
    }
  }

  // ── Fusion top 5 ───────────────────────────────────────────────────────────
  const allMap = { ...posMap };
  for (const [k, v] of Object.entries(cmdMap)) {
    if (allMap[k]) { allMap[k].quantite += v.quantite; allMap[k].chiffre += v.chiffre; }
    else allMap[k] = { ...v };
  }
  const top5 = Object.values(allMap).sort((a, b) => b.quantite - a.quantite).slice(0, 5);

  // ── Créances ───────────────────────────────────────────────────────────────
  const creancesRecuperees = await CreditClient.find({
    sellerId,
    statut: 'rembourse',
    updatedAt: { $gte: start, $lte: end },
  }).lean();

  const montantRecupere = creancesRecuperees.reduce((s, c) => s + c.montantInitial, 0);

  // ── Évolution jour par jour ───────────────────────────────────────────────
  const evolution = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const dayStart = new Date(cursor); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(cursor); dayEnd.setHours(23, 59, 59, 999);

    const posD = posVentes
      .filter(v => new Date(v.createdAt) >= dayStart && new Date(v.createdAt) <= dayEnd)
      .reduce((s, v) => s + (v.total || 0), 0);

    const cmdD = txns
      .filter(t => new Date(t.dateTransaction) >= dayStart && new Date(t.dateTransaction) <= dayEnd)
      .reduce((s, t) => s + (t.montant || 0), 0);

    evolution.push({ date: cursor.toISOString().split('T')[0], pos: posD, marketplace: cmdD, total: posD + cmdD });
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    periode: { debut: start.toISOString(), fin: end.toISOString() },
    pos: { total: posTotal, ventes: posVentes.length },
    marketplace: { total: commandeTotal, commandes: commandeCount },
    totalGeneral: posTotal + commandeTotal,
    articlesVendus: Object.values(allMap).reduce((s, p) => s + p.quantite, 0),
    top5Produits: top5,
    creances: { recuperees: creancesRecuperees.length, montant: montantRecupere },
    evolution,
  };
}

// GET /mensuel?month=2026-05
const getRapportMensuel = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const monthStr = req.query.month || new Date().toISOString().slice(0, 7);
    const [year, month] = monthStr.split('-').map(Number);
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    const rapport = await buildRapport(sellerId, start, end);

    const prevStart = new Date(year, month - 2, 1, 0, 0, 0, 0);
    const prevEnd = new Date(year, month - 1, 0, 23, 59, 59, 999);
    const rapportPrev = await buildRapport(sellerId, prevStart, prevEnd);

    const variation = rapportPrev.totalGeneral > 0
      ? Math.round(((rapport.totalGeneral - rapportPrev.totalGeneral) / rapportPrev.totalGeneral) * 100)
      : null;

    return res.json({
      status: 'success',
      data: { ...rapport, moisPrecedent: { total: rapportPrev.totalGeneral, variation } },
    });
  } catch (err) {
    console.error('getRapportMensuel error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// GET /hebdo
const getRapportHebdo = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const now = new Date();
    const dayOfWeek = now.getDay() || 7;
    const start = new Date(now);
    start.setDate(now.getDate() - dayOfWeek + 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    const rapport = await buildRapport(sellerId, start, end);
    return res.json({ status: 'success', data: rapport });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

module.exports = { getRapportMensuel, getRapportHebdo };
