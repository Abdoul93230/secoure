const express = require('express');
const router = express.Router();
const Retrait = require('../models/retraitSchema');
const TransactionSeller = require('../models/transactionSchema'); // Utiliser le bon nom
const Portefeuille = require('../models/portefeuilleSchema');
const { Commande } = require('../Models');
const FinancialService = require('../services/FinancialService');
const mongoose = require('mongoose');

// Middleware de vérification admin (à adapter selon votre système d'auth)
const verifyAdmin = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    // Ici vous devriez vérifier le token JWT et s'assurer que c'est un admin
    // Pour l'exemple, on passe directement
    next();
};

// Dashboard financier global - ROUTE SPÉCIFIQUE EN PREMIER
router.get('/finances/dashboard', verifyAdmin, async (req, res) => {
    try {
        const { periode = 30 } = req.query;
        const dateDebut = new Date();
        dateDebut.setDate(dateDebut.getDate() - periode);

        // Statistiques générales
        const [
            totalVentes,
            totalCommissions,
            retraitsEnAttente,
            sellersActifs,
            transactionsRecentes,
            commandesEnCours
        ] = await Promise.all([
            TransactionSeller.aggregate([
                { $match: { type: 'CREDIT_COMMANDE', statut: 'CONFIRME', dateTransaction: { $gte: dateDebut } } },
                { $group: { _id: null, total: { $sum: '$montant' }, count: { $sum: 1 } } }
            ]),
            TransactionSeller.aggregate([
                { $match: { type: 'CREDIT_COMMANDE', statut: 'CONFIRME', dateTransaction: { $gte: dateDebut } } },
                { $group: { _id: null, total: { $sum: '$commission' } } }
            ]),
            Retrait.countDocuments({ statut: 'EN_ATTENTE' }),
            Portefeuille.countDocuments({ soldeTotal: { $gt: 0 } }),
            TransactionSeller.find().sort({ dateTransaction: -1 }).limit(10),
            Commande.countDocuments({ etatTraitement: { $ne: 'livraison reçu' } })
        ]);

        // Répartition des retraits par statut
        const retraitsParStatut = await Retrait.aggregate([
            {
                $group: {
                    _id: '$statut',
                    count: { $sum: 1 },
                    montant: { $sum: '$montantDemande' }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                ventesTotales: totalVentes[0] || { total: 0, count: 0 },
                commissionsTotal: totalCommissions[0]?.total || 0,
                retraitsEnAttente,
                sellersActifs,
                commandesEnCours,
                transactionsRecentes,
                retraitsParStatut
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération du dashboard',
            error: error.message
        });
    }
});

// Voir toutes les demandes de retrait - ROUTE SPÉCIFIQUE
router.get('/finances/retraits', verifyAdmin, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            statut,
            sellerId,
            methodeRetrait
        } = req.query;

        const query = {};
        if (statut) query.statut = statut;
        if (sellerId) query.sellerId = sellerId;
        if (methodeRetrait) query.methodeRetrait = methodeRetrait;

        const retraits = await Retrait.find(query)
            .sort({ datedemande: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        // Récupérer les infos des sellers pour chaque retrait
        const retraitsAvecSeller = await Promise.all(
            retraits.map(async (retrait) => {
                const portefeuille = await Portefeuille.findOne({ sellerId: retrait.sellerId });
                return {
                    ...retrait,
                    sellerInfo: portefeuille ? {
                        soldeDisponible: portefeuille.soldeDisponible,
                        soldeTotal: portefeuille.soldeTotal
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
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des retraits',
            error: error.message
        });
    }
});

// Approuver/Rejeter une demande de retrait - ROUTE SPÉCIFIQUE
router.put('/finances/retraits/:retraitId/status', verifyAdmin, async (req, res) => {
    try {
        const { retraitId } = req.params;
        const { statut, commentaire } = req.body;

        if (!['APPROUVE', 'REJETE', 'TRAITE'].includes(statut)) {
            return res.status(400).json({
                success: false,
                message: 'Statut invalide'
            });
        }

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
            const transaction = new TransactionSeller({
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
                    $inc: { soldeDisponible: retrait.montantDemande }
                }
            );
        }

        res.json({
            success: true,
            data: retrait,
            message: `Demande de retrait ${statut.toLowerCase()}`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erreur lors du traitement de la demande',
            error: error.message
        });
    }
});

// Audit financier - ROUTE SPÉCIFIQUE
router.get('/finances/audit', verifyAdmin, async (req, res) => {
    try {
        // Vérifier la cohérence des soldes
        const portefeuilles = await Portefeuille.find({});
        const anomalies = [];

        for (const portefeuille of portefeuilles) {
            const transactions = await TransactionSeller.find({
                sellerId: portefeuille.sellerId,
                statut: 'CONFIRME'
            });

            const soldeCalcule = transactions.reduce((sum, t) => {
                return sum + (t.type === 'CREDIT_COMMANDE' ? t.montantNet : t.montantNet);
            }, 0);

            if (Math.abs(soldeCalcule - portefeuille.soldeTotal) > 1) {
                anomalies.push({
                    sellerId: portefeuille.sellerId,
                    soldeEnregistre: portefeuille.soldeTotal,
                    soldeCalcule,
                    difference: soldeCalcule - portefeuille.soldeTotal
                });
            }
        }

        // Transactions sans commande associée
        const transactionsSansCommande = await TransactionSeller.find({
            type: 'CREDIT_COMMANDE',
            commandeId: { $exists: false }
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
            { $limit: 10 }
        ]);

        res.json({
            success: true,
            data: {
                anomaliesSoldes: anomalies,
                transactionsSansCommande,
                commandesSansTransaction: commandesSansTransaction.map(c => ({
                    id: c._id,
                    reference: c.reference,
                    prix: c.prix,
                    date: c.date
                })),
                statistiques: {
                    totalPortefeuilles: portefeuilles.length,
                    anomaliesDetectees: anomalies.length,
                    transactionsOrphelines: transactionsSansCommande.length,
                    commandesSansTransaction: commandesSansTransaction.length
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'audit',
            error: error.message
        });
    }
});

// Recalculer les soldes d'un seller - ROUTE SPÉCIFIQUE
router.post('/finances/recalculate-balances/:sellerId', verifyAdmin, async (req, res) => {
    try {
        const { sellerId } = req.params;

        const transactions = await TransactionSeller.find({
            sellerId,
            statut: 'CONFIRME'
        });

        const soldeTotal = transactions.reduce((sum, t) => {
            return sum + (t.type === 'CREDIT_COMMANDE' ? t.montantNet : t.montantNet);
        }, 0);

        const transactionsDisponibles = transactions.filter(t =>
            t.type === 'CREDIT_COMMANDE' && t.estDisponible
        );
        const soldeDisponible = transactionsDisponibles.reduce((sum, t) => sum + t.montantNet, 0);

        const transactionsBloquees = transactions.filter(t =>
            t.type === 'CREDIT_COMMANDE' && !t.estDisponible
        );
        const soldeBloqueTemporairement = transactionsBloquees.reduce((sum, t) => sum + t.montantNet, 0);

        await Portefeuille.findOneAndUpdate(
            { sellerId },
            {
                soldeTotal,
                soldeDisponible,
                soldeBloqueTemporairement,
                soldeEnAttente: 0, // Reset car géré différemment maintenant
                dateMiseAJour: new Date()
            },
            { upsert: true }
        );

        res.json({
            success: true,
            message: 'Soldes recalculés avec succès',
            data: {
                soldeTotal,
                soldeDisponible,
                soldeBloqueTemporairement
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erreur lors du recalcul des soldes',
            error: error.message
        });
    }
});

// Forcer la confirmation des transactions - ROUTE SPÉCIFIQUE
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
            commandeId: { $in: commandeIds },
            statut: 'EN_ATTENTE'
        });

        for (const transaction of transactions) {
            await FinancialService.confirmerTransaction(transaction._id);
        }

        res.json({
            success: true,
            message: `${transactions.length} transactions confirmées`,
            data: { transactionsConfirmees: transactions.length }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la confirmation forcée',
            error: error.message
        });
    }
});

// Obtenir les détails financiers d'une commande - ROUTE SPÉCIFIQUE
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
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des détails',
            error: error.message
        });
    }
});

// Obtenir la liste des sellers avec leurs statistiques - ROUTE SPÉCIFIQUE
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
                $project: {
                    sellerId: 1,
                    soldeTotal: 1,
                    soldeDisponible: 1,
                    soldeBloqueTemporairement: 1,
                    nombreTransactions: { $size: '$transactions' },
                    derniereActivite: { $max: '$transactions.dateTransaction' }
                }
            },
            { $sort: { soldeTotal: -1 } }
        ]);

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des statistiques sellers',
            error: error.message
        });
    }
});

module.exports = router;