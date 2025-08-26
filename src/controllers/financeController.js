const { Commande } = require('../Models');
const Portefeuille = require('../models/portefeuilleSchema');
const Retrait = require('../models/retraitSchema');
const Transaction = require('../models/transactionSchema');
const FinancialService = require('../services/FinancialService');
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
    console.error('Erreur dashboard seller:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du dashboard',
      error: error.message
    });
  }
};

function generateReference() {
  const now = new Date();

  const year   = now.getFullYear();
  const month  = String(now.getMonth() + 1).padStart(2, '0');
  const day    = String(now.getDate()).padStart(2, '0');
  const hour   = String(now.getHours()).padStart(2, '0');
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
    console.error('Erreur demande retrait:', error);
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
    console.error('Erreur historique transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des transactions',
      error: error.message
    });
  }
};

// Middleware à appeler quand une commande passe à "livraison reçu"
const onCommandeLivree = async (commandeId) => {
  try {
    const commande = await Commande.findById(commandeId).populate('nbrProduits.produit');
    
    if (!commande) {
      throw new Error('Commande non trouvée');
    }
    
    // Grouper les produits par seller
    const ventesParlSeller = {};
    
    for (const item of commande.nbrProduits) {
      const sellerId = item.produit.Clefournisseur;
      const prix = item.produit.prixPromo > 0 ? item.produit.prixPromo : item.produit.prix;
      const montant = item.quantite * prix;
      
      if (!ventesParlSeller[sellerId]) {
        ventesParlSeller[sellerId] = 0;
      }
      ventesParlSeller[sellerId] += montant;
    }
    
    // Créditer chaque seller
    for (const [sellerId, montant] of Object.entries(ventesParlSeller)) {
      await FinancialService.crediterPortefeuille(
        sellerId,
        commandeId,
        montant,
        `Vente - Commande ${commande.reference}`
      );
    }
    
    console.log(`Commande ${commande.reference} traitée financièrement`);
    
  } catch (error) {
    console.error('Erreur lors de la mise à jour des finances:', error);
    throw error;
  }
};

// Fonction pour obtenir les commandes avec informations financières
async function getSellerOrdersWithFinancialInfo(sellerId) {
  try {
    const orders = await Commande.aggregate([
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
          "productInfo.Clefournisseur": sellerId,
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
                    else: "$productInfo.prix"
                  }
                }
              ],
            },
          },
        },
      },

      // Lookup pour les transactions
      {
        $lookup: {
          from: "transactionsellers",
          let: { 
            commandeId: "$_id",
            sellerId: sellerId
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$commandeId", "$$commandeId"] },
                    { $eq: ["$sellerId", "$$sellerId"] },
                    { $eq: ["$type", "CREDIT_COMMANDE"] }
                  ]
                }
              }
            }
          ],
          as: "transactionInfo"
        }
      },

      // Ajouter les informations financières
      {
        $addFields: {
          transactionStatus: {
            $cond: {
              if: { $gt: [{ $size: "$transactionInfo" }, 0] },
              then: { $arrayElemAt: ["$transactionInfo.statut", 0] },
              else: "AUCUNE"
            }
          },
          montantNet: {
            $cond: {
              if: { $gt: [{ $size: "$transactionInfo" }, 0] },
              then: { $arrayElemAt: ["$transactionInfo.montantNet", 0] },
              else: 0
            }
          },
          commission: {
            $cond: {
              if: { $gt: [{ $size: "$transactionInfo" }, 0] },
              then: { $arrayElemAt: ["$transactionInfo.commission", 0] },
              else: 0
            }
          },
          estDisponible: {
            $cond: {
              if: { $gt: [{ $size: "$transactionInfo" }, 0] },
              then: { $arrayElemAt: ["$transactionInfo.estDisponible", 0] },
              else: false
            }
          },
          dateDisponibilite: {
            $cond: {
              if: { $gt: [{ $size: "$transactionInfo" }, 0] },
              then: { $arrayElemAt: ["$transactionInfo.dateDisponibilite", 0] },
              else: null
            }
          }
        }
      },

      { $sort: { date: -1 } },
    ]);

    return orders;
  } catch (error) {
    console.error("Erreur lors de la récupération des commandes du vendeur:", error);
    throw error;
  }
}

// Contrôleur pour les commandes avec informations financières
const seller_orders_with_financial = async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    
    const [sellerOrders, financialSummary] = await Promise.all([
      getSellerOrdersWithFinancialInfo(sellerId),
      FinancialService.getStatistiquesFinancieres(sellerId)
    ]);
    
    res.status(200).json({
      success: true,
      orders: sellerOrders,
      financial: financialSummary
    });
  } catch (error) {
    console.error('Erreur orders with financial:', error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des commandes",
      error: error.message,
    });
  }
};

// Fonction à appeler périodiquement pour confirmer les transactions
const confirmerTransactionsLivrees = async () => {
  try {
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
          'commande.etatTraitement': 'livraison reçu'
        }
      }
    ]);

    let confirmees = 0;
    for (const transaction of transactionsAConfirmer) {
      try {
        await FinancialService.confirmerTransaction(transaction._id);
        confirmees++;
      } catch (error) {
        console.error(`Erreur confirmation transaction ${transaction._id}:`, error);
      }
    }

    console.log(`${confirmees}/${transactionsAConfirmer.length} transactions confirmées`);
    return { confirmees, total: transactionsAConfirmer.length };
    
  } catch (error) {
    console.error('Erreur lors de la confirmation des transactions:', error);
    throw error;
  }
};

// Tâche de déblocage
const tacheDeblocage = async () => {
  try {
    const result = await FinancialService.debloquerArgentDisponible();
    console.log('Tâche de déblocage terminée:', result);
    return result;
  } catch (error) {
    console.error('Erreur dans la tâche de déblocage:', error);
    throw error;
  }
};

// Tâche de nettoyage
const tacheNettoyage = async () => {
  try {
    const result = await FinancialService.nettoyageAutomatique();
    console.log('Tâche de nettoyage terminée:', result);
    return result;
  } catch (error) {
    console.error('Erreur dans la tâche de nettoyage:', error);
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
    console.error('Erreur recalcul soldes:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du recalcul des soldes',
      error: error.message
    });
  }
};

const gererRelanceCommande = async (commandeId, newReference) => {
  try {
    console.log(`🚀 Gestion de la relance pour commande ${commandeId}`);

    // Vérifier s'il y a des transactions annulées
    const aTransactionsAnnulees = await FinancialService.aDesTransactionsAnnulees(commandeId);

    if (aTransactionsAnnulees) {
      console.log(`🔄 Réactivation des transactions annulées...`);
      const resultat = await FinancialService.reactiverTransactionsAnnulees(commandeId, newReference);
      console.log(`✅ Résultat de la réactivation:`, resultat);
      return resultat;
    } else {
      console.log(`ℹ️ Aucune transaction annulée à réactiver`);
      return { message: "Aucune transaction annulée trouvée", count: 0 };
    }

  } catch (error) {
    console.error(`❌ Erreur lors de la gestion de la relance:`, error);
    throw error;
  }
};

module.exports = {
  getSellerDashboard,
  demanderRetrait,
  getHistoriqueTransactions,
  onCommandeLivree,
  getSellerOrdersWithFinancialInfo,
  seller_orders_with_financial,
  confirmerTransactionsLivrees,
  tacheDeblocage,
  tacheNettoyage,
  recalculerSoldes,
  gererRelanceCommande
};