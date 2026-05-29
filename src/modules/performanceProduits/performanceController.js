const VenteDirecte = require('../../models/VenteDirecte');
const Transaction = require('../../models/transactionSchema');
const { Produit } = require('../../Models');

const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90, '1d': 1 };

// GET /products?period=30d   OR   ?from=YYYY-MM-DD&to=YYYY-MM-DD
const getPerformance = async (req, res) => {
  try {
    const sellerId = req.user.id;

    let since, until, days;
    if (req.query.from && req.query.to) {
      since = new Date(req.query.from);
      since.setHours(0, 0, 0, 0);
      until = new Date(req.query.to);
      until.setHours(23, 59, 59, 999);
      days = Math.round((until - since) / 86400000) + 1;
    } else {
      const period = req.query.period || '30d';
      days = PERIOD_DAYS[period] || 30;
      since = new Date();
      since.setDate(since.getDate() - days);
      since.setHours(0, 0, 0, 0);
      until = new Date();
      until.setHours(23, 59, 59, 999);
    }

    // ── Agréger POS ────────────────────────────────────────────────────────
    const posVentes = await VenteDirecte.find({
      sellerId: String(sellerId),
      statut: 'COMPLETEE',
      createdAt: { $gte: since, $lte: until },
    }).lean();

    // Clé de déduplication : on groupe par nom normalisé (pas l'id qui peut différer)
    const prodMap = {};

    const touch = (key, nom, image, prix) => {
      if (!prodMap[key]) {
        prodMap[key] = { id: key, nom, image, prix: prix || 0, quantite: 0, chiffre: 0, sources: new Set() };
      }
    };

    for (const vente of posVentes) {
      for (const ligne of vente.lignes || []) {
        const key = String(ligne.produitId);
        touch(key, ligne.nom, ligne.image, ligne.prixUnitaire);
        prodMap[key].quantite += ligne.quantite;
        prodMap[key].chiffre += ligne.sousTotal || ligne.prixUnitaire * ligne.quantite;
        prodMap[key].sources.add('POS');
      }
    }

    // ── Agréger marketplace via Transaction ────────────────────────────────
    // Commande.nbrProduits + Clefournisseur est sur le Produit, pas dans nbrProduits.
    // La source fiable par vendeur est Transaction CREDIT_COMMANDE.
    const txns = await Transaction.find({
      sellerId: String(sellerId),
      type: 'CREDIT_COMMANDE',
      statut: { $in: ['EN_ATTENTE', 'CONFIRME'] },
      dateTransaction: { $gte: since, $lte: until },
    }).lean();

    for (const txn of txns) {
      for (const p of txn.metadata?.produits || []) {
        const key = `mkt_${(p.nom || '').toLowerCase().trim()}`;
        touch(key, p.nom, null, p.prix || 0);
        prodMap[key].quantite += p.quantite || 1;
        prodMap[key].chiffre += p.montant || 0;
        prodMap[key].sources.add('marketplace');
      }
    }

    // ── Sérialiser sources (Set → Array) ───────────────────────────────────
    const produits = Object.values(prodMap).map(p => ({
      ...p,
      sources: Array.from(p.sources),
    }));

    const topVentes = [...produits].sort((a, b) => b.quantite - a.quantite).slice(0, 10);
    const topChiffre = [...produits].sort((a, b) => b.chiffre - a.chiffre).slice(0, 10);

    // ── Produits dormants : actifs mais 0 vente sur la période ─────────────
    const activeProduitIds = new Set(Object.keys(prodMap));
    const allProduits = await Produit.find({
      Clefournisseur: sellerId,
      'shipping.isDeleted': { $ne: true },
    })
      .select('_id name pictures quantite')
      .lean();

    const dormants = allProduits
      .filter(p => !activeProduitIds.has(String(p._id)))
      .map(p => ({
        id: p._id,
        nom: p.name,
        image: p.pictures?.[0] || null,
        stock: p.quantite,
      }))
      .slice(0, 20);

    const totalVentes = produits.reduce((s, p) => s + p.quantite, 0);
    const totalChiffre = produits.reduce((s, p) => s + p.chiffre, 0);

    return res.json({
      status: 'success',
      data: {
        periode: { jours: days, depuis: since.toISOString(), jusqua: until.toISOString() },
        totaux: { quantite: totalVentes, chiffre: totalChiffre, produitsActifs: produits.length },
        topVentes,
        topChiffre,
        dormants,
      },
    });
  } catch (err) {
    console.error('getPerformance error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

module.exports = { getPerformance };
