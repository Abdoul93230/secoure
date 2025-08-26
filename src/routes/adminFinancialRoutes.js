const express = require('express');
const router = express.Router();
const Retrait = require('../models/retraitSchema');
const TransactionSeller = require('../models/transactionSchema');
const Portefeuille = require('../models/portefeuilleSchema');
const { Commande } = require('../Models');
const FinancialService = require('../services/FinancialService');
const FinancialStateManager = require('../utils/financialStateManager');
const mongoose = require('mongoose');

// Middleware de vérification admin
const verifyAdmin = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    // TODO: Implémenter la vérification JWT réelle
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Token d\'authentification requis'
        });
    }
    // Pour l'instant, on passe directement
    req.admin = { id: 'admin_id', name: 'Admin' }; // À remplacer par les vraies données du token
    next();
};

// Dashboard financier global
router.get('/finances/dashboard', verifyAdmin, async (req, res) => {
    try {
        const { periode = 30 } = req.query;
        const dateDebut = new Date();
        dateDebut.setDate(dateDebut.getDate() - periode);

        // Statistiques générales
        const [
            totalVentes,
            totalCommissions,
            retraitsStats,
            sellersActifs,
            transactionsRecentes,
            commandesEnCours,
            retraitsParStatut
        ] = await Promise.all([
            // Total des ventes
            TransactionSeller.aggregate([
                { 
                    $match: { 
                        type: 'CREDIT_COMMANDE', 
                        statut: 'CONFIRME', 
                        dateTransaction: { $gte: dateDebut } 
                    } 
                },
                { 
                    $group: { 
                        _id: null, 
                        total: { $sum: '$montant' }, 
                        count: { $sum: 1 } 
                    } 
                }
            ]),
            
            // Total des commissions
            TransactionSeller.aggregate([
                { 
                    $match: { 
                        type: 'CREDIT_COMMANDE', 
                        statut: 'CONFIRME', 
                        dateTransaction: { $gte: dateDebut } 
                    } 
                },
                { 
                    $group: { 
                        _id: null, 
                        total: { $sum: '$commission' } 
                    } 
                }
            ]),
            
            // Statistiques des retraits
            Retrait.aggregate([
                {
                    $group: {
                        _id: '$statut',
                        count: { $sum: 1 },
                        montant: { $sum: '$montantDemande' }
                    }
                }
            ]),
            
            // Sellers actifs
            Portefeuille.countDocuments({ soldeTotal: { $gt: 0 } }),
            
            // Transactions récentes
            TransactionSeller.find()
                .sort({ dateTransaction: -1 })
                .limit(10)
                .populate('commandeId', 'reference')
                .populate('retraitId', 'reference'),
            
            // Commandes en cours
            Commande.countDocuments({ etatTraitement: { $ne: 'livraison reçu' } }),
            
            // Répartition des retraits par statut
            Retrait.aggregate([
                {
                    $group: {
                        _id: '$statut',
                        count: { $sum: 1 },
                        montant: { $sum: '$montantDemande' }
                    }
                }
            ])
        ]);

        // Calculs supplémentaires
        const retraitsEnAttente = retraitsStats.find(r => r._id === 'EN_ATTENTE')?.count || 0;
        const argentBloqueRetraits = retraitsStats.find(r => r._id === 'EN_ATTENTE')?.montant || 0;

        res.json({
            success: true,
            data: {
                ventesTotales: totalVentes[0] || { total: 0, count: 0 },
                commissionsTotal: totalCommissions[0]?.total || 0,
                retraitsEnAttente,
                argentBloqueRetraits,
                sellersActifs,
                commandesEnCours,
                transactionsRecentes,
                retraitsParStatut,
                periode: Number(periode)
            }
        });
    } catch (error) {
        console.error('Erreur dashboard admin:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération du dashboard',
            error: error.message
        });
    }
});

// Voir toutes les demandes de retrait
router.get('/finances/retraits', verifyAdmin, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            statut,
            sellerId,
            methodeRetrait,
            dateStart,
            dateEnd
        } = req.query;

        const query = {};
        if (statut) query.statut = statut;
        if (sellerId) query.sellerId = sellerId;
        if (methodeRetrait) query.methodeRetrait = methodeRetrait;
        
        if (dateStart || dateEnd) {
            query.datedemande = {};
            if (dateStart) query.datedemande.$gte = new Date(dateStart);
            if (dateEnd) query.datedemande.$lte = new Date(dateEnd);
        }

        const retraits = await Retrait.find(query)
            .sort({ datedemande: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .populate('transactionId')
            .lean();

        // Enrichir avec les infos des sellers
        const retraitsAvecSeller = await Promise.all(
            retraits.map(async (retrait) => {
                const portefeuille = await Portefeuille.findOne({ sellerId: retrait.sellerId });
                return {
                    ...retrait,
                    sellerInfo: portefeuille ? {
                        soldeDisponible: portefeuille.soldeDisponible,
                        soldeTotal: portefeuille.soldeTotal,
                        soldeBloqueTemporairement: portefeuille.soldeBloqueTemporairement
                    } : null
                };
            })
        );

        const total = await Retrait.countDocuments(query);

        res.json({
            success: true,
            data: {
                retraits: retraitsAvecSeller,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Erreur liste retraits:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des retraits',
            error: error.message
        });
    }
});

// Traiter une demande de retrait
router.put('/finances/retraits/:retraitId/status', verifyAdmin, async (req, res) => {
    try {
        const { retraitId } = req.params;
        const { statut, commentaire } = req.body;

        if (!['APPROUVE', 'REJETE', 'TRAITE', 'ANNULE'].includes(statut)) {
            return res.status(400).json({
                success: false,
                message: 'Statut invalide'
            });
        }

        const retrait = await FinancialService.traiterRetrait(
            retraitId,
            statut,
            req.admin.id,
            commentaire
        );

        res.json({
            success: true,
            data: retrait,
            message: `Demande de retrait ${statut.toLowerCase()}`
        });
    } catch (error) {
        console.error('Erreur traitement retrait:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Audit financier
router.get('/finances/audit', verifyAdmin, async (req, res) => {
    try {
        const portefeuilles = await Portefeuille.find({});
        const anomalies = [];

        // Vérifier la cohérence des soldes
        for (const portefeuille of portefeuilles) {
            const transactions = await TransactionSeller.find({
                sellerId: portefeuille.sellerId,
                statut: 'CONFIRME'
            });

            let soldeCalcule = 0;
            let soldeDisponibleCalcule = 0;
            let soldeBloqueCalcule = 0;

            transactions.forEach(t => {
                if (t.type === 'CREDIT_COMMANDE') {
                    soldeCalcule += t.montantNet;
                    if (t.estDisponible) {
                        soldeDisponibleCalcule += t.montantNet;
                    } else {
                        soldeBloqueCalcule += t.montantNet;
                    }
                } else if (t.type === 'RETRAIT') {
                    soldeCalcule += t.montantNet; // négatif
                }
            });

            const retraitsEnAttente = await Retrait.find({
                sellerId: portefeuille.sellerId,
                statut: 'EN_ATTENTE'
            });
            const soldeReserveCalcule = retraitsEnAttente.reduce((sum, r) => sum + r.montantDemande, 0);

            // Vérifier les incohérences
            const tolerance = 1; // 1 FCFA de tolérance
            if (Math.abs(soldeCalcule - portefeuille.soldeTotal) > tolerance ||
                Math.abs(soldeDisponibleCalcule - portefeuille.soldeDisponible) > tolerance ||
                Math.abs(soldeBloqueCalcule - portefeuille.soldeBloqueTemporairement) > tolerance ||
                Math.abs(soldeReserveCalcule - portefeuille.soldeReserveRetrait) > tolerance) {
                
                anomalies.push({
                    sellerId: portefeuille.sellerId,
                    soldeEnregistre: {
                        total: portefeuille.soldeTotal,
                        disponible: portefeuille.soldeDisponible,
                        bloque: portefeuille.soldeBloqueTemporairement,
                        reserve: portefeuille.soldeReserveRetrait
                    },
                    soldeCalcule: {
                        total: soldeCalcule,
                        disponible: soldeDisponibleCalcule,
                        bloque: soldeBloqueCalcule,
                        reserve: soldeReserveCalcule
                    },
                    differences: {
                        total: soldeCalcule - portefeuille.soldeTotal,
                        disponible: soldeDisponibleCalcule - portefeuille.soldeDisponible,
                        bloque: soldeBloqueCalcule - portefeuille.soldeBloqueTemporairement,
                        reserve: soldeReserveCalcule - portefeuille.soldeReserveRetrait
                    }
                });
            }
        }

        // Transactions orphelines
        const transactionsSansCommande = await TransactionSeller.find({
            type: 'CREDIT_COMMANDE',
            $or: [
                { commandeId: { $exists: false } },
                { commandeId: null }
            ]
        }).limit(10);

        // Commandes livrées sans transaction
        const commandesSansTransaction = await Commande.aggregate([
            { $match: { etatTraitement: 'livraison reçu' } },
            {
                $lookup: {
                    from: 'transactionsellers',
                    localField: '_id',
                    foreignField: 'commandeId',
                    as: 'transactions'
                }
            },
            { $match: { transactions: { $size: 0 } } },
            { $limit: 10 },
            {
                $project: {
                    reference: 1,
                    prix: 1,
                    date: 1,
                    etatTraitement: 1
                }
            }
        ]);

        // Retraits sans transaction associée
        const retraitsApprouvesSansTransaction = await Retrait.find({
            statut: 'APPROUVE',
            transactionId: { $exists: false }
        }).limit(10);

        res.json({
            success: true,
            data: {
                anomaliesSoldes: anomalies,
                transactionsSansCommande,
                commandesSansTransaction,
                retraitsApprouvesSansTransaction,
                statistiques: {
                    totalPortefeuilles: portefeuilles.length,
                    anomaliesDetectees: anomalies.length,
                    transactionsOrphelines: transactionsSansCommande.length,
                    commandesSansTransaction: commandesSansTransaction.length,
                    retraitsInconsistants: retraitsApprouvesSansTransaction.length
                }
            }
        });
    } catch (error) {
        console.error('Erreur audit:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'audit',
            error: error.message
        });
    }
});

// Recalculer les soldes d'un seller
router.post('/finances/recalculate-balances/:sellerId', verifyAdmin, async (req, res) => {
    try {
        const { sellerId } = req.params;
        
        const result = await FinancialService.recalculerSoldes(sellerId);

        res.json({
            success: true,
            message: 'Soldes recalculés avec succès',
            data: result
        });
    } catch (error) {
        console.error('Erreur recalcul:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors du recalcul des soldes',
            error: error.message
        });
    }
});

// Forcer la confirmation des transactions
router.post('/finances/force-confirm-transactions', verifyAdmin, async (req, res) => {
    try {
        const { commandeIds } = req.body;

        if (!Array.isArray(commandeIds)) {
            return res.status(400).json({
                success: false,
                message: 'commandeIds doit être un tableau'
            });
        }

        const transactions = await TransactionSeller.find({
            commandeId: { $in: commandeIds.map(id => new mongoose.Types.ObjectId(id)) },
            statut: 'EN_ATTENTE'
        });

        let confirmees = 0;
        for (const transaction of transactions) {
            try {
                await FinancialService.confirmerTransaction(transaction._id);
                confirmees++;
            } catch (error) {
                console.error(`Erreur confirmation ${transaction._id}:`, error);
            }
        }

        res.json({
            success: true,
            message: `${confirmees}/${transactions.length} transactions confirmées`,
            data: { 
                transactionsConfirmees: confirmees,
                transactionsTrouvees: transactions.length 
            }
        });
    } catch (error) {
        console.error('Erreur confirmation forcée:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la confirmation forcée',
            error: error.message
        });
    }
});

// Obtenir les détails financiers d'une commande
router.get('/finances/commandes/:commandeId/details', verifyAdmin, async (req, res) => {
    try {
        const { commandeId } = req.params;

        const commande = await Commande.findById(commandeId).populate('nbrProduits.produit');
        if (!commande) {
            return res.status(404).json({
                success: false,
                message: 'Commande non trouvée'
            });
        }

        const transactions = await TransactionSeller.find({ commandeId });

        // Calculer les détails par seller
        const detailsParSeller = {};
        for (const item of commande.nbrProduits) {
            const sellerId = item.produit.Clefournisseur;
            const prix = item.produit.prixPromo > 0 ? item.produit.prixPromo : item.produit.prix;
            const montant = item.quantite * prix;

            if (!detailsParSeller[sellerId]) {
                detailsParSeller[sellerId] = {
                    montantBrut: 0,
                    produits: [],
                    transaction: null
                };
            }

            detailsParSeller[sellerId].montantBrut += montant;
            detailsParSeller[sellerId].produits.push({
                nom: item.produit.name,
                quantite: item.quantite,
                prix: prix,
                montant: montant
            });

            const transaction = transactions.find(t => t.sellerId === sellerId);
            if (transaction) {
                detailsParSeller[sellerId].transaction = transaction;
            }
        }

        res.json({
            success: true,
            data: {
                commande: {
                    id: commande._id,
                    reference: commande.reference,
                    prix: commande.prix,
                    date: commande.date,
                    etatTraitement: commande.etatTraitement,
                    statusPayment: commande.statusPayment
                },
                detailsParSeller,
                transactions
            }
        });
    } catch (error) {
        console.error('Erreur détails commande:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des détails',
            error: error.message
        });
    }
});

// Obtenir la liste des sellers avec leurs statistiques
router.get('/finances/sellers-stats', verifyAdmin, async (req, res) => {
    try {
        const stats = await Portefeuille.aggregate([
            {
                $lookup: {
                    from: 'transactionsellers',
                    localField: 'sellerId',
                    foreignField: 'sellerId',
                    as: 'transactions'
                }
            },
            {
                $lookup: {
                    from: 'retraits',
                    localField: 'sellerId',
                    foreignField: 'sellerId',
                    as: 'retraits'
                }
            },
            {
                $project: {
                    sellerId: 1,
                    soldeTotal: 1,
                    soldeDisponible: 1,
                    soldeBloqueTemporairement: 1,
                    soldeReserveRetrait: 1,
                    nombreTransactions: { $size: '$transactions' },
                    nombreRetraits: { $size: '$retraits' },
                    derniereActivite: { $max: '$transactions.dateTransaction' },
                    retraitsEnAttente: {
                        $size: {
                            $filter: {
                                input: '$retraits',
                                cond: { $eq: ['$$this.statut', 'EN_ATTENTE'] }
                            }
                        }
                    }
                }
            },
            { $sort: { soldeTotal: -1 } }
        ]);

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Erreur stats sellers:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des statistiques sellers',
            error: error.message
        });
    }
});

// Exécuter les tâches de maintenance
router.post('/finances/maintenance/deblocage', verifyAdmin, async (req, res) => {
    try {
        const result = await FinancialService.debloquerArgentDisponible();
        res.json({
            success: true,
            message: 'Tâche de déblocage exécutée',
            data: result
        });
    } catch (error) {
        console.error('Erreur déblocage:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors du déblocage',
            error: error.message
        });
    }
});

router.post('/finances/maintenance/nettoyage', verifyAdmin, async (req, res) => {
    try {
        const result = await FinancialService.nettoyageAutomatique();
        res.json({
            success: true,
            message: 'Tâche de nettoyage exécutée',
            data: result
        });
    } catch (error) {
        console.error('Erreur nettoyage:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors du nettoyage',
            error: error.message
        });
    }
});

// Créer une transaction de correction manuelle
router.post('/finances/correction-transaction', verifyAdmin, async (req, res) => {
    try {
        const { sellerId, montant, description, type = 'CORRECTION' } = req.body;

        if (!sellerId || !montant || !description) {
            return res.status(400).json({
                success: false,
                message: 'Paramètres manquants'
            });
        }

        const transaction = new TransactionSeller({
            sellerId,
            type,
            statut: 'CONFIRME',
            montant,
            montantNet: montant,
            commission: 0,
            description,
            dateConfirmation: new Date(),
            creeParAdmin: true,
            adminId: req.admin.id,
            commentaireAdmin: `Correction manuelle par ${req.admin.name}`
        });

        await transaction.save();

        // Mettre à jour le portefeuille
        await FinancialService.mettreAJourPortefeuille(sellerId, {
            soldeTotal: montant,
            soldeDisponible: montant > 0 ? montant : 0
        });

        res.json({
            success: true,
            message: 'Transaction de correction créée',
            data: transaction
        });
    } catch (error) {
        console.error('Erreur correction:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création de la correction',
            error: error.message
        });
    }
});

// NOUVELLES ROUTES POUR LA GESTION AMÉLIORÉE

// Diagnostiquer une commande
router.get('/finances/commandes/:commandeId/diagnostic', verifyAdmin, async (req, res) => {
  try {
    const { commandeId } = req.params;
    const diagnostic = await FinancialStateManager.diagnostiquerCommande(commandeId);
    
    res.json({
      success: true,
      data: diagnostic
    });
  } catch (error) {
    console.error('❌ Erreur diagnostic:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du diagnostic',
      error: error.message
    });
  }
});

// Réparer une commande
router.post('/finances/commandes/:commandeId/repair', verifyAdmin, async (req, res) => {
  try {
    const { commandeId } = req.params;
    const { recalculerSoldes = false } = req.body;
    
    const reparation = await FinancialStateManager.reparerCommande(commandeId, {
      recalculerSoldes
    });
    
    res.json({
      success: true,
      data: reparation
    });
  } catch (error) {
    console.error('❌ Erreur réparation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la réparation',
      error: error.message
    });
  }
});

// Changer l'état d'une commande avec validation
router.put('/finances/commandes/:commandeId/change-state', verifyAdmin, async (req, res) => {
  try {
    const { commandeId } = req.params;
    const { nouvelEtat, reference } = req.body;
    
    const commande = await Commande.findById(commandeId);
    if (!commande) {
      return res.status(404).json({
        success: false,
        message: 'Commande non trouvée'
      });
    }
    
    const ancienEtat = commande.etatTraitement;
    
    // Utiliser le gestionnaire d'état
    const resultat = await FinancialStateManager.changerEtatCommande(
      commandeId,
      ancienEtat,
      nouvelEtat,
      commande,
      { reference }
    );
    
    if (resultat.success) {
      // Mettre à jour la commande dans la base de données
      await Commande.findByIdAndUpdate(commandeId, { 
        etatTraitement: nouvelEtat,
        reference: reference || commande.reference
      });
    }
    
    res.json({
      success: resultat.success,
      data: resultat
    });
    
  } catch (error) {
    console.error('❌ Erreur changement état:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du changement d\'état',
      error: error.message
    });
  }
});

// Obtenir les transitions possibles pour une commande
router.get('/finances/commandes/:commandeId/transitions', verifyAdmin, async (req, res) => {
  try {
    const { commandeId } = req.params;
    
    const commande = await Commande.findById(commandeId);
    if (!commande) {
      return res.status(404).json({
        success: false,
        message: 'Commande non trouvée'
      });
    }
    
    const transitionsPossibles = FinancialStateManager.getTransitionsPossibles(commande.etatTraitement);
    
    res.json({
      success: true,
      data: {
        etatActuel: commande.etatTraitement,
        transitionsPossibles,
        commandeId
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur transitions:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des transitions',
      error: error.message
    });
  }
});

module.exports = router;