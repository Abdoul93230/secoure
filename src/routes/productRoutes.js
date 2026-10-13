const express = require('express');
const router = express.Router();
const productControler = require('../productControler');
const middelware = require('../auth/middelware');
const { ownerOrAdmin } = require('../auth/ownership');
const { productOwnerOrAdmin, storeOwnerOrAdmin } = require('../auth/accessGuards');

// Product CRUD
router.get('/Products', middelware.authSeller, productControler.getAllProductsSeller);
router.get('/ProductsClients', productControler.getAllProductsClients);
router.get('/ProductClient/:productId', productControler.getClientProductById);
router.get('/ProductsAdmin', middelware.authAdmin, productControler.getAllProductsAdmin);
router.get('/ProductsHome', productControler.getHomeFeed);
router.post('/product', middelware.authSeller, middelware.handleUpload, productControler.createProduct);
router.get('/Product/:productId', middelware.authSeller, productControler.getProductById);
router.get('/ProductAdmin/:productId', middelware.authAdmin, productControler.getProductByIdAdmin);
router.put('/Product/:productId', middelware.authSeller, middelware.handleUpload, productControler.updateProduct);
router.put('/Product2/:productId', middelware.authSeller, middelware.handleUpload, productControler.updateProduct2);
router.put('/Products/bulk-update', middelware.authSeller, productControler.bulkUpdate);
router.post('/Products/bulk-create', middelware.authSeller, productControler.bulkCreate);
router.delete('/Product/:productId', middelware.authSeller, productControler.deleteProduct);
router.delete('/ProductSeller/:productId', productOwnerOrAdmin(), productControler.deleteProductAttribut);

// Products by seller (remplace les anciennes routes supplierRoutes supprimées)
// Tous les produits d'une boutique (non publiés, prix d'achat) : la boutique, son caissier ou un admin
router.get('/searchProductBySeller/:sellerId', storeOwnerOrAdmin((req) => req.params.sellerId, { allowAgent: true }), productControler.searchProductBySeller);
router.get('/searchProductBySellerAdmin/:sellerId', middelware.authAdmin, productControler.searchProductBySeller);
// Alias pour compatibilité web/mobile (anciens noms fournisseur)
router.get('/searchProductBySupplier/:sellerId', middelware.authSeller, productControler.searchProductBySeller);
router.get('/searchProductBySupplierClients/:sellerId', productControler.searchProductBySellerClient);
router.get('/searchProductBySupplierAdmin/:sellerId', middelware.authAdmin, productControler.searchProductBySeller);

// Product search
router.get('/searchProductByType/:type', productControler.searchProductByType);
router.get('/searchProductByTypeBySeller/:type/:seller', productControler.searchProductByTypeBySeller);
router.get('/searchProductByName/:name', productControler.searchProductByName);
router.get('/searchProductByNameBySeller/:name/:seller', productControler.searchProductByNameBySeller);

// Product validation
router.put('/product/validateProduct/:productId', middelware.authAdmin, productControler.validateProductStatus);
router.put('/products/bulk-validate', middelware.authAdmin, productControler.bulkValidateProducts);
router.get('/products/missing-type/:sellerId', middelware.authAdmin, productControler.countProductsWithoutType);
router.put('/products/admin-bulk-update', middelware.authAdmin, productControler.adminBulkUpdateProducts);

// Product view tracking (public — clients uniquement)
router.post('/productView/:productId', productControler.trackProductView);

// Product pub
router.get('/productPubget', productControler.productPubget);
router.post('/productPubCreate', middelware.authAdmin, middelware.upload.single('image'), productControler.productPubCreate);
router.delete('/productPubDelete/:id', middelware.authAdmin, productControler.productPubDelete);

// Categories
router.get('/getAllCategories', productControler.getAllCategories);
router.get('/getCategoriesWithProducts', productControler.getCategoriesWithProducts);
router.post('/categorie', middelware.authAdmin, middelware.upload.single('image'), productControler.createCategorie);
router.put('/updateCategorie/:id', middelware.authAdmin, middelware.upload.single('image'), productControler.updateCategorie);
router.delete('/supCategorie', middelware.authAdmin, productControler.supCategorie);

// Types
router.get('/getAllType', productControler.getAllType);
router.get('/getAllTypeWithCategories', productControler.getAllTypeWithCategories);
router.get('/getAllTypeBySeller/:seller', productControler.getAllTypeBySeller);
router.post('/createProductType', middelware.authAdmin, productControler.createProductType);
router.delete('/suppType', middelware.authAdmin, productControler.suppType);

// Comments
router.get('/getAllCommenteProduit', productControler.getAllCommenteProduit);
router.get('/getAllCommenteProduitById/:id', productControler.getAllCommenteProduitById);
router.post('/createCommenteProduit', middelware.auth, productControler.createCommenteProduit);

// Product clusters
router.get('/getMarqueClusters', productControler.getMarqueClusters);
router.get('/getCouleurClusters', productControler.getCouleurClusters);

// Likes
// Favoris : le client lui-même (ou un admin)
router.post('/likes', ownerOrAdmin((req) => req.body?.userId), productControler.createLike);
router.get('/likes/user/:userId', ownerOrAdmin((req) => req.params.userId), productControler.getLikesByUser);
router.get('/likesClient/user/:userId', ownerOrAdmin((req) => req.params.userId), productControler.getLikesByUserClient);
router.delete('/likes/:userId/:produitId', ownerOrAdmin((req) => req.params.userId), productControler.deleteLikeByUser);
router.get('/likes/check/:userId/:produitId', ownerOrAdmin((req) => req.params.userId), productControler.verifyLikByUser);

// Product images cleanup
router.delete('/products/pictures/:productId', productOwnerOrAdmin(), async (req, res) => {
  try {
    const { productId } = req.params;
    const result = await deleteProductImages(productId);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Product page for SEO
router.get('/productte/:id', middelware.authAdmin, (req, res) => {
  const productId = req.params.id;
  const product = {
    id: productId,
    name: 'Produit génial',
    description: 'Ceci est un produit incroyable.',
    price: 19.99,
  };

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Détails du produit - ${product.name}</title>
      </head>
      <body>
        <div id="root"></div>
        <script src="/bundle.js"></script>
      </body>
    </html>
  `;

  res.send(html);
});

module.exports = router;