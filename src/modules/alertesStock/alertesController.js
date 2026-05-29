const { Produit } = require('../../Models');

const SEUIL_DEFAULT = 5; // unités — seuil par défaut si non configuré

// GET /alerts
const getAlertes = async (req, res) => {
  try {
    const sellerId = req.user.id;

    const produits = await Produit.find({
      Clefournisseur: sellerId,
      'shipping.isDeleted': { $ne: true },
    })
      .select('name pictures quantite variants prix stockMinimum')
      .lean();

    const alertes = [];
    const ok = [];

    for (const p of produits) {
      const seuil = p.stockMinimum ?? SEUIL_DEFAULT;
      const image = p.pictures?.[0] || null;

      // Stock principal (sans variantes)
      const hasVariants = p.variants && p.variants.length > 0;

      if (!hasVariants) {
        const stock = p.quantite ?? 0;
        const entry = {
          _id: p._id,
          nom: p.name,
          image,
          prix: p.prix,
          stock,
          seuil,
          variante: null,
          niveau: stock === 0 ? 'rupture' : stock <= seuil ? 'bas' : 'ok',
        };
        if (entry.niveau !== 'ok') alertes.push(entry);
        else ok.push(entry);
      } else {
        // Analyser chaque variante
        for (const v of p.variants) {
          const vStock = v.stock ?? 0;
          const vLabel = [v.colors?.join('/'), v.sizes?.join('/')].filter(Boolean).join(' - ') || 'Variante';
          const entry = {
            _id: p._id,
            nom: p.name,
            image,
            prix: v.price || p.prix,
            stock: vStock,
            seuil,
            variante: vLabel,
            niveau: vStock === 0 ? 'rupture' : vStock <= seuil ? 'bas' : 'ok',
          };
          if (entry.niveau !== 'ok') alertes.push(entry);
        }
        // Stock agrégé pour la carte "ok"
        const stockTotal = p.variants.reduce((sum, v) => sum + (v.stock ?? 0), 0);
        if (alertes.filter(a => String(a._id) === String(p._id)).length === 0) {
          ok.push({ _id: p._id, nom: p.name, image, stock: stockTotal, seuil, variante: null, niveau: 'ok' });
        }
      }
    }

    // Tri : ruptures d'abord, puis stock bas
    alertes.sort((a, b) => {
      if (a.niveau === 'rupture' && b.niveau !== 'rupture') return -1;
      if (b.niveau === 'rupture' && a.niveau !== 'rupture') return 1;
      return a.stock - b.stock;
    });

    return res.json({
      status: 'success',
      data: {
        alertes,
        totalAlertes: alertes.length,
        ruptures: alertes.filter(a => a.niveau === 'rupture').length,
        stockBas: alertes.filter(a => a.niveau === 'bas').length,
        totalProduits: produits.length,
      },
    });
  } catch (err) {
    console.error('getAlertes error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// PATCH /seuil/:produitId  body: { seuil: 5 }
const updateSeuil = async (req, res) => {
  try {
    const { produitId } = req.params;
    const seuil = parseInt(req.body.seuil);
    if (isNaN(seuil) || seuil < 0) {
      return res.status(400).json({ status: 'error', message: 'Seuil invalide' });
    }
    await Produit.findByIdAndUpdate(produitId, { stockMinimum: seuil });
    return res.json({ status: 'success', message: 'Seuil mis à jour', seuil });
  } catch (err) {
    console.error('updateSeuil error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

module.exports = { getAlertes, updateSeuil };
