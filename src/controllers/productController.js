const productService = require('../services/productService');
const categoryService = require('../services/categoryService');
const typeService = require('../services/typeService');
const commentService = require('../services/commentService');
const likeService = require('../services/likeService');
const shippingService = require('../services/shippingService');
const pubService = require('../services/pubService');
const clusterService = require('../services/clusterService');
const { handleAsyncError } = require('../utils/errorHandler');
const { validateProduct } = require('../validators/productValidator');

// Product CRUD Operations
const getAllProducts = handleAsyncError(async (req, res) => {
  const products = await productService.getAllProducts();
  res.json({ message: "Tous les produits", data: products });
});

const getProductById = handleAsyncError(async (req, res) => {
  const { productId } = req.params;
  const product = await productService.getProductById(productId);
  
  if (!product) {
    return res.status(404).json({ message: "Produit non trouvé" });
  }
  
  res.json({ message: "Produit trouvé", data: product });
});

const createProduct = handleAsyncError(async (req, res) => {
  const validationError = validateProduct(req.body);
  if (validationError) {
    return res.status(400).json({ errors: validationError });
  }

  const productData = await productService.prepareProductData(req.body, req.files);
  const newProduct = await productService.createProduct(productData);
  
  res.status(201).json({ 
    message: "Produit créé avec succès", 
    data: newProduct 
  });
});

const updateProduct = handleAsyncError(async (req, res) => {
  const { productId } = req.params;
  const productData = await productService.prepareProductData(req.body, req.files);
  
  const updatedProduct = await productService.updateProduct(productId, productData);
  
  if (!updatedProduct) {
    return res.status(404).json({ message: "Produit non trouvé" });
  }
  
  res.json({ 
    message: "Produit mis à jour avec succès", 
    data: updatedProduct 
  });
});

const updateProduct2 = handleAsyncError(async (req, res) => {
  const { productId } = req.params;
  const updatedProduct = await productService.updateProductSimple(productId, req.body);
  
  if (!updatedProduct) {
    return res.status(404).json({ message: "Produit non trouvé" });
  }
  
  res.json({ 
    message: "Produit mis à jour avec succès", 
    data: updatedProduct 
  });
});

const deleteProduct = handleAsyncError(async (req, res) => {
  const { productId } = req.params;
  const deleted = await productService.deleteProduct(productId);
  
  if (!deleted) {
    return res.status(404).json({ message: "Produit non trouvé" });
  }
  
  res.json({ message: "Produit supprimé avec succès" });
});

const deleteProductAttribut = handleAsyncError(async (req, res) => {
  const { productId } = req.params;
  const deleted = await productService.softDeleteProduct(productId);
  
  if (!deleted) {
    return res.status(404).json({ message: "Produit non trouvé" });
  }
  
  res.json({ message: "Produit marqué comme supprimé" });
});

// Product Search Operations
const searchProductByType = handleAsyncError(async (req, res) => {
  const { type } = req.params;
  const products = await productService.searchByType(type);
  res.json({ data: products });
});

const searchProductByTypeBySeller = handleAsyncError(async (req, res) => {
  const { type, seller } = req.params;
  const products = await productService.searchByTypeAndSeller(type, seller);
  res.json({ data: products });
});

const searchProductByName = handleAsyncError(async (req, res) => {
  const { name } = req.params;
  const products = await productService.searchByName(name);
  res.json({ data: products });
});

const searchProductByNameBySeller = handleAsyncError(async (req, res) => {
  const { name, seller } = req.params;
  const products = await productService.searchByNameAndSeller(name, seller);
  res.json({ data: products });
});

// Product Validation
const validateProduct = handleAsyncError(async (req, res) => {
  const { productId } = req.params;
  const validatedProduct = await productService.validateProduct(productId, req.body);
  
  if (!validatedProduct) {
    return res.status(404).json({ message: "Produit non trouvé" });
  }
  
  res.json({ 
    message: "Produit validé avec succès", 
    data: validatedProduct 
  });
});

// Category Operations
const getAllCategories = handleAsyncError(async (req, res) => {
  const categories = await categoryService.getAllCategories();
  res.json({ message: "Toutes les catégories", data: categories });
});

const createCategorie = handleAsyncError(async (req, res) => {
  const categoryData = await categoryService.prepareCategoryData(req.body, req.file);
  const newCategory = await categoryService.createCategory(categoryData);
  
  res.status(201).json({ 
    message: "Catégorie créée avec succès", 
    data: newCategory 
  });
});

const updateCategorie = handleAsyncError(async (req, res) => {
  const { id } = req.params;
  const categoryData = await categoryService.prepareCategoryData(req.body, req.file);
  const updatedCategory = await categoryService.updateCategory(id, categoryData);
  
  if (!updatedCategory) {
    return res.status(404).json({ message: "Catégorie non trouvée" });
  }
  
  res.json({ 
    message: "Catégorie mise à jour avec succès", 
    data: updatedCategory 
  });
});

const supCategorie = handleAsyncError(async (req, res) => {
  const { id } = req.body;
  const deleted = await categoryService.deleteCategory(id);
  
  if (!deleted) {
    return res.status(404).json({ message: "Catégorie non trouvée" });
  }
  
  res.json({ message: "Catégorie supprimée avec succès" });
});

// Type Operations
const getAllType = handleAsyncError(async (req, res) => {
  const types = await typeService.getAllTypes();
  res.json({ message: "Tous les types", data: types });
});

const getAllTypeBySeller = handleAsyncError(async (req, res) => {
  const { seller } = req.params;
  const types = await typeService.getTypesBySeller(seller);
  res.json({ message: "Types du vendeur", data: types });
});

const createProductType = handleAsyncError(async (req, res) => {
  const newType = await typeService.createType(req.body);
  res.status(201).json({ 
    message: "Type créé avec succès", 
    data: newType 
  });
});

const suppType = handleAsyncError(async (req, res) => {
  const { id } = req.body;
  const deleted = await typeService.deleteType(id);
  
  if (!deleted) {
    return res.status(404).json({ message: "Type non trouvé" });
  }
  
  res.json({ message: "Type supprimé avec succès" });
});

// Comment Operations
const getAllCommenteProduit = handleAsyncError(async (req, res) => {
  const comments = await commentService.getAllComments();
  res.json({ message: "Tous les commentaires", data: comments });
});

const getAllCommenteProduitById = handleAsyncError(async (req, res) => {
  const { id } = req.params;
  const comments = await commentService.getCommentsByProductId(id);
  res.json({ message: "Commentaires du produit", data: comments });
});

const createCommenteProduit = handleAsyncError(async (req, res) => {
  const newComment = await commentService.createComment(req.body);
  res.status(201).json({ 
    message: "Commentaire créé avec succès", 
    data: newComment 
  });
});

// Like Operations
const createLike = handleAsyncError(async (req, res) => {
  const newLike = await likeService.createLike(req.body);
  res.status(201).json({ 
    message: "Like ajouté avec succès", 
    data: newLike 
  });
});

const getLikesByUser = handleAsyncError(async (req, res) => {
  const { userId } = req.params;
  const likes = await likeService.getLikesByUser(userId);
  res.json({ message: "Likes de l'utilisateur", data: likes });
});

const deleteLikeByUser = handleAsyncError(async (req, res) => {
  const { userId, produitId } = req.params;
  const deleted = await likeService.deleteLike(userId, produitId);
  
  if (!deleted) {
    return res.status(404).json({ message: "Like non trouvé" });
  }
  
  res.json({ message: "Like supprimé avec succès" });
});

const verifyLikByUser = handleAsyncError(async (req, res) => {
  const { userId, produitId } = req.params;
  const exists = await likeService.checkLikeExists(userId, produitId);
  res.json({ liked: exists });
});

// Shipping Operations
const createZone = handleAsyncError(async (req, res) => {
  const newZone = await shippingService.createZone(req.body);
  res.status(201).json({ 
    message: "Zone créée avec succès", 
    data: newZone 
  });
});

const getAllZones = handleAsyncError(async (req, res) => {
  const zones = await shippingService.getAllZones();
  res.json({ message: "Toutes les zones", data: zones });
});

const updateZone = handleAsyncError(async (req, res) => {
  const { zoneId } = req.params;
  const updatedZone = await shippingService.updateZone(zoneId, req.body);
  
  if (!updatedZone) {
    return res.status(404).json({ message: "Zone non trouvée" });
  }
  
  res.json({ 
    message: "Zone mise à jour avec succès", 
    data: updatedZone 
  });
});

const deleteZone = handleAsyncError(async (req, res) => {
  const { zoneId } = req.params;
  const deleted = await shippingService.deleteZone(zoneId);
  
  if (!deleted) {
    return res.status(404).json({ message: "Zone non trouvée" });
  }
  
  res.json({ message: "Zone supprimée avec succès" });
});

const createTransporteur = handleAsyncError(async (req, res) => {
  const newTransporteur = await shippingService.createTransporteur(req.body);
  res.status(201).json({ 
    message: "Transporteur créé avec succès", 
    data: newTransporteur 
  });
});

const getAllTransporteurs = handleAsyncError(async (req, res) => {
  const transporteurs = await shippingService.getAllTransporteurs();
  res.json({ message: "Tous les transporteurs", data: transporteurs });
});

const updateTransporteur = handleAsyncError(async (req, res) => {
  const { transporteurId } = req.params;
  const updatedTransporteur = await shippingService.updateTransporteur(transporteurId, req.body);
  
  if (!updatedTransporteur) {
    return res.status(404).json({ message: "Transporteur non trouvé" });
  }
  
  res.json({ 
    message: "Transporteur mis à jour avec succès", 
    data: updatedTransporteur 
  });
});

const deleteTransporteur = handleAsyncError(async (req, res) => {
  const { transporteurId } = req.params;
  const deleted = await shippingService.deleteTransporteur(transporteurId);
  
  if (!deleted) {
    return res.status(404).json({ message: "Transporteur non trouvé" });
  }
  
  res.json({ message: "Transporteur supprimé avec succès" });
});

const addShippingOptionToProduit = handleAsyncError(async (req, res) => {
  const { produitId } = req.params;
  const updatedProduct = await shippingService.addShippingOption(produitId, req.body);
  
  if (!updatedProduct) {
    return res.status(404).json({ message: "Produit non trouvé" });
  }
  
  res.json({ 
    message: "Option de livraison ajoutée avec succès", 
    data: updatedProduct 
  });
});

const updateShippingOption = handleAsyncError(async (req, res) => {
  const { produitId, shippingOptionId } = req.params;
  const updatedProduct = await shippingService.updateShippingOption(produitId, shippingOptionId, req.body);
  
  if (!updatedProduct) {
    return res.status(404).json({ message: "Produit ou option de livraison non trouvé" });
  }
  
  res.json({ 
    message: "Option de livraison mise à jour avec succès", 
    data: updatedProduct 
  });
});

const deleteShippingOption = handleAsyncError(async (req, res) => {
  const { produitId, shippingOptionId } = req.params;
  const updatedProduct = await shippingService.deleteShippingOption(produitId, shippingOptionId);
  
  if (!updatedProduct) {
    return res.status(404).json({ message: "Produit ou option de livraison non trouvé" });
  }
  
  res.json({ 
    message: "Option de livraison supprimée avec succès", 
    data: updatedProduct 
  });
});

// Pub Operations
const productPubget = handleAsyncError(async (req, res) => {
  const pubs = await pubService.getAllPubs();
  res.json({ message: "Toutes les pubs", data: pubs });
});

const productPubCreate = handleAsyncError(async (req, res) => {
  const pubData = await pubService.preparePubData(req.body, req.file);
  const newPub = await pubService.createPub(pubData);
  
  res.status(201).json({ 
    message: "Pub créée avec succès", 
    data: newPub 
  });
});

const productPubDelete = handleAsyncError(async (req, res) => {
  const { id } = req.params;
  const deleted = await pubService.deletePub(id);
  
  if (!deleted) {
    return res.status(404).json({ message: "Pub non trouvée" });
  }
  
  res.json({ message: "Pub supprimée avec succès" });
});

// Cluster Operations
const getMarqueClusters = handleAsyncError(async (req, res) => {
  const clusters = await clusterService.getMarqueClusters();
  res.json({ message: "Clusters de marques", data: clusters });
});

const getCouleurClusters = handleAsyncError(async (req, res) => {
  const clusters = await clusterService.getCouleurClusters();
  res.json({ message: "Clusters de couleurs", data: clusters });
});

// Order Operations
const updateEtatTraitementCommande = handleAsyncError(async (req, res) => {
  const { id } = req.params;
  const { nouvelEtat } = req.body;
  
  const updatedOrder = await productService.updateOrderStatus(id, nouvelEtat);
  
  if (!updatedOrder) {
    return res.status(404).json({ message: "Commande non trouvée" });
  }
  
  res.json({ 
    message: "État de traitement mis à jour avec succès", 
    data: updatedOrder 
  });
});

module.exports = {
  // Product operations
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProduct2,
  deleteProduct,
  deleteProductAttribut,
  searchProductByType,
  searchProductByTypeBySeller,
  searchProductByName,
  searchProductByNameBySeller,
  validateProduct,
  
  // Category operations
  getAllCategories,
  createCategorie,
  updateCategorie,
  supCategorie,
  
  // Type operations
  getAllType,
  getAllTypeBySeller,
  createProductType,
  suppType,
  
  // Comment operations
  getAllCommenteProduit,
  getAllCommenteProduitById,
  createCommenteProduit,
  
  // Like operations
  createLike,
  getLikesByUser,
  deleteLikeByUser,
  verifyLikByUser,
  
  // Shipping operations
  createZone,
  getAllZones,
  updateZone,
  deleteZone,
  createTransporteur,
  getAllTransporteurs,
  updateTransporteur,
  deleteTransporteur,
  addShippingOptionToProduit,
  updateShippingOption,
  deleteShippingOption,
  
  // Pub operations
  productPubget,
  productPubCreate,
  productPubDelete,
  
  // Cluster operations
  getMarqueClusters,
  getCouleurClusters,
  
  // Order operations
  updateEtatTraitementCommande
};