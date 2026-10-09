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
          alertes.push({
            _id: p._id,
            productId: p._id,
            varianteId: null,
            nom: p.name,
            image,
            prix: p.prix,
            stock,
            totalCombinedStock: stock,
            variants: [],
            variante: null,
            niveau
          });
        }
      } else {
        const totalCombinedStock = p.variants.reduce((s, v) => s + (v.stock || 0), 0);
        const formattedVariants = p.variants.map((varItem, idx) => {
          const cStr = Array.isArray(varItem.colors) ? varItem.colors.join('/') : (varItem.color || '');
          const sStr = Array.isArray(varItem.sizes) ? varItem.sizes.join('/') : (varItem.size || '');
          const nStr = varItem.name || varItem.label || varItem.title || '';
          const label = [cStr, sStr, nStr].filter(Boolean).join(' - ') || `Variante ${idx + 1}`;
          return {
            _id: varItem._id,
            color: varItem.color,
            colors: varItem.colors,
            size: varItem.size,
            sizes: varItem.sizes,
            stock: varItem.stock || 0,
            price: varItem.price || varItem.prix || p.prix,
            imageUrl: varItem.imageUrl || varItem.picture || null,
            label,
          };
        });

        for (const v of p.variants) {
          const vStock = v.stock ?? 0;
          const niveau = vStock === 0 ? 'rupture' : vStock <= seuilGlobal ? 'bas' : 'ok';
          if (niveau !== 'ok') {
            const colorStr = Array.isArray(v.colors) ? v.colors.join('/') : (v.color || '');
            const sizeStr = Array.isArray(v.sizes) ? v.sizes.join('/') : (v.size || '');
            const nameStr = v.name || v.label || v.title || '';
            const vLabel = [colorStr, sizeStr, nameStr].filter(Boolean).join(' - ') || 'Variante';
            const vImage = v.imageUrl || v.picture || image;
            const vPrice = v.price || v.prix || p.prix;
            alertes.push({
              _id: p._id,
              productId: p._id,
              varianteId: v._id,
              nom: p.name,
              image: vImage,
              prix: vPrice,
              stock: vStock,
              totalCombinedStock,
              variants: formattedVariants,
              variante: vLabel,
              niveau
            });
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
