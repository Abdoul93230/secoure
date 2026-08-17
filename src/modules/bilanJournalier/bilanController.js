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

  let mkArticlesVendus = 0;
  const mkProdMap = {};
  for (const txn of txns) {
    for (const p of txn.metadata?.produits || []) {
      const key = (p.nom || 'produit').toLowerCase().trim();
      if (!mkProdMap[key]) {
        mkProdMap[key] = { id: key, nom: p.nom, image: null, quantite: 0, total: 0 };
      }
      mkProdMap[key].quantite += p.quantite || 1;
      mkProdMap[key].total += p.montant || 0;
      mkArticlesVendus += p.quantite || 1;
    }
  }

  const topProduitsPOS = Object.values(prodMap)
    .sort((a, b) => b.quantite - a.quantite)
    .slice(0, 5);

  const topProduitsMarketplace = Object.values(mkProdMap)
    .sort((a, b) => b.quantite - a.quantite)
    .slice(0, 5);

  // articlesVendus total = POS + marketplace
  const posArticlesVendus = Object.values(prodMap).reduce((sum, p) => sum + p.quantite, 0);
  const articlesVendus = posArticlesVendus + mkArticlesVendus;

  return {
    periode: { start: start.toISOString(), end: end.toISOString() },
    pos: { total: posTotal, ventes: posCount, modePaiement },
    marketplace: { total: commandeTotal, commandes: commandeCount, articlesVendus: mkArticlesVendus },
    totalGeneral: posTotal + commandeTotal,
    articlesVendus,
    topProduitsPOS,
    topProduitsMarketplace,
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

// GET /history?days=7  OU  /history?from=YYYY-MM-DD&to=YYYY-MM-DD
// Optimise : 2 pipelines agregation MongoDB en parallele (au lieu de N*2 requetes unitaires)
const getBilanHistory = async (req, res) => {
  try {
    const sellerId = req.user.id;

    let dates = [];
    if (req.query.from && req.query.to) {
      const start = new Date(req.query.from + 'T00:00:00');
      const end   = new Date(req.query.to   + 'T00:00:00');
      if (isNaN(start) || isNaN(end) || start > end)
        return res.status(400).json({ status: 'error', message: 'Dates invalides' });
      for (let d = new Date(end); d >= start && dates.length < 90; d.setDate(d.getDate() - 1)) {
        dates.push(new Date(d));
      }
      dates.reverse();
    } else {
      const days = Math.min(parseInt(req.query.days) || 7, 90);
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(new Date(d));
      }
    }

    const rangeStart = new Date(dates[0]);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(dates[dates.length - 1]);
    rangeEnd.setHours(23, 59, 59, 999);

    const [posAgg, txnAgg] = await Promise.all([
      VenteDirecte.aggregate([
        {
          $match: {
            sellerId: String(sellerId),
            statut: 'COMPLETEE',
            createdAt: { $gte: rangeStart, $lte: rangeEnd },
          },
        },
        {
          $group: {
            _id:         { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            posTotal:    { $sum: '$total' },
            posVentes:   { $sum: 1 },
            posArticles: {
              $sum: {
                $sum: {
                  $map: {
                    input: { $ifNull: ['$lignes', []] },
                    as:    'l',
                    in:    { $ifNull: ['$$l.quantite', 1] },
                  },
                },
              },
            },
          },
        },
      ]),
      Transaction.aggregate([
        {
          $match: {
            sellerId: String(sellerId),
            type: 'CREDIT_COMMANDE',
            statut: { $in: ['EN_ATTENTE', 'CONFIRME'] },
            dateTransaction: { $gte: rangeStart, $lte: rangeEnd },
          },
        },
        {
          $group: {
            _id:              { $dateToString: { format: '%Y-%m-%d', date: '$dateTransaction' } },
            commandeTotal:    { $sum: '$montant' },
            commandeIds:      { $addToSet: '$commandeId' },
            mkArticlesVendus: {
              $sum: {
                $sum: {
                  $map: {
                    input: { $ifNull: ['$metadata.produits', []] },
                    as:    'p',
                    in:    { $ifNull: ['$$p.quantite', 1] },
                  },
                },
              },
            },
          },
        },
      ]),
    ]);

    const posMap = {};
    for (const row of posAgg) posMap[row._id] = row;
    const txnMap = {};
    for (const row of txnAgg) txnMap[row._id] = row;

    const history = dates.map(d => {
      const date             = d.toISOString().split('T')[0];
      const pos              = posMap[date] || {};
      const txn              = txnMap[date] || {};
      const posTotal         = pos.posTotal          || 0;
      const posVentes        = pos.posVentes         || 0;
      const posArticles      = pos.posArticles       || 0;
      const commandeTotal    = txn.commandeTotal     || 0;
      const commandeCount    = (txn.commandeIds      || []).length;
      const mkArticlesVendus = txn.mkArticlesVendus  || 0;
      return {
        date,
        totalGeneral:     posTotal + commandeTotal,
        posTotal,
        posVentes,
        commandeTotal,
        commandeCount,
        mkArticlesVendus,
        articlesVendus:   posArticles + mkArticlesVendus,
      };
    });

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
