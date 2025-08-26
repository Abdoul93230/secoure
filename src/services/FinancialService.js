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
        return await Portefeuille.findOne({ sellerId });
      }
      throw error;
    }
  }

  // Calculer le montant net après commission
  static calculerMontantNet(montantBrut, tauxCommission = 5) {
    const commission = Math.round((montantBrut * tauxCommission) / 100);
    return {
      montantNet: montantBrut - commission,
      commission: commission,
      tauxCommission: tauxCommission
    };
  }

  // Calculer les frais de retrait
  static calculerFraisRetrait(montant, methode) {
    switch (methode) {
      case 'MOBILE_MONEY':
        return Math.max(Math.round(montant * 0.02), 500);
      case 'VIREMENT_BANCAIRE':
        return 1000;
      case 'ESPECES':
        return 0;
      default:
        return 0;
    }
  }

  // Ajouter de l'argent au portefeuille (quand commande livrée)
  static async crediterPortefeuille(sellerId, commandeId, montantBrut, description = "Vente de produits", reference) {
    const session = await mongoose.startSession();

    try {
      return await session.withTransaction(async () => {
        // Vérifier si une transaction existe déjà pour cette commande
        const transactionExistante = await Transaction.findOne({
          sellerId,
          commandeId,
          type: 'CREDIT_COMMANDE'
        }).session(session);

        if (transactionExistante) {
          console.log(`Transaction déjà existante pour la commande ${commandeId}`);
          return transactionExistante;
        }

        // Calculer le montant net
        const { montantNet, commission, tauxCommission } = this.calculerMontantNet(montantBrut);

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
          dateDisponibilite,
          estDisponible: false,
          reference,
        });

        await transaction.save({ session });

        // Mettre à jour le portefeuille
        await this.mettreAJourPortefeuille(sellerId, {
          soldeTotal: montantNet,
          soldeEnAttente: montantNet
        }, session);

        console.log(`Portefeuille crédité: ${sellerId} - Montant: ${montantBrut} - Net: ${montantNet}`);
        return transaction;
      });

    } catch (error) {
      console.error('Erreur lors du crédit du portefeuille:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // Confirmer une transaction (quand commande livrée avec succès)
  static async confirmerTransaction(transactionId) {
    const session = await mongoose.startSession();

    try {
      return await session.withTransaction(async () => {
        const transaction = await Transaction.findById(transactionId).session(session);

        if (!transaction || transaction.statut !== 'EN_ATTENTE') {
          throw new Error('Transaction non trouvée ou déjà traitée');
        }

        // Confirmer la transaction
        transaction.statut = 'CONFIRME';
        transaction.dateConfirmation = new Date();
        await transaction.save({ session });

        // Déplacer l'argent de "en attente" vers "bloqué temporairement"
        await this.mettreAJourPortefeuille(transaction.sellerId, {
          soldeEnAttente: -transaction.montantNet,
          soldeBloqueTemporairement: transaction.montantNet
        }, session);

        console.log(`Transaction confirmée: ${transaction.reference}`);
        return transaction;
      });

    } catch (error) {
      console.error('Erreur lors de la confirmation de transaction:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }
  static async confirmerTransaction2(transactionId) {
    const session = await mongoose.startSession();

    try {
      return await session.withTransaction(async () => {
        const transaction = await Transaction.findById(transactionId).session(session);

        if (!transaction || transaction.statut !== 'ANNULE') {
          throw new Error('Transaction non trouvée ou déjà traitée');
        }

        // Confirmer la transaction
        transaction.statut = 'EN_ATTENTE';
        transaction.dateConfirmation = new Date();
        await transaction.save({ session });

        // Mettre à jour le portefeuille
        await this.mettreAJourPortefeuille(transaction.sellerId, {
          soldeTotal: transaction.montantNet,
          soldeEnAttente: transaction.montantNet
        }, session);

        console.log(`Transaction confirmée: ${transaction.reference}`);
        return transaction;
      });

    } catch (error) {
      console.error('Erreur lors de la confirmation de transaction:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // Débloquer l'argent après 48h
  static async debloquerArgentDisponible() {
    const session = await mongoose.startSession();

    try {
      return await session.withTransaction(async () => {
        const maintenant = new Date();

        const transactionsADebloquer = await Transaction.find({
          type: 'CREDIT_COMMANDE',
          statut: 'CONFIRME',
          estDisponible: false,
          dateDisponibilite: { $lte: maintenant }
        }).session(session);

        let totalDebloque = 0;

        for (const transaction of transactionsADebloquer) {
          // Marquer la transaction comme disponible
          transaction.estDisponible = true;
          await transaction.save({ session });

          // Déplacer l'argent vers le solde disponible
          await this.mettreAJourPortefeuille(transaction.sellerId, {
            soldeBloqueTemporairement: -transaction.montantNet,
            soldeDisponible: transaction.montantNet
          }, session);

          totalDebloque += transaction.montantNet;
        }

        console.log(`${transactionsADebloquer.length} transactions débloquées - Total: ${totalDebloque} FCFA`);
        return { count: transactionsADebloquer.length, montant: totalDebloque };
      });

    } catch (error) {
      console.error('Erreur lors du déblocage de l\'argent:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // Demander un retrait
  static async demanderRetrait(sellerId, montantDemande, methodeRetrait, detailsRetrait, reference) {
    const session = await mongoose.startSession();

    try {
      return await session.withTransaction(async () => {
        // Vérifier le solde disponible
        const portefeuille = await Portefeuille.findOne({ sellerId }).session(session);

        if (!portefeuille || portefeuille.soldeDisponible < montantDemande) {
          throw new Error(`Solde insuffisant. Disponible: ${portefeuille?.soldeDisponible || 0} FCFA`);
        }

        // Vérifier s'il n'y a pas déjà une demande en attente
        const demandeEnAttente = await Retrait.findOne({
          sellerId,
          statut: 'EN_ATTENTE'
        }).session(session);

        if (demandeEnAttente) {
          throw new Error('Vous avez déjà une demande de retrait en attente');
        }

        // Calculer les frais
        const fraisRetrait = this.calculerFraisRetrait(montantDemande, methodeRetrait);
        const montantAccorde = montantDemande - fraisRetrait;

        // Créer la demande de retrait
        const retrait = new Retrait({
          sellerId,
          montantDemande,
          montantAccorde,
          fraisRetrait,
          methodeRetrait,
          detailsRetrait,
          reference,
        });

        await retrait.save({ session });

        // Réserver le montant
        await this.mettreAJourPortefeuille(sellerId, {
          soldeDisponible: -montantDemande,
          soldeReserveRetrait: montantDemande
        }, session);

        console.log(`Demande de retrait créée: ${retrait.reference} - ${montantDemande} FCFA`);
        return retrait;
      });

    } catch (error) {
      console.error('Erreur lors de la demande de retrait:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // Traiter une demande de retrait (Admin)
  static async traiterRetrait(retraitId, nouveauStatut, adminId, commentaire = '') {
    const session = await mongoose.startSession();

    try {
      return await session.withTransaction(async () => {
        const retrait = await Retrait.findById(retraitId).session(session);

        if (!retrait) {
          throw new Error('Demande de retrait non trouvée');
        }

        if (retrait.statut !== 'EN_ATTENTE') {
          throw new Error('Cette demande a déjà été traitée');
        }

        const ancienStatut = retrait.statut;

        // Mettre à jour le retrait
        retrait.statut = nouveauStatut;
        retrait.dateTraitement = new Date();
        retrait.adminId = adminId;
        retrait.commentaireAdmin = commentaire;

        // Ajouter à l'historique
        retrait.historiqueStatut.push({
          ancienStatut,
          nouveauStatut,
          adminId,
          commentaire
        });

        await retrait.save({ session });

        // Traitement selon le nouveau statut
        if (nouveauStatut === 'APPROUVE') {
          // Créer une transaction de retrait
          const transaction = new Transaction({
            sellerId: retrait.sellerId,
            retraitId: retrait._id,
            type: 'RETRAIT',
            statut: 'CONFIRME',
            montant: -retrait.montantDemande,
            montantNet: -retrait.montantAccorde,
            commission: retrait.fraisRetrait,
            description: `Retrait ${retrait.methodeRetrait} - ${retrait.reference}`,
            dateConfirmation: new Date(),
            creeParAdmin: true,
            adminId,
            reference: retrait.reference
          });

          await transaction.save({ session });
          retrait.transactionId = transaction._id;
          await retrait.save({ session });

          // Déduire du solde réservé et du solde total
          await this.mettreAJourPortefeuille(retrait.sellerId, {
            soldeReserveRetrait: -retrait.montantDemande,
            // soldeTotal: -retrait.montantAccorde
            soldeTotal: -retrait.montantDemande
          }, session);

        } else if (nouveauStatut === 'REJETE' || nouveauStatut === 'ANNULE') {
          // Remettre l'argent dans le solde disponible
          await this.mettreAJourPortefeuille(retrait.sellerId, {
            soldeReserveRetrait: -retrait.montantDemande,
            soldeDisponible: retrait.montantDemande
          }, session);
        }

        console.log(`Retrait ${retrait.reference} ${nouveauStatut} par admin ${adminId}`);
        return retrait;
      });

    } catch (error) {
      console.error('Erreur lors du traitement du retrait:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // Mettre à jour le portefeuille de manière atomique
  static async mettreAJourPortefeuille(sellerId, modifications, session = null) {
    const updateData = { ...modifications, dateMiseAJour: new Date() };

    // Construire l'opération $inc
    const incOperations = {};
    Object.keys(modifications).forEach(key => {
      if (typeof modifications[key] === 'number') {
        incOperations[key] = modifications[key];
      }
    });

    const options = {
      upsert: true,
      new: true,
      runValidators: true
    };

    if (session) {
      options.session = session;
    }

    return await Portefeuille.findOneAndUpdate(
      { sellerId },
      {
        $inc: incOperations,
        $set: { dateMiseAJour: new Date() }
      },
      options
    );
  }

  // Recalculer les soldes d'un seller (fonction d'audit/correction)
  static async recalculerSoldes(sellerId) {
    const session = await mongoose.startSession();

    try {
      return await session.withTransaction(async () => {
        // Récupérer toutes les transactions confirmées
        const transactions = await Transaction.find({
          sellerId,
          statut: 'CONFIRME'
        }).session(session);

        let soldeTotal = 0;
        let soldeDisponible = 0;
        let soldeBloqueTemporairement = 0;

        transactions.forEach(transaction => {
          if (transaction.type === 'CREDIT_COMMANDE') {
            soldeTotal += transaction.montantNet;
            if (transaction.estDisponible) {
              soldeDisponible += transaction.montantNet;
            } else {
              soldeBloqueTemporairement += transaction.montantNet;
            }
          } else if (transaction.type === 'RETRAIT') {
            soldeTotal += transaction.montantNet; // montantNet est négatif pour les retraits
          }
        });

        // Calculer le solde réservé pour les retraits en attente
        const retraitsEnAttente = await Retrait.find({
          sellerId,
          statut: 'EN_ATTENTE'
        }).session(session);

        const soldeReserveRetrait = retraitsEnAttente.reduce((sum, retrait) => sum + retrait.montantDemande, 0);

        // Mettre à jour le portefeuille
        await Portefeuille.findOneAndUpdate(
          { sellerId },
          {
            soldeTotal,
            soldeDisponible,
            soldeBloqueTemporairement,
            soldeReserveRetrait,
            soldeEnAttente: 0, // Recalculé à partir des transactions EN_ATTENTE
            dateMiseAJour: new Date()
          },
          { upsert: true, session }
        );

        console.log(`Soldes recalculés pour ${sellerId}:`, {
          soldeTotal,
          soldeDisponible,
          soldeBloqueTemporairement,
          soldeReserveRetrait
        });

        return {
          soldeTotal,
          soldeDisponible,
          soldeBloqueTemporairement,
          soldeReserveRetrait
        };
      });

    } catch (error) {
      console.error('Erreur lors du recalcul des soldes:', error);
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
          dateTransaction: { $gte: dateDebut }
        }).sort({ dateTransaction: -1 }),
        Retrait.find({
          sellerId,
          datedemande: { $gte: dateDebut }
        }).sort({ datedemande: -1 })
      ]);

      // Calculer les statistiques
      const transactionsConfirmees = transactions.filter(t => t.statut === 'CONFIRME');

      const ventesTotal = transactionsConfirmees
        .filter(t => t.type === 'CREDIT_COMMANDE')
        .reduce((sum, t) => sum + t.montant, 0);

      const commissionsTotal = transactionsConfirmees
        .filter(t => t.type === 'CREDIT_COMMANDE')
        .reduce((sum, t) => sum + t.commission, 0);

      const retraitsTotal = retraits
        .filter(r => r.statut === 'TRAITE')
        .reduce((sum, r) => sum + r.montantAccorde, 0);

      // Prochaine disponibilité
      const prochaineTransaction = await Transaction.findOne({
        sellerId,
        type: 'CREDIT_COMMANDE',
        statut: 'CONFIRME',
        estDisponible: false
      }).sort({ dateDisponibilite: 1 });

      return {
        portefeuille: portefeuille || {
          soldeTotal: 0,
          soldeDisponible: 0,
          soldeEnAttente: 0,
          soldeBloqueTemporairement: 0,
          soldeReserveRetrait: 0
        },
        statistiques: {
          ventesTotal,
          commissionsTotal,
          retraitsTotal,
          nombreVentes: transactionsConfirmees.filter(t => t.type === 'CREDIT_COMMANDE').length,
          nombreRetraits: retraits.length,
          prochaineDisponibilite: prochaineTransaction?.dateDisponibilite || null
        },
        transactionsRecentes: transactions.slice(0, 10),
        retraitsRecents: retraits.slice(0, 5)
      };

    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques:', error);
      throw error;
    }
  }

  // Fonction de nettoyage automatique (à exécuter périodiquement)
  static async nettoyageAutomatique() {
    const session = await mongoose.startSession();

    try {
      return await session.withTransaction(async () => {
        const maintenant = new Date();

        // Expirer les demandes de retrait anciennes
        const retraitsExpires = await Retrait.updateMany(
          {
            statut: 'EN_ATTENTE',
            dateExpiration: { $lte: maintenant }
          },
          {
            statut: 'EXPIRE',
            dateTraitement: maintenant,
            commentaireAdmin: 'Expiré automatiquement après 30 jours'
          }
        ).session(session);

        // Remettre l'argent des retraits expirés dans le solde disponible
        if (retraitsExpires.modifiedCount > 0) {
          const retraitsExpiresData = await Retrait.find({
            statut: 'EXPIRE',
            dateTraitement: maintenant
          }).session(session);

          for (const retrait of retraitsExpiresData) {
            await this.mettreAJourPortefeuille(retrait.sellerId, {
              soldeReserveRetrait: -retrait.montantDemande,
              soldeDisponible: retrait.montantDemande
            }, session);
          }
        }

        console.log(`Nettoyage automatique: ${retraitsExpires.modifiedCount} retraits expirés`);
        return { retraitsExpires: retraitsExpires.modifiedCount };
      });

    } catch (error) {
      console.error('Erreur lors du nettoyage automatique:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

    static async reactiverTransactionsAnnulees(commandeId, newReference) {
    const session = await mongoose.startSession();

    try {
      return await session.withTransaction(async () => {
        console.log(`🔄 Réactivation des transactions pour commande ${commandeId}`);

        // 1. Trouver toutes les transactions annulées pour cette commande
        const transactionsAnnulees = await Transaction.find({
          commandeId: commandeId,
          type: 'CREDIT_COMMANDE',
          statut: 'ANNULE'
        }).session(session);

        if (transactionsAnnulees.length === 0) {
          console.log(`ℹ️ Aucune transaction annulée trouvée pour la commande ${commandeId}`);
          return { message: "Aucune transaction annulée à réactiver", count: 0 };
        }

        let transactionsReactivees = 0;
        const resultats = [];

        for (const transaction of transactionsAnnulees) {
          try {
            // 2. Créer une nouvelle transaction EN_ATTENTE basée sur l'ancienne
            const nouvelleTransaction = new Transaction({
              sellerId: transaction.sellerId,
              commandeId: commandeId,
              type: 'CREDIT_COMMANDE',
              statut: 'EN_ATTENTE',
              montant: transaction.montant,
              montantNet: transaction.montantNet,
              commission: transaction.commission,
              tauxCommission: transaction.tauxCommission,
              description: transaction.description.replace(' - ANNULÉE', ' - RÉACTIVÉE'),
              reference: newReference || transaction.reference,
              estDisponible: false,
              dateDisponibilite: new Date(Date.now() + 48 * 60 * 60 * 1000), // +48h
              dateTransaction: new Date()
            });

            await nouvelleTransaction.save({ session });

            // 3. Remettre l'argent dans le portefeuille (solde en attente)
            await this.mettreAJourPortefeuille(transaction.sellerId, {
              soldeTotal: transaction.montantNet,
              soldeEnAttente: transaction.montantNet
            }, session);

            // 4. Marquer l'ancienne transaction comme "REACTIVEE"
            // await Transaction.findByIdAndUpdate(
            //   transaction._id,
            //   {
            //     statut: 'EXPIRE',
            //     description: transaction.description + ' - ORIGINE EXPIRE',
            //     transactionReactiveeId: nouvelleTransaction._id
            //   },
            //   { session }
            // );

            await Transaction.findByIdAndDelete(transaction._id, { session });

            transactionsReactivees++;
            resultats.push({
              sellerId: transaction.sellerId,
              montant: transaction.montant,
              montantNet: transaction.montantNet,
              ancienneTransactionId: transaction._id,
              nouvelleTransactionId: nouvelleTransaction._id
            });

            console.log(`✅ Transaction réactivée pour seller ${transaction.sellerId}: ${transaction.montantNet} FCFA`);

          } catch (transactionError) {
            console.error(`❌ Erreur lors de la réactivation pour seller ${transaction.sellerId}:`, transactionError);
            // Continuer avec les autres transactions même si une échoue
          }
        }

        console.log(`🔄 ${transactionsReactivees}/${transactionsAnnulees.length} transactions réactivées pour la commande ${commandeId}`);

        return {
          message: `${transactionsReactivees} transactions réactivées avec succès`,
          count: transactionsReactivees,
          total: transactionsAnnulees.length,
          details: resultats
        };
      });

    } catch (error) {
      console.error('❌ Erreur lors de la réactivation des transactions:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }


    static async aDesTransactionsAnnulees(commandeId) {
    try {
      const count = await Transaction.countDocuments({
        commandeId: commandeId,
        type: 'CREDIT_COMMANDE',
        statut: 'ANNULE'
      });

      return count > 0;
    } catch (error) {
      console.error('Erreur lors de la vérification des transactions annulées:', error);
      throw error;
    }
  }

}

module.exports = FinancialService;