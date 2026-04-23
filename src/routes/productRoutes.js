const express = require('express');
const router = express.Router();
const productControler = require('../productControler');
const middelware = require('../auth/middelware');

// Product CRUD
router.get('/Products', middelware.authSeller, productControler.getAllProductsSeller);
router.get('/ProductsClients', productControler.getAllProductsClients);
router.get('/ProductsAdmin', middelware.authAdmin, productControler.getAllProductsAdmin);
router.post('/product', middelware.authSeller, middelware.handleUpload, productControler.createProduct);
router.get('/Product/:productId', middelware.authSeller, productControler.getProductById);
router.get('/ProductAdmin/:productId', middelware.authAdmin, productControler.getProductByIdAdmin);
router.put('/Product/:productId', middelware.authSeller, middelware.handleUpload, productControler.updateProduct);
router.put('/Product2/:productId', middelware.authSeller, middelware.handleUpload, productControler.updateProduct2);
router.put('/Products/bulk-update', middelware.authSeller, productControler.bulkUpdate);
router.delete('/Product/:productId', middelware.authSeller, productControler.deleteProduct);
router.delete('/ProductSeller/:productId', productControler.deleteProductAttribut);

// Product search
router.get('/searchProductByType/:type', productControler.searchProductByType);
router.get('/searchProductByTypeBySeller/:type/:seller', productControler.searchProductByTypeBySeller);
router.get('/searchProductByName/:name', productControler.searchProductByName);
router.get('/searchProductByNameBySeller/:name/:seller', productControler.searchProductByNameBySeller);

// Product validation
router.put('/product/validateProduct/:productId', middelware.authAdmin, productControler.validateProductStatus);

// Product pub
router.get('/productPubget', productControler.productPubget);
router.post('/productPubCreate', middelware.upload.single('image'), productControler.productPubCreate);
router.delete('/productPubDelete/:id', productControler.productPubDelete);

// Categories
router.get('/getAllCategories', productControler.getAllCategories);
router.post('/categorie', middelware.upload.single('image'), productControler.createCategorie);
router.put('/updateCategorie/:id', middelware.upload.single('image'), productControler.updateCategorie);
router.delete('/supCategorie', productControler.supCategorie);

// Types
router.get('/getAllType', productControler.getAllType);
router.get('/getAllTypeBySeller/:seller', productControler.getAllTypeBySeller);
router.post('/createProductType', productControler.createProductType);
router.delete('/suppType', productControler.suppType);

// Comments
router.get('/getAllCommenteProduit', productControler.getAllCommenteProduit);
router.get('/getAllCommenteProduitById/:id', productControler.getAllCommenteProduitById);
router.post('/createCommenteProduit', productControler.createCommenteProduit);

// Product clusters
router.get('/getMarqueClusters', productControler.getMarqueClusters);
router.get('/getCouleurClusters', productControler.getCouleurClusters);

// Likes
router.post('/likes', productControler.createLike);
router.get('/likes/user/:userId', productControler.getLikesByUser);
router.get('/likesClient/user/:userId', productControler.getLikesByUserClient);
router.delete('/likes/:userId/:produitId', productControler.deleteLikeByUser);
router.get('/likes/check/:userId/:produitId', productControler.verifyLikByUser);

// Product images cleanup
router.delete('/products/pictures/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const result = await deleteProductImages(productId);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Product page for SEO
router.get('/productte/:id', (req, res) => {
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