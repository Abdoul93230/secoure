const { Produit, SellerRequest } = require('../../Models');

const SEUIL_DEFAULT = 5;

// GET /alerts
const getAlertes = async (req, res) => {
  try {
    const sellerId = req.user.id;

    // Seuil global du vendeur
    const seller = await SellerRequest.findById(sellerId).select('stockAlertSeuil').lean();
    const seuilGlobal = seller?.stockAlertSeuil ?? SEUIL_DEFAULT;

    const produits = await Produit.find({
      Clefournisseur: sellerId,
      'shipping.isDeleted': { $ne: true },
    })
      .select('name pictures quantite variants prix')
      .lean();

    const alertes = [];

    for (const p of produits) {
      const image = p.pictures?.[0] || null;
      const hasVariants = p.variants && p.variants.length > 0;

      if (!hasVariants) {
        const stock = p.quantite ?? 0;
        const niveau = stock === 0 ? 'rupture' : stock <= seuilGlobal ? 'bas' : 'ok';
        if (niveau !== 'ok') {
          alertes.push({ _id: p._id, nom: p.name, image, prix: p.prix, stock, variante: null, niveau });
        }
      } else {
        for (const v of p.variants) {
          const vStock = v.stock ?? 0;
          const niveau = vStock === 0 ? 'rupture' : vStock <= seuilGlobal ? 'bas' : 'ok';
          if (niveau !== 'ok') {
            const vLabel = [v.colors?.join('/'), v.sizes?.join('/')].filter(Boolean).join(' - ') || 'Variante';
            alertes.push({ _id: p._id, nom: p.name, image, prix: v.price || p.prix, stock: vStock, variante: vLabel, niveau });
          }
        }
      }
    }

    alertes.sort((a, b) => {
      if (a.niveau === 'rupture' && b.niveau !== 'rupture') return -1;
      if (b.niveau === 'rupture' && a.niveau !== 'rupture') return 1;
      return a.stock - b.stock;
    });

    return res.json({
      status: 'success',
      data: {
        alertes,
        seuilGlobal,
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

// GET /seuil — seuil global actuel
const getSeuil = async (req, res) => {
  try {
    const seller = await SellerRequest.findById(req.user.id).select('stockAlertSeuil').lean();
    return res.json({ status: 'success', seuil: seller?.stockAlertSeuil ?? SEUIL_DEFAULT });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// PATCH /seuil  body: { seuil: 5 }
const updateSeuil = async (req, res) => {
  try {
    const seuil = parseInt(req.body.seuil);
    if (isNaN(seuil) || seuil < 0) {
      return res.status(400).json({ status: 'error', message: 'Seuil invalide' });
    }
    await SellerRequest.findByIdAndUpdate(req.user.id, { stockAlertSeuil: seuil });
    return res.json({ status: 'success', message: 'Seuil global mis à jour', seuil });
  } catch (err) {
    console.error('updateSeuil error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

module.exports = { getAlertes, getSeuil, updateSeuil };
