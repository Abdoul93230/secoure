// Gestionnaire centralisé des états financiers
const FinancialService = require('../services/FinancialService');

class FinancialStateManager {
  
  // Matrice des transitions d'état autorisées
  static TRANSITIONS_AUTORISEES = {
    // États initiaux
    'nouveau': ['traitement', 'Annulée'],
    'traitement': ['reçu par le livreur', 'Annulée'],
    
    // États de livraison
    'reçu par le livreur': ['en cours de livraison', 'Annulée'],
    'en cours de livraison': ['livraison reçu', 'Annulée'],
    'livraison reçu': ['Traité', 'Annulée'], // Annulation possible même après livraison
    'Traité': [], // État final
    
    // États d'annulation
    'Annulée': ['traitement', 'reçu par le livreur'], // Relance possible
    'annulé': ['traitement', 'reçu par le livreur'],
    'cancelled': ['traitement', 'reçu par le livreur']
  };

  // Vérifier si une transition est autorisée
  static estTransitionAutorisee(ancienEtat, nouvelEtat) {
    const transitionsAutorisees = this.TRANSITIONS_AUTORISEES[ancienEtat] || [];
    return transitionsAutorisees.includes(nouvelEtat);
  }

  // Obtenir les transitions possibles depuis un état
  static getTransitionsPossibles(etatActuel) {
    return this.TRANSITIONS_AUTORISEES[etatActuel] || [];
  }

  // Valider et exécuter un changement d'état
  static async changerEtatCommande(commandeId, ancienEtat, nouvelEtat, commandeData = null, options = {}) {
    try {
      // Validation de la transition
      if (!this.estTransitionAutorisee(ancienEtat, nouvelEtat)) {
        throw new Error(`Transition non autorisée: ${ancienEtat} → ${nouvelEtat}`);
      }

      console.log(`🔄 Changement d'état autorisé: ${ancienEtat} → ${nouvelEtat}`);

      // Exécuter les actions financières
      const resultatFinancier = await FinancialService.gererChangementEtatCommande(
        commandeId,
        ancienEtat,
        nouvelEtat,
        commandeData,
        options.reference
      );

      // Log du résultat
      console.log(`✅ Actions financières terminées:`, {
        commandeId,
        transition: `${ancienEtat} → ${nouvelEtat}`,
        action: resultatFinancier.message || 'Action effectuée'
      });

      return {
        success: true,
        transition: `${ancienEtat} → ${nouvelEtat}`,
        financialResult: resultatFinancier,
        message: 'Changement d\'état traité avec succès'
      };

    } catch (error) {
      console.error(`❌ Erreur changement d'état ${ancienEtat} → ${nouvelEtat}:`, error);
      
      return {
        success: false,
        transition: `${ancienEtat} → ${nouvelEtat}`,
        error: error.message,
        message: 'Erreur lors du changement d\'état'
      };
    }
  }

  // Obtenir l'état financier d'une commande
  static async getEtatFinancierCommande(commandeId) {
    try {
      const resume = await FinancialService.getResumeCommande(commandeId);
      
      return {
        commandeId,
        statutFinancier: resume.statut,
        nombreSellers: resume.nombreSellers,
        montantTotal: resume.montantTotal,
        montantNet: resume.montantNetTotal,
        commission: resume.commissionTotal,
        details: resume.sellersDetails,
        historique: resume.historique
      };

    } catch (error) {
      console.error(`❌ Erreur état financier commande ${commandeId}:`, error);
      throw error;
    }
  }

  // Diagnostiquer les problèmes d'une commande
  static async diagnostiquerCommande(commandeId) {
    try {
      const diagnostic = {
        commandeId,
        problemes: [],
        recommandations: [],
        etatFinancier: null
      };

      // Récupérer l'état financier
      try {
        diagnostic.etatFinancier = await this.getEtatFinancierCommande(commandeId);
      } catch (error) {
        diagnostic.problemes.push({
          type: 'ERREUR_FINANCIERE',
          message: 'Impossible de récupérer l\'état financier',
          details: error.message
        });
      }

      // Vérifier la cohérence des sellers impliqués
      if (diagnostic.etatFinancier) {
        const sellersIds = Object.keys(diagnostic.etatFinancier.details);
        
        for (const sellerId of sellersIds) {
          try {
            const verification = await FinancialService.verifierCoherencePortefeuille(sellerId);
            
            if (!verification.coherent) {
              diagnostic.problemes.push({
                type: 'INCOHERENCE_PORTEFEUILLE',
                sellerId,
                message: 'Incohérences détectées dans le portefeuille',
                details: verification.incoherences
              });
              
              diagnostic.recommandations.push({
                action: 'CORRIGER_PORTEFEUILLE',
                sellerId,
                message: `Exécuter la correction pour le seller ${sellerId}`
              });
            }
          } catch (error) {
            diagnostic.problemes.push({
              type: 'ERREUR_VERIFICATION',
              sellerId,
              message: 'Erreur lors de la vérification du portefeuille',
              details: error.message
            });
          }
        }
      }

      return diagnostic;

    } catch (error) {
      console.error(`❌ Erreur diagnostic commande ${commandeId}:`, error);
      throw error;
    }
  }

  // Réparer automatiquement une commande
  static async reparerCommande(commandeId, options = {}) {
    try {
      console.log(`🔧 Réparation de la commande ${commandeId}`);

      const diagnostic = await this.diagnostiquerCommande(commandeId);
      const reparations = [];

      // Corriger les incohérences de portefeuille
      for (const probleme of diagnostic.problemes) {
        if (probleme.type === 'INCOHERENCE_PORTEFEUILLE') {
          try {
            const correction = await FinancialService.corrigerIncoherences(probleme.sellerId);
            reparations.push({
              type: 'CORRECTION_PORTEFEUILLE',
              sellerId: probleme.sellerId,
              success: true,
              details: correction
            });
          } catch (error) {
            reparations.push({
              type: 'CORRECTION_PORTEFEUILLE',
              sellerId: probleme.sellerId,
              success: false,
              error: error.message
            });
          }
        }
      }

      // Recalculer les soldes si demandé
      if (options.recalculerSoldes) {
        const sellersIds = Object.keys(diagnostic.etatFinancier?.details || {});
        
        for (const sellerId of sellersIds) {
          try {
            const recalcul = await FinancialService.recalculerSoldes(sellerId);
            reparations.push({
              type: 'RECALCUL_SOLDES',
              sellerId,
              success: true,
              details: recalcul
            });
          } catch (error) {
            reparations.push({
              type: 'RECALCUL_SOLDES',
              sellerId,
              success: false,
              error: error.message
            });
          }
        }
      }

      console.log(`🔧 Réparation terminée pour commande ${commandeId}: ${reparations.length} actions`);

      return {
        commandeId,
        diagnostic,
        reparations,
        success: reparations.every(r => r.success)
      };

    } catch (error) {
      console.error(`❌ Erreur réparation commande ${commandeId}:`, error);
      throw error;
    }
  }
}

module.exports = FinancialStateManager;