const { Produit, Commande } = require('../Models');
const mongoose = require('mongoose');

/**
 * Service de gestion automatique des stocks
 */
class StockService {
  
  /**
   * Décrémenter le stock lors de la création/mise à jour d'une commande
   */
  static async decrementStock(nbrProduits, options = {}) {
    const { session, isUpdate = false, oldNbrProduits = [] } = options;
    const operationsLog = [];
    
    try {
      // Si c'est une mise à jour, on doit d'abord restaurer l'ancien stock
      if (isUpdate && oldNbrProduits.length > 0) {
        await this.incrementStock(oldNbrProduits, { session, isRestoration: true });
      }

      for (const item of nbrProduits) {
        const { produit: produitId, quantite, tailles = [], couleurs = [] } = item;
        
        const product = await Produit.findById(produitId).session(session);
        if (!product) {
          throw new Error(`Produit non trouvé : ${produitId}`);
        }

        // Vérifier si le produit a des variantes
        const hasVariants = product.variants && product.variants.length > 0;
        const hasSpecificVariant = hasVariants && (couleurs.length > 0 || tailles.length > 0);

        if (hasSpecificVariant) {
          // Gestion du stock pour une variante spécifique
          await this._decrementVariantStock(product, quantite, couleurs, tailles, session);
        } else {
          // Gestion du stock principal
          await this._decrementMainStock(product, quantite, session);
        }

        operationsLog.push({
          produitId,
          quantite,
          couleurs,
          tailles,
          type: 'DECREMENT',
          hasVariant: hasSpecificVariant
        });
      }

      return {
        success: true,
        operations: operationsLog,
        message: 'Stock décrémenté avec succès'
      };

    } catch (error) {
      console.error('❌ Erreur lors de la décrémentation du stock:', error);
      throw error;
    }
  }

  /**
   * Incrémenter le stock lors de l'annulation d'une commande
   */
  static async incrementStock(nbrProduits, options = {}) {
    const { session, isRestoration = false } = options;
    const operationsLog = [];
    
    try {
      for (const item of nbrProduits) {
        const { produit: produitId, quantite, tailles = [], couleurs = [] } = item;
        
        const product = await Produit.findById(produitId).session(session);
        if (!product) {
          console.warn(`⚠️ Produit non trouvé lors de la restauration : ${produitId}`);
          continue;
        }

        // Vérifier si le produit a des variantes
        const hasVariants = product.variants && product.variants.length > 0;
        const hasSpecificVariant = hasVariants && (couleurs.length > 0 || tailles.length > 0);

        if (hasSpecificVariant) {
          // Restauration du stock pour une variante spécifique
          await this._incrementVariantStock(product, quantite, couleurs, tailles, session);
        } else {
          // Restauration du stock principal
          await this._incrementMainStock(product, quantite, session);
        }

        operationsLog.push({
          produitId,
          quantite,
          couleurs,
          tailles,
          type: 'INCREMENT',
          hasVariant: hasSpecificVariant,
          isRestoration
        });
      }

      return {
        success: true,
        operations: operationsLog,
        message: isRestoration ? 'Stock restauré avec succès' : 'Stock incrémenté avec succès'
      };

    } catch (error) {
      console.error('❌ Erreur lors de l\'incrémentation du stock:', error);
      throw error;
    }
  }

  /**
   * Vérifier la disponibilité du stock avant commande
   */
  static async validateStockAvailability(nbrProduits) {
    const validationResults = [];
    
    try {
      for (const item of nbrProduits) {
        const { produit: produitId, quantite, tailles = [], couleurs = [] } = item;
        
        const product = await Produit.findById(produitId);
        if (!product) {
          validationResults.push({
            produitId,
            valid: false,
            error: 'Produit non trouvé',
            requestedQuantity: quantite
          });
          continue;
        }

        const hasVariants = product.variants && product.variants.length > 0;
        const hasSpecificVariant = hasVariants && (couleurs.length > 0 || tailles.length > 0);

        let availableStock = 0;
        let stockLocation = 'principal';

        if (hasSpecificVariant) {
          // Vérifier le stock de la variante
          const variant = product.variants.find(v => 
            this._matchVariant(v, couleurs, tailles)
          );
          
          if (variant) {
            availableStock = variant.stock || 0;
            stockLocation = 'variante';
          } else {
            validationResults.push({
              produitId,
              valid: false,
              error: 'Variante non trouvée',
              requestedQuantity: quantite,
              couleurs,
              tailles
            });
            continue;
          }
        } else {
          // Utiliser le stock principal
          availableStock = product.quantite || 0;
        }

        const isValid = availableStock >= quantite;
        validationResults.push({
          produitId,
          valid: isValid,
          availableStock,
          requestedQuantity: quantite,
          stockLocation,
          couleurs,
          tailles,
          error: isValid ? null : `Stock insuffisant. Disponible: ${availableStock}, Demandé: ${quantite}`
        });
      }

      const allValid = validationResults.every(result => result.valid);
      return {
        valid: allValid,
        results: validationResults,
        invalidItems: validationResults.filter(result => !result.valid)
      };

    } catch (error) {
      console.error('❌ Erreur lors de la validation du stock:', error);
      throw error;
    }
  }

  /**
   * Décrémenter le stock principal d'un produit
   */
  static async _decrementMainStock(product, quantite, session) {
    const currentStock = product.quantite || 0;
    
    if (currentStock < quantite) {
      throw new Error(`Stock insuffisant pour le produit ${product.name}. Disponible: ${currentStock}, Demandé: ${quantite}`);
    }

    const newStock = currentStock - quantite;
    await Produit.findByIdAndUpdate(
      product._id,
      { $set: { quantite: newStock } },
      { session, runValidators: true }
    );

    console.log(`✅ Stock principal mis à jour: ${product.name} (${currentStock} → ${newStock})`);
  }

  /**
   * Incrémenter le stock principal d'un produit
   */
  static async _incrementMainStock(product, quantite, session) {
    const currentStock = product.quantite || 0;
    const newStock = currentStock + quantite;
    
    await Produit.findByIdAndUpdate(
      product._id,
      { $set: { quantite: newStock } },
      { session, runValidators: true }
    );

    console.log(`✅ Stock principal restauré: ${product.name} (${currentStock} → ${newStock})`);
  }

  /**
   * Décrémenter le stock d'une variante spécifique
   */
  static async _decrementVariantStock(product, quantite, couleurs, tailles, session) {
    const variant = product.variants.find(v => 
      this._matchVariant(v, couleurs, tailles)
    );

    if (!variant) {
      throw new Error(`Variante non trouvée pour le produit ${product.name}. Couleurs: ${couleurs.join(', ')}, Tailles: ${tailles.join(', ')}`);
    }

    const currentStock = variant.stock || 0;
    if (currentStock < quantite) {
      throw new Error(`Stock insuffisant pour la variante du produit ${product.name}. Disponible: ${currentStock}, Demandé: ${quantite}`);
    }

    const newStock = currentStock - quantite;
    
    // Mise à jour atomique de la variante spécifique
    await Produit.findOneAndUpdate(
      { 
        _id: product._id,
        'variants._id': variant._id
      },
      { 
        $set: { 
          'variants.$.stock': newStock 
        } 
      },
      { session, runValidators: true }
    );

    console.log(`✅ Stock variante mis à jour: ${product.name} - ${couleurs.join('/')}, ${tailles.join('/')} (${currentStock} → ${newStock})`);
  }

  /**
   * Incrémenter le stock d'une variante spécifique
   */
  static async _incrementVariantStock(product, quantite, couleurs, tailles, session) {
    const variant = product.variants.find(v => 
      this._matchVariant(v, couleurs, tailles)
    );

    if (!variant) {
      console.warn(`⚠️ Variante non trouvée lors de la restauration pour le produit ${product.name}`);
      return;
    }

    const currentStock = variant.stock || 0;
    const newStock = currentStock + quantite;
    
    // Mise à jour atomique de la variante spécifique
    await Produit.findOneAndUpdate(
      { 
        _id: product._id,
        'variants._id': variant._id
      },
      { 
        $set: { 
          'variants.$.stock': newStock 
        } 
      },
      { session, runValidators: true }
    );

    console.log(`✅ Stock variante restauré: ${product.name} - ${couleurs.join('/')}, ${tailles.join('/')} (${currentStock} → ${newStock})`);
  }

  /**
   * Vérifier si une variante correspond aux critères
   */
  static _matchVariant(variant, couleurs, tailles) {
    // Logique de correspondance flexible
    const colorMatch = couleurs.length === 0 || 
      couleurs.some(color => variant.color === color || variant.colorName === color);
    
    const sizeMatch = tailles.length === 0 || 
      tailles.some(taille => variant.sizes && variant.sizes.includes(taille));

    return colorMatch && sizeMatch;
  }

  /**
   * Obtenir un rapport détaillé du stock d'un produit
   */
  static async getStockReport(produitId) {
    try {
      const product = await Produit.findById(produitId);
      if (!product) {
        throw new Error('Produit non trouvé');
      }

      const report = {
        produitId: product._id,
        name: product.name,
        stockPrincipal: product.quantite || 0,
        variants: product.variants ? product.variants.map(v => ({
          _id: v._id,
          color: v.color || v.colorName,
          sizes: v.sizes || [],
          stock: v.stock || 0
        })) : [],
        stockTotal: (product.quantite || 0) + 
          (product.variants ? product.variants.reduce((sum, v) => sum + (v.stock || 0), 0) : 0)
      };

      return report;
    } catch (error) {
      console.error('❌ Erreur lors de la génération du rapport de stock:', error);
      throw error;
    }
  }
}

module.exports = StockService;
