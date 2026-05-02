const { Commande } = require('../Models');
const Portefeuille = require('../models/portefeuilleSchema');
const Retrait = require('../models/retraitSchema');
const Transaction = require('../models/transactionSchema');
const FinancialService = require('../services/FinancialService');
const SUBSCRIPTION_CONFIG = require('../config/subscriptionConfig');
const mongoose = require("mongoose");

// Obtenir le dashboard financier du seller
const getSellerDashboard = async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    const periode = parseInt(req.query.periode) || 30;
    
    const stats = await FinancialService.getStatistiquesFinancieres(sellerId, periode);
    
    res.status(200).json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('❌ Erreur dashboard seller:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du dashboard',
      error: error.message
    });
  }
};

function generateReference() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}${hour}${minute}${second}`;
}

// Demander un retrait
const demanderRetrait = async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    const { montantDemande, methodeRetrait, detailsRetrait } = req.body;
    
    // Validation
    if (!montantDemande || montantDemande < 5000) {
      return res.status(400).json({
        success: false,
        message: 'Le montant minimum est de 5,000 FCFA'
      });
    }

    if (!methodeRetrait || !['MOBILE_MONEY', 'VIREMENT_BANCAIRE', 'ESPECES'].includes(methodeRetrait)) {
      return res.status(400).json({
        success: false,
        message: 'Méthode de retrait invalide'
      });
    }

    const reference = generateReference();
    const retrait = await FinancialService.demanderRetrait(
      sellerId, 
      montantDemande, 
      methodeRetrait, 
      detailsRetrait,
      reference
    );
    
    res.status(201).json({
      success: true,
      message: 'Demande de retrait créée avec succès',
      data: retrait
    });
    
  } catch (error) {
    console.error('❌ Erreur demande retrait:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Obtenir l'historique des transactions
const getHistoriqueTransactions = async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    const { 
      page = 1, 
      limit = 20, 
      type, 
      statut,
      dateStart,
      dateEnd 
    } = req.query;
    
    const query = { sellerId };
    
    if (type) query.type = type;
    if (statut) query.statut = statut;
    
    if (dateStart || dateEnd) {
      query.dateTransaction = {};
      if (dateStart) query.dateTransaction.$gte = new Date(dateStart);
      if (dateEnd) query.dateTransaction.$lte = new Date(dateEnd);
    }
    
    const transactions = await Transaction.find(query)
      .populate('commandeId', 'reference date')
      .populate('retraitId', 'reference methodeRetrait')
      .sort({ dateTransaction: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
      
    const total = await Transaction.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur historique transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des transactions',
      error: error.message
    });
  }
};

// NOUVELLE FONCTION: Gérer les changements d'état de commande
const gererChangementEtatCommande = async (commandeId, ancienEtat, nouvelEtat, commandeData = null) => {
  try {
    console.log(`🔄 Gestion changement état commande ${commandeId}: ${ancienEtat} → ${nouvelEtat}`);

    // Récupérer les données de la commande si pas fournies
    let donneesCommande = commandeData;
    if (!donneesCommande) {
      donneesCommande = await Commande.findById(commandeId).populate('nbrProduits.produit');
      if (!donneesCommande) {
        throw new Error('Commande non trouvée');
      }
    }

    const reference = donneesCommande.reference || generateReference();

    // Utiliser le nouveau service financier
    const resultat = await FinancialService.gererChangementEtatCommande(
      commandeId, 
      ancienEtat, 
      nouvelEtat, 
      donneesCommande, 
      reference
    );

    console.log(`✅ Changement d'état traité:`, resultat);
    return resultat;

  } catch (error) {
    console.error(`❌ Erreur gestion changement état:`, error);
    throw error;
  }
};

// Fonction pour obtenir les commandes avec informations financières
async function getSellerOrdersWithFinancialInfo(sellerId, options = {}) {
  try {
    const sellerObjectId = mongoose.Types.ObjectId.isValid(sellerId)
      ? new mongoose.Types.ObjectId(sellerId)
      : sellerId;

    const page = parseInt(options.page) || 1;
    const limit = parseInt(options.limit) || 10;
    const skip = (page - 1) * limit;

    // Taux de commission réel du seller (depuis SUBSCRIPTION_CONFIG, source de vérité)
    const tauxCommission = await FinancialService.obtenirTauxCommission(sellerId);

    const pipeline = [
      { $unwind: "$nbrProduits" },
      {
        $lookup: {
          from: "produits",
          localField: "nbrProduits.produit",
          foreignField: "_id",
          as: "productInfo",
        },
      },
      { $unwind: "$productInfo" },
      {
        $match: {
          "productInfo.Clefournisseur": sellerObjectId,
        },
      },
      {
        $group: {
          _id: "$_id",
          clefUser: { $first: "$clefUser" },
          reference: { $first: "$reference" },
          statusPayment: { $first: "$statusPayment" },
          statusLivraison: { $first: "$statusLivraison" },
          livraisonDetails: { $first: "$livraisonDetails" },
          prix: { $first: "$prix" },
          reduction: { $first: "$reduction" },
          date: { $first: "$date" },
          etatTraitement: { $first: "$etatTraitement" },
          sellerProducts: {
            $push: {
              produitId: "$nbrProduits.produit",
              isValideSeller: "$nbrProduits.isValideSeller",
              quantite: "$nbrProduits.quantite",
              tailles: "$nbrProduits.tailles",
              couleurs: "$nbrProduits.couleurs",
              nom: "$productInfo.name",
              prix: "$productInfo.prix",
              prixPromo: "$productInfo.prixPromo",
              image: "$productInfo.image1",
            },
          },
          sellerTotal: {
            $sum: {
              $multiply: [
                "$nbrProduits.quantite",
                {
                  $cond: {
                    if: { $gt: ["$productInfo.prixPromo", 0] },
                    then: "$productInfo.prixPromo",
                    else: "$productInfo.prix",
                  },
                },
              ],
            },
          },
        },
      },

      // Lookup des transactions existantes
      // Note: sellerId est stocké en String dans TransactionSeller
      {
        $lookup: {
          from: "transactionsellers",
          let: { commandeId: "$_id", sid: { $toString: sellerObjectId } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$commandeId", "$$commandeId"] },
                    { $eq: ["$sellerId", "$$sid"] },
                    { $eq: ["$type", "CREDIT_COMMANDE"] },
                  ],
                },
              },
            },
          ],
          as: "transactionInfo",
        },
      },

      // Champs financiers : transaction réelle si elle existe, sinon estimation
      {
        $addFields: {
          hasTransaction: { $gt: [{ $size: "$transactionInfo" }, 0] },
          transactionStatus: {
            $cond: {
              if: { $gt: [{ $size: "$transactionInfo" }, 0] },
              then: { $arrayElemAt: ["$transactionInfo.statut", 0] },
              else: "AUCUNE",
            },
          },
          // Valeurs réelles depuis la transaction (montants définitifs calculés au moment de la prise en charge)
          commission: {
            $cond: {
              if: { $gt: [{ $size: "$transactionInfo" }, 0] },
              then: { $arrayElemAt: ["$transactionInfo.commission", 0] },
              else: null,  // null = pas encore de transaction, estimation calculée en JS après
            },
          },
          montantNet: {
            $cond: {
              if: { $gt: [{ $size: "$transactionInfo" }, 0] },
              then: { $arrayElemAt: ["$transactionInfo.montantNet", 0] },
              else: null,
            },
          },
          tauxCommission: {
            $cond: {
              if: { $gt: [{ $size: "$transactionInfo" }, 0] },
              then: { $arrayElemAt: ["$transactionInfo.tauxCommission", 0] },
              else: null,
            },
          },
          estDisponible: {
            $cond: {
              if: { $gt: [{ $size: "$transactionInfo" }, 0] },
              then: { $arrayElemAt: ["$transactionInfo.estDisponible", 0] },
              else: false,
            },
          },
          dateDisponibilite: {
            $cond: {
              if: { $gt: [{ $size: "$transactionInfo" }, 0] },
              then: { $arrayElemAt: ["$transactionInfo.dateDisponibilite", 0] },
              else: null,
            },
          },
        },
      },

      { $sort: { date: -1 } },
    ];

    const rawOrders = await Commande.aggregate(pipeline).skip(skip).limit(limit);

    // Enrichir avec le taux du seller ; les montants commission/net restent null si pas de transaction
    const orders = rawOrders.map((order) => ({
      ...order,
      tauxCommission: order.tauxCommission || tauxCommission,
    }));

    const totalPipeline = [...pipeline.slice(0, -1), { $count: "total" }];
    const totalResult = await Commande.aggregate(totalPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;
    const totalPages = Math.ceil(total / limit);

    return {
      orders,
      pagination: {
        currentPage: page,
        totalPages,
        totalOrders: total,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        limit,
      },
    };
  } catch (error) {
    console.error("❌ Erreur récupération commandes seller:", error);
    throw error;
  }
}

// Contrôleur pour les commandes avec informations financières
const seller_orders_with_financial = async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    
    // 🔥 NOUVEAU: Récupérer les paramètres de pagination depuis la query
    const options = {
      page: req.query.page || 1,
      limit: req.query.limit || 10,
      status: req.query.status, // Optionnel: filtre par statut
      search: req.query.search  // Optionnel: recherche
    };
    
    const [sellerOrdersResult, financialSummary] = await Promise.all([
      getSellerOrdersWithFinancialInfo(sellerId, options),
      FinancialService.getStatistiquesFinancieres(sellerId)
    ]);
    
    res.status(200).json({
      success: true,
      data: sellerOrdersResult,
      // Compatibilité avec l'ancien format
      orders: sellerOrdersResult.orders,
      pagination: sellerOrdersResult.pagination,
      financial: financialSummary
    });
  } catch (error) {
    console.error('❌ Erreur orders with financial:', error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des commandes",
      error: error.message,
    });
  }
};

// NOUVELLE FONCTION: Fonction à appeler périodiquement pour confirmer les transactions
const confirmerTransactionsLivrees = async () => {
  try {
    console.log('🔍 Recherche des transactions à confirmer...');

    const transactionsAConfirmer = await Transaction.aggregate([
      {
        $match: {
          type: 'CREDIT_COMMANDE',
          statut: 'EN_ATTENTE'
        }
      },
      {
        $lookup: {
          from: 'commandes',
          localField: 'commandeId',
          foreignField: '_id',
          as: 'commande'
        }
      },
      {
        $match: {
          'commande.etatTraitement': { $in: ['livraison reçu', 'Traité'] }
        }
      }
    ]);

    let confirmees = 0;
    for (const transactionData of transactionsAConfirmer) {
      try {
        await FinancialService.confirmerTransactionsCommande(transactionData.commandeId);
        confirmees++;
      } catch (error) {
        console.error(`❌ Erreur confirmation commande ${transactionData.commandeId}:`, error);
      }
    }

    console.log(`✅ ${confirmees}/${transactionsAConfirmer.length} commandes confirmées`);
    return { confirmees, total: transactionsAConfirmer.length };
    
  } catch (error) {
    console.error('❌ Erreur confirmation automatique:', error);
    throw error;
  }
};

// NOUVELLE FONCTION: Obtenir le résumé financier d'une commande
const getCommandeFinancialSummary = async (req, res) => {
  try {
    const { commandeId } = req.params;
    
    const resume = await FinancialService.getResumeCommande(commandeId);
    
    res.json({
      success: true,
      data: resume
    });
    
  } catch (error) {
    console.error('❌ Erreur résumé financier:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du résumé financier',
      error: error.message
    });
  }
};

// NOUVELLE FONCTION: Vérifier la cohérence financière
const verifierCoherenceFinanciere = async (req, res) => {
  try {
    const { sellerId } = req.params;
    
    const verification = await FinancialService.verifierCoherencePortefeuille(sellerId);
    
    res.json({
      success: true,
      data: verification
    });
    
  } catch (error) {
    console.error('❌ Erreur vérification cohérence:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification',
      error: error.message
    });
  }
};

// NOUVELLE FONCTION: Corriger les incohérences
const corrigerIncoherences = async (req, res) => {
  try {
    const { sellerId } = req.params;
    
    const correction = await FinancialService.corrigerIncoherences(sellerId);
    
    res.json({
      success: true,
      data: correction
    });
    
  } catch (error) {
    console.error('❌ Erreur correction:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la correction',
      error: error.message
    });
  }
};

// Tâche de déblocage
const tacheDeblocage = async () => {
  try {
    const result = await FinancialService.debloquerArgentDisponible();
    console.log('🔓 Tâche de déblocage terminée:', result);
    return result;
  } catch (error) {
    console.error('❌ Erreur tâche déblocage:', error);
    throw error;
  }
};

// Tâche de nettoyage
const tacheNettoyage = async () => {
  try {
    const result = await FinancialService.nettoyageAutomatique();
    console.log('🧹 Tâche de nettoyage terminée:', result);
    return result;
  } catch (error) {
    console.error('❌ Erreur tâche nettoyage:', error);
    throw error;
  }
};

// Recalculer les soldes (fonction d'audit)
const recalculerSoldes = async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    
    const result = await FinancialService.recalculerSoldes(sellerId);
    
    res.status(200).json({
      success: true,
      message: 'Soldes recalculés avec succès',
      data: result
    });
    
  } catch (error) {
    console.error('❌ Erreur recalcul soldes:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du recalcul des soldes',
      error: error.message
    });
  }
};

module.exports = {
  getSellerDashboard,
  demanderRetrait,
  getHistoriqueTransactions,
  getSellerOrdersWithFinancialInfo,
  seller_orders_with_financial,
  confirmerTransactionsLivrees,
  tacheDeblocage,
  tacheNettoyage,
  recalculerSoldes,
  gererChangementEtatCommande,
  getCommandeFinancialSummary,
  verifierCoherenceFinanciere,
  corrigerIncoherences
};