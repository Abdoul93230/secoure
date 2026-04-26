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

  // Obtenir le taux de commission selon le plan d'abonnement du seller via PricingPlan
  static async obtenirTauxCommission(sellerId) {
    try {
      const { SellerRequest, PricingPlan } = require('../Models');
      const SUBSCRIPTION_CONFIG = require('../config/subscriptionConfig');
      
      // Récupérer les informations du seller
      const seller = await SellerRequest.findById(sellerId).lean();
      
      if (!seller) {
        console.log(`⚠️ Seller ${sellerId} non trouvé, commission par défaut`);
        return SUBSCRIPTION_CONFIG.DEFAULT_COMMISSION; // 4.0%
      }

      // Si le seller a un subscriptionId, récupérer le plan actuel depuis PricingPlan
      if (seller.subscriptionId) {
        const activePlan = await PricingPlan.findOne({
          _id: seller.subscriptionId,
          status: { $in: ['active', 'trial'] }
        }).lean();

        if (activePlan) {
          console.log(`✅ Plan actif trouvé pour seller ${sellerId}: ${activePlan.planType} (${activePlan.commission}%)`);
          return activePlan.commission;
        } else {
          console.log(`⚠️ Plan inactif ou non trouvé pour seller ${sellerId}, recherche alternative...`);
        }
      }

      // Fallback: utiliser le champ subscription du seller
      const subscription = seller.subscription || 'Starter';
      const plan = SUBSCRIPTION_CONFIG.PLANS[subscription];
      
      if (!plan) {
        console.log(`⚠️ Plan non trouvé: ${subscription}, utilisation du taux par défaut`);
        return SUBSCRIPTION_CONFIG.DEFAULT_COMMISSION;
      }

      console.log(`💰 Commission (fallback) seller ${sellerId} (${subscription}): ${plan.commission}%`);
      return plan.commission;
      
    } catch (error) {
      console.error(`❌ Erreur obtention commission seller ${sellerId}:`, error);
      return SUBSCRIPTION_CONFIG.DEFAULT_COMMISSION; // Fallback sécurisé
    }
  }

  // Calculer le montant net après commission
  static calculerMontantNet(montantBrut, tauxCommission = 3.0) {
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

  // NOUVELLE FONCTION: Créer les transactions initiales quand commande prise par livreur
  static async creerTransactionsCommande(commandeId, commandeData, reference) {
    const session = await mongoose.startSession();

    try {
      return await session.withTransaction(async () => {
        console.log(`💰 Création des transactions pour commande ${commandeId}`);

        // Vérifier si des transactions existent déjà pour cette commande
        const transactionsExistantes = await Transaction.find({
          commandeId,
          type: 'CREDIT_COMMANDE'
        }).session(session);

        if (transactionsExistantes.length > 0) {
          console.log(`⚠️ Transactions déjà existantes pour commande ${commandeId}`);
          return { 
            message: "Transactions déjà créées", 
            transactions: transactionsExistantes,
            created: false 
          };
        }

        // Analyser la commande et grouper par seller
        const ventesParlSeller = await this.analyserCommandePourSellers(commandeData);
        
        if (Object.keys(ventesParlSeller).length === 0) {
          throw new Error('Aucune vente valide trouvée dans la commande');
        }

        const transactionsCreees = [];

        // Créer une transaction pour chaque seller
        for (const [sellerId, vente] of Object.entries(ventesParlSeller)) {
          // 🎯 NOUVEAU: Obtenir le taux de commission selon le pack du seller
          const tauxCommissionSeller = await this.obtenirTauxCommission(sellerId);
          const { montantNet, commission, tauxCommission } = this.calculerMontantNet(vente.montantBrut, tauxCommissionSeller);

          const transaction = new Transaction({
            sellerId,
            commandeId,
            type: 'CREDIT_COMMANDE',
            statut: 'EN_ATTENTE',
            montant: vente.montantBrut,
            montantNet,
            commission,
            tauxCommission,
            description: `Vente en cours - Commande ${reference}`,
            reference: `${reference}_${sellerId}`,
            dateDisponibilite: new Date(Date.now() + 48 * 60 * 60 * 1000), // +48h
            estDisponible: false,
            metadata: {
              produits: vente.produits,
              nombreProduits: vente.produits.length
            }
          });

          await transaction.save({ session });

          // Mettre à jour le portefeuille
          await this.mettreAJourPortefeuille(sellerId, {
            soldeTotal: montantNet,
            soldeEnAttente: montantNet
          }, session);

          transactionsCreees.push(transaction);
          console.log(`✅ Transaction créée pour seller ${sellerId}: ${montantNet} FCFA`);
        }

        console.log(`💰 ${transactionsCreees.length} transactions créées pour commande ${commandeId}`);
        return { 
          message: "Transactions créées avec succès", 
          transactions: transactionsCreees,
          created: true 
        };
      });

    } catch (error) {
      console.error('❌ Erreur lors de la création des transactions:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // NOUVELLE FONCTION: Analyser une commande pour extraire les ventes par seller
  static async analyserCommandePourSellers(commandeData) {
    const ventesParlSeller = {};

    if (!commandeData.nbrProduits || !Array.isArray(commandeData.nbrProduits)) {
      throw new Error('Données de commande invalides');
    }

    // Créer un map des produits pour accès rapide
    const produitsMap = {};
    if (commandeData.prod && Array.isArray(commandeData.prod)) {
      commandeData.prod.forEach(produit => {
        produitsMap[produit._id.toString()] = produit;
      });
    }

    // Analyser chaque item de la commande
    for (const item of commandeData.nbrProduits) {
      const produitId = item.produit.toString();
      const produit = produitsMap[produitId];

      if (!produit) {
        console.warn(`⚠️ Produit ${produitId} non trouvé dans les données`);
        continue;
      }

      // Extraire l'ID du seller (Clefournisseur peut être un objet ou une string)
      const sellerId = typeof produit.Clefournisseur === 'object' && produit.Clefournisseur._id 
        ? produit.Clefournisseur._id.toString()
        : produit.Clefournisseur?.toString();
        
      if (!sellerId) {
        console.warn(`⚠️ Seller manquant pour produit ${produit.name}`, produit.Clefournisseur);
        continue;
      }

      const prix = parseFloat(produit.prixPromo) > 0 ? parseFloat(produit.prixPromo) : parseFloat(produit.prix);
      const quantite = parseInt(item.quantite) || 0;
      const montant = quantite * prix;

      if (montant <= 0) {
        console.warn(`⚠️ Montant invalide pour produit ${produit.name}`);
        continue;
      }

      // Grouper par seller
      if (!ventesParlSeller[sellerId]) {
        ventesParlSeller[sellerId] = {
          montantBrut: 0,
          produits: []
        };
      }

      ventesParlSeller[sellerId].montantBrut += montant;
      ventesParlSeller[sellerId].produits.push({
        nom: produit.name,
        quantite,
        prix,
        montant,
        tailles: item.tailles || [],
        couleurs: item.couleurs || []
      });
    }

    return ventesParlSeller;
  }

  // AMÉLIORÉE: Confirmer les transactions (livraison réussie)
  static async confirmerTransactionsCommande(commandeId) {
    const session = await mongoose.startSession();

    try {
      return await session.withTransaction(async () => {
        console.log(`✅ Confirmation des transactions pour commande ${commandeId}`);

        const transactions = await Transaction.find({
          commandeId,
          type: 'CREDIT_COMMANDE',
          statut: 'EN_ATTENTE'
        }).session(session);

        if (transactions.length === 0) {
          console.log(`ℹ️ Aucune transaction en attente pour commande ${commandeId}`);
          return { message: "Aucune transaction à confirmer", count: 0 };
        }

        let confirmees = 0;
        for (const transaction of transactions) {
          // Confirmer la transaction
          transaction.statut = 'CONFIRME';
          transaction.dateConfirmation = new Date();
          await transaction.save({ session });

          // Déplacer l'argent: EN_ATTENTE → BLOQUE_TEMPORAIREMENT
          await this.mettreAJourPortefeuille(transaction.sellerId, {
            soldeEnAttente: -transaction.montantNet,
            soldeBloqueTemporairement: transaction.montantNet
          }, session);

          confirmees++;
          console.log(`✅ Transaction confirmée pour seller ${transaction.sellerId}: ${transaction.montantNet} FCFA`);
        }

        console.log(`✅ ${confirmees} transactions confirmées pour commande ${commandeId}`);
        return { message: "Transactions confirmées", count: confirmees };
      });

    } catch (error) {
      console.error('❌ Erreur lors de la confirmation:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // NOUVELLE FONCTION: Annuler complètement une commande
  static async annulerCommande(commandeId, motifAnnulation = "Commande annulée") {
    const session = await mongoose.startSession();

    try {
      return await session.withTransaction(async () => {
        console.log(`❌ Annulation de la commande ${commandeId}`);

        const transactions = await Transaction.find({
          commandeId,
          type: 'CREDIT_COMMANDE'
        }).session(session);

        if (transactions.length === 0) {
          console.log(`ℹ️ Aucune transaction trouvée pour commande ${commandeId}`);
          return { message: "Aucune transaction à annuler", count: 0 };
        }

        let annulees = 0;
        const details = [];

        for (const transaction of transactions) {
          const ancienStatut = transaction.statut;
          
          if (ancienStatut === 'ANNULE') {
            console.log(`⏭️ Transaction ${transaction._id} déjà annulée`);
            continue;
          }

          // Créer transaction d'annulation
          const transactionAnnulation = new Transaction({
            sellerId: transaction.sellerId,
            commandeId,
            type: 'ANNULATION',
            statut: 'CONFIRME',
            montant: -transaction.montant,
            montantNet: -transaction.montantNet,
            commission: 0,
            description: `${motifAnnulation} - Ref: ${transaction.reference}`,
            reference: `ANN_${transaction.reference}`,
            dateConfirmation: new Date(),
            metadata: {
              transactionOriginale: transaction._id,
              motifAnnulation
            }
          });

          await transactionAnnulation.save({ session });

          // Marquer la transaction originale comme annulée
          transaction.statut = 'ANNULE';
          transaction.description += ` - ANNULÉE: ${motifAnnulation}`;
          await transaction.save({ session });

          // Ajuster le portefeuille selon l'ancien statut ET la disponibilité
          const ajustements = {};

          if (ancienStatut === 'EN_ATTENTE') {
            ajustements.soldeEnAttente = -transaction.montantNet;
          } else if (ancienStatut === 'CONFIRME') {
            if (transaction.estDisponible) {
              // L'argent a déjà été débloqué vers soldeDisponible par le cron
              ajustements.soldeDisponible = -transaction.montantNet;
            } else {
              ajustements.soldeBloqueTemporairement = -transaction.montantNet;
            }
          }

          ajustements.soldeTotal = -transaction.montantNet;

          await this.mettreAJourPortefeuille(transaction.sellerId, ajustements, session);

          annulees++;
          details.push({
            sellerId: transaction.sellerId,
            montantAnnule: transaction.montantNet,
            ancienStatut
          });

          console.log(`❌ Transaction annulée pour seller ${transaction.sellerId}: ${transaction.montantNet} FCFA`);
        }

        console.log(`❌ ${annulees} transactions annulées pour commande ${commandeId}`);
        return { 
          message: "Commande annulée avec succès", 
          count: annulees,
          details 
        };
      });

    } catch (error) {
      console.error('❌ Erreur lors de l\'annulation:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // NOUVELLE FONCTION: Relancer une commande annulée
  static async relancerCommande(commandeId, nouvelleReference, commandeData) {
    const session = await mongoose.startSession();

    try {
      return await session.withTransaction(async () => {
        console.log(`🔄 Relance de la commande ${commandeId} avec référence ${nouvelleReference}`);

        // Vérifier s'il y a des transactions annulées
        const transactionsAnnulees = await Transaction.find({
          commandeId,
          type: 'CREDIT_COMMANDE',
          statut: 'ANNULE'
        }).session(session);

        if (transactionsAnnulees.length === 0) {
          console.log(`ℹ️ Aucune transaction annulée pour commande ${commandeId}`);
          // Créer de nouvelles transactions normalement
          return await this.creerTransactionsCommande(commandeId, commandeData, nouvelleReference);
        }

        // Supprimer les anciennes transactions annulées et leurs annulations
        await Transaction.deleteMany({
          $or: [
            { commandeId, type: 'CREDIT_COMMANDE', statut: 'ANNULE' },
            { commandeId, type: 'ANNULATION' }
          ]
        }).session(session);

        console.log(`🗑️ Anciennes transactions supprimées pour commande ${commandeId}`);

        // Créer de nouvelles transactions avec la nouvelle référence
        const resultat = await this.creerTransactionsCommande(commandeId, commandeData, nouvelleReference);

        console.log(`🔄 Commande ${commandeId} relancée avec succès`);
        return {
          ...resultat,
          message: "Commande relancée avec succès",
          relancee: true
        };
      });

    } catch (error) {
      console.error('❌ Erreur lors de la relance:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // AMÉLIORÉE: Gérer les changements d'état de commande
  static async gererChangementEtatCommande(commandeId, ancienEtat, nouvelEtat, commandeData = null, reference = null) {
    try {
      console.log(`🔄 Changement d'état commande ${commandeId}: ${ancienEtat} → ${nouvelEtat}`);

      // Cas 1: Commande prise par le livreur
      if (this.estPriseParLivreur(ancienEtat, nouvelEtat)) {
        if (!commandeData || !reference) {
          throw new Error('Données de commande et référence requises pour créer les transactions');
        }
        return await this.creerTransactionsCommande(commandeId, commandeData, reference);
      }

      // Cas 2: Commande livrée avec succès
      if (this.estLivraisonReussie(ancienEtat, nouvelEtat)) {
        return await this.confirmerTransactionsCommande(commandeId);
      }

      // Cas 3: Commande annulée
      if (this.estAnnulation(nouvelEtat)) {
        return await this.annulerCommande(commandeId, `Commande annulée - État: ${nouvelEtat}`);
      }

      // Cas 4: Commande relancée (retour d'un état annulé vers un état actif)
      if (this.estRelance(ancienEtat, nouvelEtat)) {
        if (!commandeData || !reference) {
          throw new Error('Données de commande et référence requises pour relancer');
        }
        return await this.relancerCommande(commandeId, reference, commandeData);
      }

      // Aucune action financière nécessaire
      console.log(`ℹ️ Aucune action financière pour transition ${ancienEtat} → ${nouvelEtat}`);
      return { message: "Aucune action financière nécessaire", action: "none" };

    } catch (error) {
      console.error(`❌ Erreur gestion changement état commande ${commandeId}:`, error);
      throw error;
    }
  }

  // Fonctions utilitaires pour détecter les types de changements d'état
  static estPriseParLivreur(ancienEtat, nouvelEtat) {
    const etatsAvantPrise = ["traitement", "en attente", "nouveau"];
    const etatsApresPrise = ["reçu par le livreur", "en cours de livraison"];
    
    return etatsAvantPrise.includes(ancienEtat) && etatsApresPrise.includes(nouvelEtat);
  }

  static estLivraisonReussie(ancienEtat, nouvelEtat) {
    // États avant livraison (commande en cours)
    const etatsAvantLivraison = ["reçu par le livreur", "en cours de livraison", "en cours", "en route"];
    // États de livraison réussie
    const etatsLivraison = ["livraison reçu", "Traité", "terminé", "livré"];
    
    return etatsAvantLivraison.includes(ancienEtat) && etatsLivraison.includes(nouvelEtat);
  }

  static estAnnulation(nouvelEtat) {
    const etatsAnnulation = ["Annulée", "annulé", "annulée", "cancelled", "échec"];
    return etatsAnnulation.includes(nouvelEtat);
  }

  static estRelance(ancienEtat, nouvelEtat) {
    const etatsAnnules = ["Annulée", "annulé", "annulée", "cancelled", "échec"];
    const etatsActifs = ["traitement", "reçu par le livreur", "en cours de livraison"];
    
    return etatsAnnules.includes(ancienEtat) && etatsActifs.includes(nouvelEtat);
  }

  // AMÉLIORÉE: Débloquer l'argent après délai
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
          // Marquer comme disponible
          transaction.estDisponible = true;
          await transaction.save({ session });

          // Déplacer: BLOQUE_TEMPORAIREMENT → DISPONIBLE
          await this.mettreAJourPortefeuille(transaction.sellerId, {
            soldeBloqueTemporairement: -transaction.montantNet,
            soldeDisponible: transaction.montantNet
          }, session);

          totalDebloque += transaction.montantNet;
        }

        console.log(`🔓 ${transactionsADebloquer.length} transactions débloquées - Total: ${totalDebloque} FCFA`);
        return { count: transactionsADebloquer.length, montant: totalDebloque };
      });

    } catch (error) {
      console.error('❌ Erreur lors du déblocage:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // NOUVELLE FONCTION: Vérifier la cohérence d'un portefeuille
  static async verifierCoherencePortefeuille(sellerId) {
    try {
      const portefeuille = await Portefeuille.findOne({ sellerId });
      if (!portefeuille) {
        return { coherent: false, message: "Portefeuille non trouvé" };
      }

      // Recalculer les soldes à partir des transactions
      const transactions = await Transaction.find({
        sellerId,
        statut: { $in: ['EN_ATTENTE', 'CONFIRME'] }
      });

      let soldeCalcule = 0;
      let soldeEnAttenteCalcule = 0;
      let soldeBloqueCalcule = 0;
      let soldeDisponibleCalcule = 0;

      transactions.forEach(t => {
        if (t.type === 'CREDIT_COMMANDE') {
          if (t.statut === 'EN_ATTENTE') {
            soldeEnAttenteCalcule += t.montantNet;
            // EN_ATTENTE ne contribue pas encore au soldeTotal
          } else if (t.statut === 'CONFIRME') {
            soldeCalcule += t.montantNet;
            if (t.estDisponible) {
              soldeDisponibleCalcule += t.montantNet;
            } else {
              soldeBloqueCalcule += t.montantNet;
            }
          }
        } else if (t.type === 'RETRAIT' && t.statut === 'CONFIRME') {
          // montant = -montantDemande (frais compris) — c'est ce qui sort du total et du disponible
          soldeCalcule += t.montant;
          soldeDisponibleCalcule += t.montant;
        }
      });

      // Ajouter les retraits en attente
      const retraitsEnAttente = await Retrait.find({
        sellerId,
        statut: 'EN_ATTENTE'
      });
      const soldeReserveCalcule = retraitsEnAttente.reduce((sum, r) => sum + r.montantDemande, 0);

      // Vérifier les écarts
      const tolerance = 1; // 1 FCFA de tolérance
      const ecarts = {
        soldeTotal: Math.abs(soldeCalcule - portefeuille.soldeTotal),
        soldeEnAttente: Math.abs(soldeEnAttenteCalcule - portefeuille.soldeEnAttente),
        soldeBloqueTemporairement: Math.abs(soldeBloqueCalcule - portefeuille.soldeBloqueTemporairement),
        soldeDisponible: Math.abs(soldeDisponibleCalcule - portefeuille.soldeDisponible),
        soldeReserveRetrait: Math.abs(soldeReserveCalcule - portefeuille.soldeReserveRetrait)
      };

      const incoherences = Object.entries(ecarts).filter(([key, ecart]) => ecart > tolerance);

      return {
        coherent: incoherences.length === 0,
        portefeuilleActuel: {
          soldeTotal: portefeuille.soldeTotal,
          soldeEnAttente: portefeuille.soldeEnAttente,
          soldeBloqueTemporairement: portefeuille.soldeBloqueTemporairement,
          soldeDisponible: portefeuille.soldeDisponible,
          soldeReserveRetrait: portefeuille.soldeReserveRetrait
        },
        soldeCalcule: {
          soldeTotal: soldeCalcule,
          soldeEnAttente: soldeEnAttenteCalcule,
          soldeBloqueTemporairement: soldeBloqueCalcule,
          soldeDisponible: soldeDisponibleCalcule,
          soldeReserveRetrait: soldeReserveCalcule
        },
        ecarts,
        incoherences: incoherences.map(([key, ecart]) => ({ champ: key, ecart }))
      };

    } catch (error) {
      console.error('❌ Erreur vérification cohérence:', error);
      throw error;
    }
  }

  // NOUVELLE FONCTION: Corriger automatiquement les incohérences
  static async corrigerIncoherences(sellerId) {
    const session = await mongoose.startSession();

    try {
      return await session.withTransaction(async () => {
        console.log(`🔧 Correction des incohérences pour seller ${sellerId}`);

        const verification = await this.verifierCoherencePortefeuille(sellerId);
        
        if (verification.coherent) {
          return { message: "Aucune correction nécessaire", correctionEffectuee: false };
        }

        // Appliquer les soldes calculés
        await Portefeuille.findOneAndUpdate(
          { sellerId },
          {
            $set: {
              ...verification.soldeCalcule,
              dateMiseAJour: new Date()
            }
          },
          { session, upsert: true }
        );

        console.log(`🔧 Portefeuille corrigé pour seller ${sellerId}`);
        return {
          message: "Incohérences corrigées",
          correctionEffectuee: true,
          avant: verification.portefeuilleActuel,
          apres: verification.soldeCalcule,
          incoherences: verification.incoherences
        };
      });

    } catch (error) {
      console.error('❌ Erreur correction incohérences:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // Demander un retrait (inchangé mais amélioré)
  static async demanderRetrait(sellerId, montantDemande, methodeRetrait, detailsRetrait, reference) {
    const session = await mongoose.startSession();

    try {
      return await session.withTransaction(async () => {
        // Vérifier la cohérence avant le retrait
        const verification = await this.verifierCoherencePortefeuille(sellerId);
        if (!verification.coherent) {
          console.warn(`⚠️ Incohérences détectées pour seller ${sellerId}, correction automatique...`);
          await this.corrigerIncoherences(sellerId);
        }

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

        console.log(`💸 Demande de retrait créée: ${retrait.reference} - ${montantDemande} FCFA`);
        return retrait;
      });

    } catch (error) {
      console.error('❌ Erreur demande retrait:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // Traiter une demande de retrait (Admin) - amélioré
  static async traiterRetrait(retraitId, nouveauStatut, adminId, commentaire = '') {
    const session = await mongoose.startSession();

    try {
      return await session.withTransaction(async () => {
        const retrait = await Retrait.findById(retraitId).session(session);

        if (!retrait) {
          throw new Error('Demande de retrait non trouvée');
        }

        // Transitions autorisées
        const transitionsAutorisees = {
          EN_ATTENTE: ['APPROUVE', 'REJETE', 'ANNULE'],
          APPROUVE:   ['TRAITE', 'REJETE']
        };

        const permis = transitionsAutorisees[retrait.statut] || [];
        if (!permis.includes(nouveauStatut)) {
          throw new Error(`Transition non autorisée: ${retrait.statut} → ${nouveauStatut}`);
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
          // Créer une transaction de retrait (argent encore en soldeReserveRetrait)
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
            soldeTotal: -retrait.montantDemande
          }, session);

        } else if (nouveauStatut === 'TRAITE') {
          // Paiement effectivement versé — aucun mouvement de solde supplémentaire
          // (déjà déduit à l'APPROUVE), juste le statut change

        } else if (nouveauStatut === 'REJETE' || nouveauStatut === 'ANNULE') {
          // Remettre l'argent disponible selon l'état précédent
          if (ancienStatut === 'EN_ATTENTE') {
            // Argent encore en soldeReserveRetrait
            await this.mettreAJourPortefeuille(retrait.sellerId, {
              soldeReserveRetrait: -retrait.montantDemande,
              soldeDisponible: retrait.montantDemande
            }, session);
          } else if (ancienStatut === 'APPROUVE') {
            // Déjà déduit du total → recréditer total + disponible
            await this.mettreAJourPortefeuille(retrait.sellerId, {
              soldeTotal: retrait.montantDemande,
              soldeDisponible: retrait.montantDemande
            }, session);

            // Annuler la transaction de retrait si elle existe
            if (retrait.transactionId) {
              await Transaction.findByIdAndUpdate(
                retrait.transactionId,
                { statut: 'ANNULE' },
                { session }
              );
            }
          }
        }

        console.log(`💸 Retrait ${retrait.reference} ${nouveauStatut} par admin ${adminId}`);
        return retrait;
      });

    } catch (error) {
      console.error('❌ Erreur traitement retrait:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // Mettre à jour le portefeuille de manière atomique (inchangé)
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
        // Toutes les transactions actives (hors annulées)
        const transactions = await Transaction.find({
          sellerId,
          statut: { $in: ['EN_ATTENTE', 'CONFIRME'] }
        }).session(session);

        let soldeTotal = 0;
        let soldeDisponible = 0;
        let soldeBloqueTemporairement = 0;

        transactions.forEach(transaction => {
          if (transaction.type === 'CREDIT_COMMANDE') {
            if (transaction.statut === 'CONFIRME') {
              soldeTotal += transaction.montantNet;
              if (transaction.estDisponible) {
                soldeDisponible += transaction.montantNet;
              } else {
                soldeBloqueTemporairement += transaction.montantNet;
              }
            }
            // EN_ATTENTE → compté dans soldeEnAttente uniquement
          } else if (transaction.type === 'RETRAIT' && transaction.statut === 'CONFIRME') {
            // Utiliser montant (= -montantDemande, frais compris) et non montantNet
            soldeTotal += transaction.montant;
            soldeDisponible += transaction.montant; // le retrait a été prélevé sur le disponible
          }
        });

        // Calculer le solde réservé pour les retraits en attente
        const retraitsEnAttente = await Retrait.find({
          sellerId,
          statut: 'EN_ATTENTE'
        }).session(session);

        const soldeReserveRetrait = retraitsEnAttente.reduce((sum, retrait) => sum + retrait.montantDemande, 0);

        // Calculer le solde en attente à partir des transactions EN_ATTENTE
        const transactionsEnAttente = await Transaction.find({
          sellerId,
          statut: 'EN_ATTENTE',
          type: 'CREDIT_COMMANDE'
        }).session(session);

        const soldeEnAttente = transactionsEnAttente.reduce((sum, t) => sum + t.montantNet, 0);

        // Mettre à jour le portefeuille
        await Portefeuille.findOneAndUpdate(
          { sellerId },
          {
            soldeTotal,
            soldeDisponible,
            soldeBloqueTemporairement,
            soldeReserveRetrait,
            soldeEnAttente,
            dateMiseAJour: new Date()
          },
          { upsert: true, session }
        );

        console.log(`🔧 Soldes recalculés pour ${sellerId}:`, {
          soldeTotal,
          soldeDisponible,
          soldeBloqueTemporairement,
          soldeReserveRetrait,
          soldeEnAttente
        });

        return {
          soldeTotal,
          soldeDisponible,
          soldeBloqueTemporairement,
          soldeReserveRetrait,
          soldeEnAttente
        };
      });

    } catch (error) {
      console.error('❌ Erreur recalcul soldes:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // Obtenir les statistiques financières d'un seller (amélioré)
  static async getStatistiquesFinancieres(sellerId, periode = 30) {
    try {
      const dateDebut = new Date();
      dateDebut.setDate(dateDebut.getDate() - periode);

      const [portefeuilleData, transactions, retraits] = await Promise.all([
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

      // Vérification et récupération du portefeuille
      const allTransactions = await Transaction.find({ sellerId }).sort({ dateTransaction: -1 }).limit(5);
      
      // Créer le portefeuille s'il n'existe pas
      let portefeuille = portefeuilleData;
      if (!portefeuille) {
        console.log('⚠️ Portefeuille non trouvé, création automatique...');
        portefeuille = await this.mettreAJourPortefeuille(sellerId, {}, null);
        console.log('✅ Portefeuille créé:', portefeuille);
      }

      // Vérifier la cohérence
      const verification = await this.verifierCoherencePortefeuille(sellerId);

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
        coherence: verification,
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
      console.error('❌ Erreur statistiques financières:', error);
      throw error;
    }
  }

  // Fonction de nettoyage automatique (améliorée)
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

        // Nettoyer les transactions très anciennes (optionnel)
        const dateAncienne = new Date();
        dateAncienne.setFullYear(dateAncienne.getFullYear() - 2); // 2 ans

        const transactionsAnciennes = await Transaction.deleteMany({
          statut: 'ANNULE',
          dateTransaction: { $lt: dateAncienne }
        }).session(session);

        console.log(`🧹 Nettoyage: ${retraitsExpires.modifiedCount} retraits expirés, ${transactionsAnciennes.deletedCount} transactions anciennes supprimées`);
        return { 
          retraitsExpires: retraitsExpires.modifiedCount,
          transactionsAnciennes: transactionsAnciennes.deletedCount
        };
      });

    } catch (error) {
      console.error('❌ Erreur nettoyage automatique:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // NOUVELLE FONCTION: Obtenir un résumé complet d'une commande
  static async getResumeCommande(commandeId) {
    try {
      const transactions = await Transaction.find({
        commandeId,
        type: { $in: ['CREDIT_COMMANDE', 'ANNULATION'] }
      }).sort({ dateTransaction: 1 });

      const resume = {
        commandeId,
        nombreSellers: 0,
        montantTotal: 0,
        montantNetTotal: 0,
        commissionTotal: 0,
        statut: 'AUCUNE_TRANSACTION',
        historique: [],
        sellersDetails: {}
      };

      if (transactions.length === 0) {
        return resume;
      }

      // Analyser les transactions
      const sellersSet = new Set();
      
      transactions.forEach(t => {
        sellersSet.add(t.sellerId);
        
        if (t.type === 'CREDIT_COMMANDE') {
          resume.montantTotal += t.montant;
          resume.montantNetTotal += t.montantNet;
          resume.commissionTotal += t.commission;
        }

        resume.historique.push({
          date: t.dateTransaction,
          type: t.type,
          statut: t.statut,
          sellerId: t.sellerId,
          montant: t.montant,
          description: t.description
        });

        // Détails par seller
        if (!resume.sellersDetails[t.sellerId]) {
          resume.sellersDetails[t.sellerId] = {
            transactions: [],
            montantTotal: 0,
            statutActuel: 'AUCUNE'
          };
        }

        resume.sellersDetails[t.sellerId].transactions.push(t);
        if (t.type === 'CREDIT_COMMANDE') {
          resume.sellersDetails[t.sellerId].montantTotal += t.montantNet;
          resume.sellersDetails[t.sellerId].statutActuel = t.statut;
        }
      });

      resume.nombreSellers = sellersSet.size;

      // Déterminer le statut global
      const statutsActuels = Object.values(resume.sellersDetails).map(s => s.statutActuel);
      if (statutsActuels.every(s => s === 'CONFIRME')) {
        resume.statut = 'TOUS_CONFIRMES';
      } else if (statutsActuels.every(s => s === 'EN_ATTENTE')) {
        resume.statut = 'TOUS_EN_ATTENTE';
      } else if (statutsActuels.some(s => s === 'ANNULE')) {
        resume.statut = 'PARTIELLEMENT_ANNULE';
      } else {
        resume.statut = 'MIXTE';
      }

      return resume;

    } catch (error) {
      console.error('❌ Erreur résumé commande:', error);
      throw error;
    }
  }

  // LEGACY FUNCTIONS (pour compatibilité) - marquées comme dépréciées
  static async crediterPortefeuille(sellerId, commandeId, montantBrut, description, reference) {
    console.warn('⚠️ crediterPortefeuille est déprécié, utilisez creerTransactionsCommande');
    
    // Créer des données de commande factices pour la compatibilité
    const commandeData = {
      nbrProduits: [{ produit: 'legacy', quantite: 1 }],
      prod: [{ 
        _id: 'legacy', 
        Clefournisseur: sellerId, 
        prix: montantBrut, 
        prixPromo: 0,
        name: 'Legacy Product'
      }]
    };

    return await this.creerTransactionsCommande(commandeId, commandeData, reference);
  }

  static async confirmerTransaction(transactionId) {
    console.warn('⚠️ confirmerTransaction est déprécié, utilisez confirmerTransactionsCommande');
    
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      throw new Error('Transaction non trouvée');
    }

    return await this.confirmerTransactionsCommande(transaction.commandeId);
  }

  static async confirmerTransaction2(transactionId) {
    console.warn('⚠️ confirmerTransaction2 est déprécié');
    return await this.confirmerTransaction(transactionId);
  }
}

module.exports = FinancialService;