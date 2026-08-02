const VenteDirecte = require('../../models/VenteDirecte');
const Transaction = require('../../models/transactionSchema');
const { Produit } = require('../../Models');

const PERIOD_DAYS = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };

// ── Calcule les bornes temporelles pour une période ──────────────────────────
function buildRange(period, from, to) {
  if (from && to) {
    const since = new Date(from); since.setHours(0, 0, 0, 0);
    const until = new Date(to);   until.setHours(23, 59, 59, 999);
    return { since, until, days: Math.round((until - since) / 86400000) + 1 };
  }
  const days  = PERIOD_DAYS[period] || 30;
  const since = new Date(); since.setDate(since.getDate() - days); since.setHours(0, 0, 0, 0);
  const until = new Date(); until.setHours(23, 59, 59, 999);
  return { since, until, days };
}

// ── Agrège POS + marketplace sur une plage, retourne les données de la période
async function computePeriod(sellerId, since, until, days, allProduits, getImage) {
  const [posVentes, txns] = await Promise.all([
    VenteDirecte.find({ sellerId: String(sellerId), statut: 'COMPLETEE', createdAt: { $gte: since, $lte: until } }).lean(),
    Transaction.find({ sellerId: String(sellerId), type: 'CREDIT_COMMANDE', statut: { $in: ['EN_ATTENTE', 'CONFIRME'] }, dateTransaction: { $gte: since, $lte: until } }).lean(),
  ]);

  const prodMap = {};
  const touch = (key, nom, image, prix) => {
    if (!prodMap[key]) prodMap[key] = { id: key, nom, image, prix: prix || 0, quantite: 0, chiffre: 0, sources: new Set() };
  };

  let posChiffre = 0, posQuantite = 0;
  for (const vente of posVentes) {
    for (const ligne of vente.lignes || []) {
      const key = String(ligne.produitId);
      touch(key, ligne.nom, ligne.image, ligne.prixUnitaire);
      const montant = ligne.sousTotal || ligne.prixUnitaire * ligne.quantite;
      prodMap[key].quantite += ligne.quantite;
      prodMap[key].chiffre  += montant;
      prodMap[key].sources.add('POS');
      posQuantite += ligne.quantite;
      posChiffre  += montant;
    }
  }

  let mkChiffre = 0, mkQuantite = 0;
  for (const txn of txns) {
    for (const p of txn.metadata?.produits || []) {
      const key = `mkt_${(p.nom || '').toLowerCase().trim()}`;
      touch(key, p.nom, null, p.prix || 0);
      prodMap[key].quantite += p.quantite || 1;
      prodMap[key].chiffre  += p.montant || 0;
      prodMap[key].sources.add('marketplace');
      mkQuantite += p.quantite || 1;
      mkChiffre  += p.montant || 0;
    }
  }

  const produits = Object.values(prodMap).map(p => ({ ...p, sources: Array.from(p.sources) }));
  const activeProduitIds = new Set(Object.keys(prodMap));

  const topVentes  = [...produits].sort((a, b) => b.quantite - a.quantite).slice(0, 10);
  const topChiffre = [...produits].sort((a, b) => b.chiffre  - a.chiffre).slice(0, 10);

  const dormants = allProduits
    .filter(p => !activeProduitIds.has(String(p._id)))
    .map(p => ({ id: p._id, nom: p.name, image: getImage(p), stock: p.quantite }))
    .slice(0, 20);

  const totalViews     = allProduits.reduce((s, p) => s + (p.views     || 0), 0);
  const totalFavorites = allProduits.reduce((s, p) => s + (p.favorites || 0), 0);
  const topVues = [...allProduits].filter(p => (p.views || 0) > 0)
    .sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 10)
    .map(p => ({ id: p._id, nom: p.name, image: getImage(p), views: p.views || 0, favorites: p.favorites || 0 }));
  const topFavoris = [...allProduits].filter(p => (p.favorites || 0) > 0)
    .sort((a, b) => (b.favorites || 0) - (a.favorites || 0)).slice(0, 10)
    .map(p => ({ id: p._id, nom: p.name, image: getImage(p), views: p.views || 0, favorites: p.favorites || 0 }));

  return {
    periode: { jours: days, depuis: since.toISOString(), jusqua: until.toISOString() },
    totaux: {
      quantite: produits.reduce((s, p) => s + p.quantite, 0),
      chiffre:  produits.reduce((s, p) => s + p.chiffre,  0),
      produitsActifs: produits.length,
      views: totalViews, favorites: totalFavorites,
      pos:         { chiffre: posChiffre, quantite: posQuantite },
      marketplace: { chiffre: mkChiffre,  quantite: mkQuantite  },
    },
    topVentes, topChiffre, dormants, topVues, topFavoris,
  };
}

// ── GET /products?period=30d  (endpoint existant, inchangé) ──────────────────
const getPerformance = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { since, until, days } = buildRange(req.query.period, req.query.from, req.query.to);

    const allProduits = await Produit.find({ Clefournisseur: sellerId, 'shipping.isDeleted': { $ne: true } })
      .select('_id name pictures image1 quantite views favorites').lean();
    const getImage = p => p.pictures?.[0] || p.image1 || null;

    const data = await computePeriod(sellerId, since, until, days, allProduits, getImage);
    return res.json({ status: 'success', data });
  } catch (err) {
    console.error('getPerformance error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// ── GET /products/all-periods  — toutes les périodes en un seul appel ────────
const getAllPeriods = async (req, res) => {
  try {
    const sellerId = req.user.id;

    // allProduits fetchés une seule fois, partagé entre toutes les périodes
    const allProduits = await Produit.find({ Clefournisseur: sellerId, 'shipping.isDeleted': { $ne: true } })
      .select('_id name pictures image1 quantite views favorites').lean();
    const getImage = p => p.pictures?.[0] || p.image1 || null;

    const periods = Object.keys(PERIOD_DAYS);
    const results = await Promise.all(
      periods.map(period => {
        const { since, until, days } = buildRange(period);
        return computePeriod(sellerId, since, until, days, allProduits, getImage);
      })
    );

    const byPeriod = {};
    periods.forEach((p, i) => { byPeriod[p] = results[i]; });

    return res.json({ status: 'success', data: byPeriod });
  } catch (err) {
    console.error('getAllPeriods error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

module.exports = { getPerformance, getAllPeriods };
