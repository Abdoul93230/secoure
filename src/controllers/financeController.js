// Obtenir le dashboard financier du seller
const { Commande } = require('../Models');
const Portefeuille = require('../models/portefeuilleSchema');
const Retrait = require('../models/retraitSchema');
const Transaction = require('../models/transactionSchema');
const FinancialService = require('../services/FinancialService');
const mongoose = require("mongoose");
const getSellerDashboard = async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    const periode = req.query.periode || 30;
    
    const stats = await FinancialService.getStatistiquesFinancieres(sellerId, periode);
    
    res.status(200).json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du dashboard',
      error: error.message
    });
  }
};

// Demander un retrait
const demanderRetrait = async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    const { montantDemande, methodeRetrait, detailsRetrait } = req.body;
    
    // Validation
    if (!montantDemande || montantDemande <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Montant invalide'
      });
    }
    
    const retrait = await FinancialService.demanderRetrait(
      sellerId, 
      montantDemande, 
      methodeRetrait, 
      detailsRetrait
    );
    
    res.status(201).json({
      success: true,
      message: 'Demande de retrait créée avec succès',
      data: retrait
    });
    
  } catch (error) {
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
    const { page = 1, limit = 20, type } = req.query;
    
    const query = { sellerId };
    if (type) query.type = type;
    
    const transactions = await Transaction.find(query)
      .populate('commandeId', 'reference date')
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
    
  } catch (error) {
    console.error('Erreur lors de la mise à jour des finances:', error);
  }
};
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
          "productInfo.Clefournisseur": sellerId, // ✅ GARDER COMME AVANT
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

      // ✅ SEULE PARTIE MODIFIÉE : Lookup pour les transactions
      {
        $lookup: {
          from: "transactionsellers", // ✅ Nom de collection correct
          let: { 
            commandeId: "$_id",      // ObjectId
            sellerId: sellerId       // String (comme reçu en paramètre)
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

// Contrôleur original
const seller_orders_with_financial = async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    
    // Récupérer les commandes avec informations financières
    const sellerOrders = await getSellerOrdersWithFinancialInfo(sellerId);
    
    // Récupérer le résumé financier
    const financialSummary = await FinancialService.getStatistiquesFinancieres(sellerId);
    
    res.status(200).json({
      success: true,
      orders: sellerOrders,
      financial: financialSummary
    });
  } catch (error) {
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
    // Trouver toutes les transactions en attente avec commandes livrées
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

    // Confirmer chaque transaction
    for (const transaction of transactionsAConfirmer) {
      await FinancialService.confirmerTransaction(transaction._id);
      console.log(`Transaction confirmée: ${transaction.reference}`);
    }

    console.log(`${transactionsAConfirmer.length} transactions confirmées`);
    
  } catch (error) {
    console.error('Erreur lors de la confirmation des transactions:', error);
  }
};
const tacheDeblocage = async () => {
  try {
    await FinancialService.debloquerArgentDisponible();
  } catch (error) {
    console.error('Erreur dans la tâche de déblocage:', error);
  }
};

// 5. FONCTIONS UTILITAIRES POUR L'ADMIN

const adminApprouverRetrait = async (req, res) => {
  try {
    const { retraitId } = req.params;
    const { statut, commentaire } = req.body;
    
    const retrait = await Retrait.findByIdAndUpdate(
      retraitId,
      {
        statut,
        commentaireAdmin: commentaire,
        dateTraitement: new Date()
      },
      { new: true }
    );
    
    if (!retrait) {
      return res.status(404).json({
        success: false,
        message: 'Demande de retrait non trouvée'
      });
    }
    
    // Si approuvé, créer une transaction de retrait
    if (statut === 'APPROUVE') {
      const transaction = new Transaction({
        sellerId: retrait.sellerId,
        type: 'RETRAIT',
        statut: 'CONFIRME',
        montant: -retrait.montantDemande,
        montantNet: -retrait.montantAccorde,
        commission: retrait.fraisRetrait,
        description: `Retrait ${retrait.methodeRetrait}`,
        reference: `RETRAIT_${retrait.reference}`,
        dateConfirmation: new Date()
      });
      
      await transaction.save();
      
      retrait.transactionId = transaction._id;
      await retrait.save();
    }
    
    // Si rejeté, remettre l'argent dans le solde disponible
    if (statut === 'REJETE') {
      await Portefeuille.findOneAndUpdate(
        { sellerId: retrait.sellerId },
        {
          $inc: {
            soldeDisponible: retrait.montantDemande
          }
        }
      );
    }
    
    res.status(200).json({
      success: true,
      data: retrait
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors du traitement de la demande',
      error: error.message
    });
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
  adminApprouverRetrait,
  tacheDeblocage
};