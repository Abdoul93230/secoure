const mongoose = require("mongoose");
const Transaction = require('../models/transactionSchema');
const Portefeuille = require("../models/portefeuilleSchema");
const Retrait = require("../models/retraitSchema");

class FinancialService {

  // Créer un portefeuille pour un nouveau seller
  static async creerPortefeuille(sellerId) {
    try {
      const portefeuille = new Portefeuille({ sellerId });
      return await portefeuille.save();
    } catch (error) {
      if (error.code === 11000) {
        // Portefeuille existe déjà
        return await Portefeuille.findOne({ sellerId });
      }
      throw error;
    }
  }

  // Calculer le montant net après commission
  static calculerMontantNet(montantBrut, tauxCommission = 5) {
    const commission = (montantBrut * tauxCommission) / 100;
    return {
      montantNet: montantBrut - commission,
      commission: commission,
      tauxCommission: tauxCommission
    };
  }

  // Ajouter de l'argent au portefeuille (quand commande livrée)
  static async crediterPortefeuille(sellerId, commandeId, montantBrut, description = "Vente de produits") {
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        // Calculer le montant net
        const { montantNet, commission, tauxCommission } = this.calculerMontantNet(montantBrut);
        // console.log({montantNet, commission, tauxCommission,montantBrut});
        const dateDisponibilite = new Date();
        dateDisponibilite.setHours(dateDisponibilite.getHours() + 48);

        // Créer la transaction
        const transaction = new Transaction({
          sellerId,
          commandeId,
          type: 'CREDIT_COMMANDE',
          statut: 'EN_ATTENTE',
          montant: montantBrut,
          montantNet,
          commission,
          tauxCommission,
          description,
          reference: `TXN_${Date.now()}_${sellerId}`,
          dateDisponibilite,
          estDisponible: false
        });

        await transaction.save({ session });

        // Mettre à jour le portefeuille
        await Portefeuille.findOneAndUpdate(
          { sellerId },
          {
            $inc: {
              soldeBloqueTemporairement: montantNet,
              // soldeEnAttente: montantNet,
              soldeTotal: montantNet
            },
            dateMiseAJour: new Date()
          },
          { session, upsert: true }
        );

        return transaction;
      });

      console.log(`Portefeuille crédité: ${sellerId} - Montant: ${montantBrut}`);

    } catch (error) {
      console.error('Erreur lors du crédit du portefeuille:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // Débloquer l'argent après 48h
  static async debloquerArgentDisponible() {
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        const maintenant = new Date();

        // Trouver toutes les transactions confirmées dont la date de disponibilité est passée
        const transactionsADebloquer = await Transaction.find({
          type: 'CREDIT_COMMANDE',
          statut: 'CONFIRME',
          estDisponible: false,
          dateDisponibilite: { $lte: maintenant }
        }).session(session);

        for (const transaction of transactionsADebloquer) {
          // Marquer la transaction comme disponible
          transaction.estDisponible = true;
          await transaction.save({ session });

          // Déplacer l'argent de "bloqué temporairement" vers "disponible"
          await Portefeuille.findOneAndUpdate(
            { sellerId: transaction.sellerId },
            {
              $inc: {
                soldeBloqueTemporairement: -transaction.montantNet,
                soldeDisponible: transaction.montantNet
              },
              dateMiseAJour: new Date()
            },
            { session }
          );
        }

        console.log(`${transactionsADebloquer.length} transactions débloquées`);
      });

    } catch (error) {
      console.error('Erreur lors du déblocage de l\'argent:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // Confirmer une transaction (quand commande livrée avec succès)
  static async confirmerTransaction(transactionId) {
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        const transaction = await Transaction.findById(transactionId).session(session);

        if (!transaction || transaction.statut !== 'EN_ATTENTE') {
          throw new Error('Transaction non trouvée ou déjà traitée');
        }

        // Confirmer la transaction
        transaction.statut = 'CONFIRME';
        transaction.dateConfirmation = new Date();
        await transaction.save({ session });

        // Déplacer l'argent de "en attente" vers "disponible"
        // L'argent reste dans "soldeBloqueTemporairement" jusqu'à la date de disponibilité
        // Rien à faire ici, le déblocage se fera automatiquement via debloquerArgentDisponible()

        // await Portefeuille.findOneAndUpdate(
        //   { sellerId: transaction.sellerId },
        //   {
        //     $inc: {
        //       soldeEnAttente: -transaction.montantNet,
        //       soldeDisponible: transaction.montantNet
        //     },
        //     dateMiseAJour: new Date()
        //   },
        //   { session }
        // );
      });

    } catch (error) {
      console.error('Erreur lors de la confirmation de transaction:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // Demander un retrait
  static async demanderRetrait(sellerId, montantDemande, methodeRetrait, detailsRetrait) {
    const session = await mongoose.startSession();

    try {
      return await session.withTransaction(async () => {
        // Vérifier le solde disponible
        const portefeuille = await Portefeuille.findOne({ sellerId }).session(session);

        if (!portefeuille || portefeuille.soldeDisponible < montantDemande) {
          throw new Error('Solde insuffisant');
        }

        // Calculer les frais de retrait (exemple: 2% minimum 500 FCFA)
        const fraisRetrait = Math.max(montantDemande * 0.02, 500);
        const montantAccorde = montantDemande - fraisRetrait;

        // Créer la demande de retrait
        const retrait = new Retrait({
          sellerId,
          montantDemande,
          montantAccorde,
          fraisRetrait,
          methodeRetrait,
          detailsRetrait,
          reference: `RET_${Date.now()}_${sellerId}`
        });

        await retrait.save({ session });

        // Réserver le montant (le passer de disponible à en attente de retrait)
        await Portefeuille.findOneAndUpdate(
          { sellerId },
          {
            $inc: {
              soldeDisponible: -montantDemande
            },
            dateMiseAJour: new Date()
          },
          { session }
        );

        return retrait;
      });

    } catch (error) {
      console.error('Erreur lors de la demande de retrait:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // Obtenir les statistiques financières d'un seller
  static async getStatistiquesFinancieres(sellerId, periode = 30) {
    try {
      const dateDebut = new Date();
      dateDebut.setDate(dateDebut.getDate() - periode);

      const [portefeuille, transactions, retraits] = await Promise.all([
        Portefeuille.findOne({ sellerId }),
        Transaction.find({
          sellerId,
          dateTransaction: { $gte: dateDebut },
          statut: 'CONFIRME'
        }),
        Retrait.find({
          sellerId,
          datedemande: { $gte: dateDebut }
        })
      ]);

      const ventesTotal = transactions
        .filter(t => t.type === 'CREDIT_COMMANDE')
        .reduce((sum, t) => sum + t.montant, 0);

      const commissionsTotal = transactions
        .filter(t => t.type === 'CREDIT_COMMANDE')
        .reduce((sum, t) => sum + t.commission, 0);

      const retraitsTotal = retraits
        .filter(r => r.statut === 'TRAITE')
        .reduce((sum, r) => sum + r.montantAccorde, 0);

      // Ajouter les transactions en attente de déblocage
      const transactionsEnAttenteDeblocage = await Transaction.find({
        sellerId,
        type: 'CREDIT_COMMANDE',
        statut: 'CONFIRME',
        estDisponible: false
      });

      return {
        portefeuille,
        statistiques: {
          ventesTotal,
          commissionsTotal,
          retraitsTotal,
          nombreVentes: transactions.filter(t => t.type === 'CREDIT_COMMANDE').length,
          nombreRetraits: retraits.length,
          argentBloqueTemporairement: portefeuille?.soldeBloqueTemporairement || 0,
          prochaineDisponibilite: transactionsEnAttenteDeblocage.length > 0
            ? transactionsEnAttenteDeblocage.sort((a, b) => a.dateDisponibilite - b.dateDisponibilite)[0].dateDisponibilite
            : null
        },
        transactionsRecentes: transactions.slice(0, 10),
        retraitsRecents: retraits.slice(0, 5)
      };

    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques:', error);
      throw error;
    }
  }
}


module.exports = FinancialService;