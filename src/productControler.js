const productService = require('./services/productService');
const categoryService = require('./services/categoryService');
const typeService = require('./services/typeService');
const commentService = require('./services/commentService');
const likeService = require('./services/likeService');
const shippingService = require('./services/shippingService');
const pubService = require('./services/pubService');
const mongoose = require("mongoose");
const clusterService = require('./services/clusterService');
const { handleAsyncError } = require('./utils/errorHandler');
const { validateProduct } = require('./validators/productValidator');
const  FinancialService  = require('./services/FinancialService'); // Importer le service financier
const Transaction = require('./models/transactionSchema');
const { Commande } = require('./Models');
const { gererChangementEtatCommande } = require('./controllers/financeController');

// Product CRUD Operations
const getAllProductsSeller = handleAsyncError(async (req, res) => {
  const products = await productService.getAllProductsSeller(req.userId);
  // console.log({ products });

  res.json({ message: "Tous les produits", data: products });
});
const getAllProductsClients = handleAsyncError(async (req, res) => {
  const products = await productService.getAllProductsClients();
  // console.log({ products });

  res.json({ message: "Tous les produits", data: products });
});
const getAllProductsAdmin = handleAsyncError(async (req, res) => {
  const products = await productService.getAllProductsAdmin();
  // console.log({ products });

  res.json({ message: "Tous les produits", data: products });
});

const getProductById = handleAsyncError(async (req, res) => {
  const { productId } = req.params;
  const product = await productService.getProductById(productId, req.userId);
  
  if (!product) {
    return res.status(404).json({ message: "Produit non trouvé" });
  }
  
  res.json({ message: "Produit trouvé", data: product });
});
const getProductByIdAdmin = handleAsyncError(async (req, res) => {
  const { productId } = req.params;
  const product = await productService.getProductByIdAdmin(productId);
  
  if (!product) {
    return res.status(404).json({ message: "Produit non trouvé" });
  }
  
  res.json({ message: "Produit trouvé", data: product });
});

// const createProduct = handleAsyncError(async (req, res) => {
//   try {
//     // Validation des données (si tu as un validateur)
//     const validationError = validateProduct && validateProduct(req.body);
//     if (validationError) {
//       return res.status(400).json({ errors: validationError });
//     }

//     // Préparer les données du produit avec gestion des images
//     const productData = await productService.prepareProductData(req.body, req.files);
    
//     // Créer le produit
//     const newProduct = await productService.createProduct(productData);

//     // Déterminer le message selon le rôle
//     const sellerOrAdmin = req.body.sellerOrAdmin;
//     const message = `Le produit ${req.body.name} a été ${
//       sellerOrAdmin === "admin"
//         ? "créé et publié"
//         : "créé et en attente de validation"
//     } avec succès`;

//     res.status(201).json({ 
//       message, 
//       data: newProduct 
//     });
    
//   } catch (error) {
//     console.log(error);
    
//     // Gestion des erreurs spécifiques
//     if (error.message === "Aucune image du produit n'a été envoyée.") {
//       return res.status(400).json({ message: error.message });
//     }
    
//     if (error.message === "La première image du produit est obligatoire") {
//       return res.status(400).json({ 
//         message: error.message,
//         error: error.message 
//       });
//     }

//     return res.status(500).json({
//       message: "Une erreur s'est produite lors de la création du produit",
//       error: error.message,
//     });
//   }
// });

const createProduct = handleAsyncError(async (req, res) => {
  try {
    // Validation des données
    console.log({data : req.body});
    
    const validationError = validateProduct && validateProduct(req.body);
    if (validationError) {
      return res.status(400).json({ errors: validationError });
    }

    // Préparer les données du produit avec vérifications d'abonnement
    const productData = await productService.prepareProductData(req.body, req.files);
    
    // Créer le produit
    const newProduct = await productService.createProduct(productData);

    // Déterminer le message selon le rôle
    const sellerOrAdmin = req.body.sellerOrAdmin;
    const message = `Le produit ${req.body.name} a été ${
      sellerOrAdmin === "admin"
        ? "créé et publié"
        : "créé et en attente de validation"
    } avec succès`;

    // Si c'est un vendeur, ajouter les infos d'abonnement dans la réponse
    let subscriptionInfo = null;
    if (sellerOrAdmin === "seller" && req.body.Clefournisseur) {
      try {
        subscriptionInfo = await productService.getSellerSubscriptionInfo(req.body.Clefournisseur);
      } catch (error) {
        console.error("Erreur lors de la récupération des infos d'abonnement:", error);
      }
    }

    res.status(201).json({ 
      success: true,
      message, 
      data: newProduct,
      subscriptionInfo: subscriptionInfo ? {
        currentProducts: subscriptionInfo.products.current,
        productLimit: subscriptionInfo.products.limit,
        remainingSlots: subscriptionInfo.products.remaining,
        planType: subscriptionInfo.subscription?.planType
      } : null
    });
    
  } catch (error) {
    console.error("Erreur lors de la création du produit:", error);
    
    // Gestion des erreurs liées à l'abonnement
    if (error.message.includes("Vendeur non trouvé")) {
      return res.status(404).json({ 
        success: false,
        message: "Vendeur introuvable",
        error: error.message 
      });
    }

    if (error.message.includes("compte vendeur n'est pas encore validé")) {
      return res.status(403).json({ 
        success: false,
        message: "Compte non validé",
        error: error.message 
      });
    }

    if (error.message.includes("abonnement")) {
      return res.status(403).json({ 
        success: false,
        message: "Problème d'abonnement",
        error: error.message 
      });
    }

    if (error.message.includes("Limite de produits atteinte")) {
      return res.status(403).json({ 
        success: false,
        message: "Limite de produits atteinte",
        error: error.message,
        upgradeRequired: true
      });
    }

    // Gestion des erreurs d'images
    if (error.message === "Aucune image du produit n'a été envoyée.") {
      return res.status(400).json({ 
        success: false,
        message: error.message 
      });
    }
    
    if (error.message === "La première image du produit est obligatoire") {
      return res.status(400).json({ 
        success: false,
        message: error.message,
        error: error.message 
      });
    }

    // Erreur générique
    return res.status(500).json({
      success: false,
      message: "Une erreur s'est produite lors de la création du produit",
      error: error.message,
    });
  }
});

const updateProduct = handleAsyncError(async (req, res) => {
  try {
    const { productId } = req.params;
    
    // Préparer les données de mise à jour
    const { updateData } = await productService.prepareUpdateData(
      productId, 
      req.body, 
      req.files
    );
    
    // Mettre à jour le produit
    const updatedProduct = await productService.updateProduct(productId, updateData, req.userId);

    if (!updatedProduct) {
      return res.status(404).json({ message: "Produit introuvable" });
    }

    res.json({ 
      message: "Produit mis à jour avec succès", 
      data: updatedProduct 
    });
    
  } catch (error) {
    console.log(error);
    
    if (error.message === "Produit introuvable") {
      return res.status(404).json({ message: error.message });
    }

    return res.status(500).json({
      message: "Erreur lors de la mise à jour du produit",
      error: error.message,
    });
  }
});

const updateProduct2 = handleAsyncError(async (req, res) => {
  try {
    const { productId } = req.params;
    
    // Validation de base
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "ID de produit invalide" });
    }
    
    // Préparer les données de mise à jour avancée
    // const { updateData } = await productService.prepareAdvancedUpdateData(
    //   productId, 
    //   req.body, 
    //   req.files
    // );
        const { updateData, product } = await productService.prepareAdvancedUpdateData(
      productId,
      req.body,
      req.files
    );
    
    // Mettre à jour le produit avec validation
        const updatedProduct = await productService.updateProductAdvanced(productId, updateData, req.userId);

    if (!updatedProduct) {
      return res.status(404).json({ message: "Produit non trouvé" });
    }

    // res.json({ 
    //   message: "Produit mis à jour avec succès", 
    //   data: updatedProduct 
    // });


    // Déterminer le message selon le rôle
    const sellerOrAdmin = req.body.sellerOrAdmin;
    let message = "";

    if (sellerOrAdmin === "admin") {
      message = `Le produit ${updatedProduct.name} a été modifié avec succès`;
    } else {
      // Si le produit était publié et est maintenant en attente
      if (product.isPublished === "Published" && updateData.isPublished === "Attente") {
        message = `Le produit ${updatedProduct.name} a été modifié et est en attente de validation`;
      } else {
        message = `Le produit ${updatedProduct.name} a été modifié avec succès`;
      }
    }

    // Ajouter les infos d'abonnement si c'est un vendeur
    let subscriptionInfo = null;
    if (sellerOrAdmin === "seller" && req.body.Clefournisseur) {
      try {
        subscriptionInfo = await productService.getSellerSubscriptionInfo(req.body.Clefournisseur);
      } catch (error) {
        console.error("Erreur lors de la récupération des infos d'abonnement:", error);
      }
    }

    res.status(200).json({
      success: true,
      message,
      data: updatedProduct,
      statusChange: product.isPublished !== updateData.isPublished ? {
        from: product.isPublished,
        to: updateData.isPublished
      } : null,
      subscriptionInfo: subscriptionInfo ? {
        currentProducts: subscriptionInfo.products.current,
        productLimit: subscriptionInfo.products.limit,
        remainingSlots: subscriptionInfo.products.remaining,
        planType: subscriptionInfo.subscription?.planType
      } : null
    });

    
  } catch (error) {
    console.error("Erreur lors de la mise à jour du produit:", error);

    // Gestion des erreurs d'autorisation
    if (error.message.includes("Vous n'êtes pas autorisé")) {
      return res.status(403).json({
        success: false,
        message: "Accès refusé",
        error: error.message
      });
    }

    // Gestion des erreurs de produit supprimé
    if (error.message.includes("produit supprimé")) {
      return res.status(403).json({
        success: false,
        message: "Produit supprimé",
        error: error.message
      });
    }

    // Gestion des erreurs d'abonnement
    if (error.message.includes("Vendeur non trouvé")) {
      return res.status(404).json({
        success: false,
        message: "Vendeur introuvable",
        error: error.message
      });
    }

    if (error.message.includes("compte vendeur")) {
      return res.status(403).json({
        success: false,
        message: "Compte vendeur inactif",
        error: error.message
      });
    }

    if (error.message.includes("abonnement")) {
      return res.status(403).json({
        success: false,
        message: "Problème d'abonnement",
        error: error.message
      });
    }

    // Gestion des erreurs de format
    if (error.message.includes("Format") || error.message.includes("invalide")) {
      return res.status(400).json({
        success: false,
        message: "Données invalides",
        error: error.message
      });
    }

    // Erreur générique
    return res.status(500).json({
      success: false,
      message: "Une erreur s'est produite lors de la mise à jour du produit",
      error: error.message
    });
  
    
    // Gestion des erreurs spécifiques
    if (error.message === "Produit introuvable") {
      return res.status(404).json({ message: error.message });
    }
    
    if (error.message === "Impossible de modifier un produit supprimé") {
      return res.status(400).json({ message: error.message });
    }
    
    if (error.message === "Vous n'êtes pas autorisé à modifier ce produit") {
      return res.status(403).json({ message: error.message });
    }
    
    if (error.message === "Format de variantes invalide") {
      return res.status(400).json({ 
        message: error.message,
        error: error.message 
      });
    }

    return res.status(500).json({
      message: "Erreur lors de la mise à jour du produit",
      error: error.message,
    });
  }
});

const deleteProduct = handleAsyncError(async (req, res) => {
  const { productId } = req.params;
  const deleted = await productService.deleteProduct(productId, req.userId);
  
  if (!deleted) {
    return res.status(404).json({ message: "Produit non trouvé" });
  }
  
  res.json({ message: "Produit supprimé avec succès" });
});

const deleteProductAttribut = handleAsyncError(async (req, res) => {
  const { productId } = req.params;
  const sellerOrAdmin = req.body.sellerOrAdmin;
  const sellerOrAdmin_id = req.body.sellerOrAdmin_id;
  const deleted = await productService.softDeleteProduct(productId, sellerOrAdmin, sellerOrAdmin_id);

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
const validateProductStatus = handleAsyncError(async (req, res) => {
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
const getLikesByUserClient = handleAsyncError(async (req, res) => {
  const { userId } = req.params;
  const likes = await likeService.getLikesByUserClient(userId);
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

const creerTransactionsEnAttente = async (commandeId) => {
  try {
    // Récupérer la commande complète (elle contient déjà les produits dans le champ 'prod')
    const commande = await Commande.findById(commandeId);
    
    if (!commande) {
      throw new Error('Commande non trouvée');
    }

    console.log('Commande trouvée:', {
      id: commande._id,
      reference: commande.reference,
      nombreItems: commande.nbrProduits?.length,
      nombreProduits: commande.prod?.length
    });
    
    // Créer un map des produits par ID pour un accès rapide
    const produitsMap = {};
    if (commande.prod && Array.isArray(commande.prod)) {
      commande.prod.forEach(produit => {
        produitsMap[produit._id.toString()] = produit;
      });
    }
    
    console.log('Produits disponibles:', Object.keys(produitsMap));
    
    // Vérifier que nous avons des items à traiter
    if (!commande.nbrProduits || commande.nbrProduits.length === 0) {
      throw new Error('Aucun item trouvé dans la commande');
    }
    
    // Grouper les produits par seller et calculer les montants
    const ventesParlSeller = {};
    const problemMessages = [];
    
    for (let i = 0; i < commande.nbrProduits.length; i++) {
      const item = commande.nbrProduits[i];
      const produitId = item.produit.toString();
      const produit = produitsMap[produitId];
      
      console.log(`Traitement item ${i}:`, {
        produitId,
        produitTrouve: !!produit,
        quantite: item.quantite,
        tailles: item.tailles,
        couleurs: item.couleurs
      });
      
      // Validation du produit
      if (!produit) {
        problemMessages.push(`Item ${i}: Produit ${produitId} non trouvé dans la liste des produits`);
        continue;
      }
      
      console.log('Données du produit:', {
        id: produit._id,
        name: produit.name,
        prix: produit.prix,
        prixPromo: produit.prixPromo,
        Clefournisseur: produit.Clefournisseur
      });
      
      // Validation du sellerId
      const sellerId = produit.Clefournisseur;
      if (!sellerId) {
        problemMessages.push(`Item ${i}: Clefournisseur manquant pour le produit ${produit.name || produit._id}`);
        continue;
      }
      
      // Validation et calcul du prix
      const prixBase = parseFloat(produit.prix) || 0;
      const prixPromo = parseFloat(produit.prixPromo) || 0;
      const prix = prixPromo > 0 ? prixPromo : prixBase;
      
      if (prix <= 0) {
        problemMessages.push(`Item ${i}: Prix invalide (${prix}) pour le produit ${produit.name || produit._id}`);
        continue;
      }
      
      // Validation de la quantité
      const quantite = parseInt(item.quantite) || 0;
      if (quantite <= 0) {
        problemMessages.push(`Item ${i}: Quantité invalide (${quantite})`);
        continue;
      }
      
      const montant = quantite * prix;
      
      console.log(`Calcul valide pour item ${i}:`, {
        sellerId,
        productName: produit.name,
        quantite,
        prix,
        montant,
        tailles: item.tailles,
        couleurs: item.couleurs
      });
      
      // Groupement par seller
      if (!ventesParlSeller[sellerId]) {
        ventesParlSeller[sellerId] = {
          montant: 0,
          produits: []
        };
      }
      
      ventesParlSeller[sellerId].montant += montant;
      ventesParlSeller[sellerId].produits.push({
        nom: produit.name,
        quantite: quantite,
        prix: prix,
        tailles: item.tailles || [],
        couleurs: item.couleurs || []
      });
    }
    
    // Afficher tous les problèmes trouvés
    if (problemMessages.length > 0) {
      console.warn('Problèmes détectés:');
      problemMessages.forEach(msg => console.warn('- ' + msg));
    }
    
    console.log('Ventes par seller:', ventesParlSeller);
    
    // Vérifier qu'il y a des ventes à traiter
    const sellersAvecVentes = Object.keys(ventesParlSeller);
    if (sellersAvecVentes.length === 0) {
      console.warn('Aucune vente valide trouvée pour la commande');
      return [];
    }
    
    // Créer les transactions en attente pour chaque seller
    const transactionsCreees = [];
    for (const [sellerId, vente] of Object.entries(ventesParlSeller)) {
      console.log('Création transaction pour seller:', {
        sellerId,
        commandeId,
        montant: vente.montant,
        description: `Vente en cours - Commande ${commande.reference}`,
        nombreProduits: vente.produits.length
      });
      
      try {
        const transaction = await FinancialService.crediterPortefeuille(
          sellerId,
          commandeId,
          vente.montant,
          `Vente en cours - Commande ${commande.reference}`,
          commande.reference
        );
        
        transactionsCreees.push({
          sellerId,
          montant: vente.montant,
          transaction,
          produits: vente.produits
        });
        
        console.log('Transaction créée avec succès pour seller:', sellerId);
        
      } catch (transactionError) {
        console.error(`Erreur lors de la création de transaction pour seller ${sellerId}:`, transactionError);
        // Continuer avec les autres sellers même si une transaction échoue
      }
    }
    
    console.log(`${transactionsCreees.length} transactions créées en attente pour la commande ${commande.reference}`);
    return transactionsCreees;
    
  } catch (error) {
    console.error('Erreur lors de la création des transactions en attente:', error);
    throw error;
  }
};

// 4. FONCTION POUR CONFIRMER LES PAIEMENTS

const confirmerPaiements = async (commandeId) => {
  try {
    // Trouver toutes les transactions en attente pour cette commande
    const  Transaction  = require('./models/transactionSchema');
    
    const transactionsEnAttente = await Transaction.find({
      commandeId: commandeId,
      type: 'CREDIT_COMMANDE',
      statut: 'EN_ATTENTE'
    });
    
    // Confirmer chaque transaction
    for (const transaction of transactionsEnAttente) {
      await FinancialService.confirmerTransaction(transaction._id);
      console.log(`Transaction confirmée pour le seller ${transaction.sellerId}: ${transaction.montantNet} FCFA`);
    }
    
    console.log(`${transactionsEnAttente.length} transactions confirmées pour la commande ${commandeId}`);
    
  } catch (error) {
    console.error('Erreur lors de la confirmation des paiements:', error);
    throw error;
  }
};

const confirmerPaiements2 = async (commandeId) => {
  try {
    // Trouver toutes les transactions en attente pour cette commande
    const  Transaction  = require('./models/transactionSchema');
    
    const transactionsEnAttente = await Transaction.find({
      commandeId: commandeId,
      type: 'CREDIT_COMMANDE',
      statut: 'ANNULE'
    });
    
    // Confirmer chaque transaction
    for (const transaction of transactionsEnAttente) {
      await FinancialService.confirmerTransaction2(transaction._id);
      console.log(`Transaction confirmée pour le seller ${transaction.sellerId}: ${transaction.montantNet} FCFA`);
    }
    
    console.log(`${transactionsEnAttente.length} transactions confirmées pour la commande ${commandeId}`);
    
  } catch (error) {
    console.error('Erreur lors de la confirmation des paiements:', error);
    throw error;
  }
};

// 5. FONCTION POUR ANNULER LES TRANSACTIONS

const annulerTransactions = async (commandeId) => {
  try {
    const  Transaction  = require('./models/transactionSchema');
    const Portefeuille  = require('./models/portefeuilleSchema');
    const mongoose = require('mongoose');
    
    const session = await mongoose.startSession();
    
    await session.withTransaction(async () => {
      // Trouver toutes les transactions liées à cette commande
      const transactions = await Transaction.find({
        commandeId: commandeId,
        type: 'CREDIT_COMMANDE'
      }).session(session);
      
      for (const transaction of transactions) {
        if (transaction.statut === 'EN_ATTENTE') {
          // Annuler la transaction et remettre l'argent
          await Transaction.findByIdAndUpdate(
            transaction._id,
            { 
              statut: 'ANNULE',
              description: transaction.description + ' - ANNULÉE'
            },
            { session }
          );
          
          // Retirer l'argent du portefeuille
          await Portefeuille.findOneAndUpdate(
            { sellerId: transaction.sellerId },
            {
              $inc: {
                soldeEnAttente: -transaction.montantNet,
                soldeTotal: -transaction.montantNet
              },
              dateMiseAJour: new Date()
            },
            { session }
          );
          
        } else if (transaction.statut === 'CONFIRME') {
          // Créer une transaction de remboursement
          const remboursement = new Transaction({
            sellerId: transaction.sellerId,
            commandeId: commandeId,
            type: 'ANNULATION',
            statut: 'CONFIRME',
            montant: -transaction.montant,
            montantNet: -transaction.montantNet,
            commission: 0,
            description: `Annulation - Commande ${commandeId}`,
            reference: `ANN_${Date.now()}_${transaction.sellerId}`,
            dateConfirmation: new Date()
          });
          
          await remboursement.save({ session });
          
          // Retirer l'argent du solde disponible
          await Portefeuille.findOneAndUpdate(
            { sellerId: transaction.sellerId },
            {
              $inc: {
                soldeDisponible: -transaction.montantNet,
                soldeTotal: -transaction.montantNet
              },
              dateMiseAJour: new Date()
            },
            { session }
          );
        }
      }
    });
    
    await session.endSession();
    
    console.log(`Transactions annulées pour la commande ${commandeId}`);
    
  } catch (error) {
    console.error('Erreur lors de l\'annulation des transactions:', error);
    throw error;
  }
};


const handleFinancialTransitions = async (commandeId, ancienEtat, nouvelEtat,isDelete=false) => {
  // console.log("Abdoul Razak");
  
  console.log({commandeId, ancienEtat, nouvelEtat});
  try {
    
   if(isDelete){
    // Si la commande est annulée -> Annuler les transactions
    if (nouvelEtat === "Annulée" || nouvelEtat==="annulé") {
      await annulerTransactions(commandeId);
    }
   }else{
     // Quand la commande passe à "reçu par le livreur" -> Créer les transactions en attente
    if (ancienEtat !== "reçu par le livreur" && nouvelEtat === "reçu par le livreur") {
      await creerTransactionsEnAttente(commandeId);
    }
    if (ancienEtat !== "ANNULE" && nouvelEtat === "reçu par le livreur") {
      await confirmerPaiements2(commandeId);
    }
    
    // Quand la commande passe à "livraison reçu" -> Confirmer les paiements
    if (ancienEtat !== "livraison reçu" && nouvelEtat === "livraison reçu") {
      await confirmerPaiements(commandeId);
    }
    
    // Si la commande est annulée -> Annuler les transactions
    if (nouvelEtat === "Annulée" && ancienEtat !== "Annulée") {
      await annulerTransactions(commandeId);
    }
   }
    
  } catch (error) {
    console.error('Erreur lors de la gestion financière:', error);
    // On ne fait pas échouer la mise à jour de la commande pour une erreur financière
    // Mais on devrait logger cela pour investigation
  }
};


const updateEtatTraitementCommande = handleAsyncError(async (req, res) => {
  const { id } = req.params;
  const { nouvelEtat } = req.body;
  
  // Récupérer l'état actuel avant mise à jour
  const currentOrder = await Commande.findById(id);
  if (!currentOrder) {
    return res.status(404).json({ message: "Commande non trouvée" });
  }
  
  const ancienEtat = currentOrder.etatTraitement;
  
  // Mettre à jour l'état de la commande
  const updatedOrder = await productService.updateOrderStatus(id, nouvelEtat);
  
  if (!updatedOrder) {
    return res.status(404).json({ message: "Erreur lors de la mise à jour" });
  }
  
  // Gérer les transitions financières avec le nouveau système
  try {
    await gererChangementEtatCommande(id, ancienEtat, nouvelEtat, currentOrder);
    
    // Restaurer le code promo si la commande est annulée
    if ((nouvelEtat === "Annulée" || nouvelEtat === "annulé") && currentOrder.idCodePro) {
      console.log('🎫 Annulation via état - Restauration du code promo...');
      const promoCodeController = require('./controllers/promoCodeController');
      await promoCodeController.restorePromoUsage(currentOrder.idCodePro, id);
    }
  } catch (financialError) {
    console.error('❌ Erreur financière lors du changement d\'état:', financialError);
    // Ne pas faire échouer la mise à jour de la commande pour une erreur financière
    // Mais logger pour investigation
  }
  
  res.json({ 
    message: "État de traitement mis à jour avec succès", 
    data: updatedOrder 
  });
});

const getCommandeFinancialSummary = async (commandeId) => {
  try {
    const transactions = await Transaction.find({
      commandeId: commandeId,
      type: 'CREDIT_COMMANDE'
    }).populate('commandeId', 'reference');
    
    const summary = {
      commandeId,
      montantTotal: 0,
      montantNetTotal: 0,
      commissionTotal: 0,
      statut: 'AUCUNE_TRANSACTION',
      sellersCount: 0,
      transactions: transactions.map(t => ({
        sellerId: t.sellerId,
        montant: t.montant,
        montantNet: t.montantNet,
        commission: t.commission,
        statut: t.statut,
        dateTransaction: t.dateTransaction,
        dateConfirmation: t.dateConfirmation
      }))
    };
    
    if (transactions.length > 0) {
      summary.montantTotal = transactions.reduce((sum, t) => sum + t.montant, 0);
      summary.montantNetTotal = transactions.reduce((sum, t) => sum + t.montantNet, 0);
      summary.commissionTotal = transactions.reduce((sum, t) => sum + t.commission, 0);
      summary.sellersCount = new Set(transactions.map(t => t.sellerId)).size;
      
      // Déterminer le statut global
      const statuts = transactions.map(t => t.statut);
      if (statuts.every(s => s === 'CONFIRME')) {
        summary.statut = 'TOUS_CONFIRMES';
      } else if (statuts.every(s => s === 'EN_ATTENTE')) {
        summary.statut = 'TOUS_EN_ATTENTE';
      } else if (statuts.some(s => s === 'ANNULE')) {
        summary.statut = 'PARTIELLEMENT_ANNULE';
      } else {
        summary.statut = 'MIXTE';
      }
    }
    
    return summary;
    
  } catch (error) {
    console.error('Erreur lors de la récupération du résumé financier:', error);
    throw error;
  }
};


// 8. ENDPOINT POUR OBTENIR LE DÉTAIL FINANCIER D'UNE COMMANDE

const getCommandeFinancialDetails = handleAsyncError(async (req, res) => {
  const { commandeId } = req.params;
  
  const summary = await getCommandeFinancialSummary(commandeId);
  
  res.json({
    success: true,
    data: summary
  });
});
// Fonction pour gérer la validation financière
const gererValidationFinanciere = async (commandeId, ancienEtat) => {
  try {
    console.log(`💰 Traitement financier pour commande ${commandeId}`);
    
    // Si l'ancien état n'était pas "reçu par le livreur", créer d'abord les transactions en attente
    if (ancienEtat !== "reçu par le livreur") {
      console.log(`📝 Création des transactions en attente...`);
      await creerTransactionsEnAttente(commandeId);
    }
    
    // Confirmer les paiements (passage de EN_ATTENTE à CONFIRME)
    console.log(`✅ Confirmation des paiements...`);
    await confirmerPaiements(commandeId);
    
    console.log(`💰 Traitement financier terminé pour commande ${commandeId}`);
    
  } catch (error) {
    console.error(`❌ Erreur financière pour commande ${commandeId}:`, error);
    throw error; // Relancer l'erreur pour arrêter le processus
  }
};

module.exports = {
  // Product operations
  getAllProductsSeller,
  getAllProductsAdmin,
  getAllProductsClients,
  getProductById,
  getProductByIdAdmin,
  createProduct,
  updateProduct,
  updateProduct2,
  deleteProduct,
  deleteProductAttribut,
  searchProductByType,
  searchProductByTypeBySeller,
  searchProductByName,
  searchProductByNameBySeller,
  validateProductStatus,
  
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
  getLikesByUserClient,
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
  updateEtatTraitementCommande,
  getCommandeFinancialDetails,
  gererValidationFinanciere,
  handleFinancialTransitions
};