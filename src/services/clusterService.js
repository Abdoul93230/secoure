const { Produit } = require('../Models');

class ClusterService {
  async getMarqueClusters() {
    try {
      const clusters = await Produit.aggregate([
        {
          $match: {
            marque: { $exists: true, $ne: null, $ne: "" },
            isDeleted: false,
            isPublished: "Published"
          }
        },
        {
          $group: {
            _id: "$marque",
            count: { $sum: 1 },
            products: { $push: { _id: "$_id", name: "$name", prix: "$prix" } }
          }
        },
        {
          $sort: { count: -1 }
        },
        {
          $limit: 20
        }
      ]);

      return clusters.map(cluster => ({
        marque: cluster._id,
        count: cluster.count,
        products: cluster.products.slice(0, 5) // Limiter à 5 produits par cluster
      }));
    } catch (error) {
      console.error('Erreur lors de la récupération des clusters de marques:', error);
      return [];
    }
  }

  async getCouleurClusters() {
    try {
      const clusters = await Produit.aggregate([
        {
          $match: {
            variants: { $exists: true, $ne: [] },
            isDeleted: false,
            isPublished: "Published"
          }
        },
        {
          $unwind: "$variants"
        },
        {
          $group: {
            _id: "$variants.color",
            colorCode: { $first: "$variants.colorCode" },
            count: { $sum: 1 },
            products: { 
              $push: { 
                _id: "$_id", 
                name: "$name", 
                prix: "$prix",
                image: "$image1"
              } 
            }
          }
        },
        {
          $sort: { count: -1 }
        },
        {
          $limit: 15
        }
      ]);

      return clusters.map(cluster => ({
        couleur: cluster._id,
        colorCode: cluster.colorCode,
        count: cluster.count,
        products: cluster.products.slice(0, 5) // Limiter à 5 produits par cluster
      }));
    } catch (error) {
      console.error('Erreur lors de la récupération des clusters de couleurs:', error);
      return [];
    }
  }

  async getTaillesClusters() {
    try {
      const clusters = await Produit.aggregate([
        {
          $match: {
            variants: { $exists: true, $ne: [] },
            isDeleted: false,
            isPublished: "Published"
          }
        },
        {
          $unwind: "$variants"
        },
        {
          $unwind: "$variants.sizes"
        },
        {
          $group: {
            _id: "$variants.sizes",
            count: { $sum: 1 },
            products: { 
              $push: { 
                _id: "$_id", 
                name: "$name", 
                prix: "$prix"
              } 
            }
          }
        },
        {
          $sort: { count: -1 }
        },
        {
          $limit: 10
        }
      ]);

      return clusters.map(cluster => ({
        taille: cluster._id,
        count: cluster.count,
        products: cluster.products.slice(0, 5)
      }));
    } catch (error) {
      console.error('Erreur lors de la récupération des clusters de tailles:', error);
      return [];
    }
  }

  async getPrixRanges() {
    try {
      const ranges = await Produit.aggregate([
        {
          $match: {
            prix: { $exists: true, $gt: 0 },
            isDeleted: false,
            isPublished: "Published"
          }
        },
        {
          $bucket: {
            groupBy: "$prix",
            boundaries: [0, 1000, 5000, 10000, 25000, 50000, 100000, Infinity],
            default: "Other",
            output: {
              count: { $sum: 1 },
              avgPrice: { $avg: "$prix" },
              products: { 
                $push: { 
                  _id: "$_id", 
                  name: "$name", 
                  prix: "$prix"
                } 
              }
            }
          }
        }
      ]);

      return ranges.map(range => ({
        range: this.formatPriceRange(range._id),
        count: range.count,
        avgPrice: Math.round(range.avgPrice),
        products: range.products.slice(0, 3)
      }));
    } catch (error) {
      console.error('Erreur lors de la récupération des gammes de prix:', error);
      return [];
    }
  }

  formatPriceRange(boundary) {
    const ranges = {
      0: "0 - 1,000 FCFA",
      1000: "1,000 - 5,000 FCFA",
      5000: "5,000 - 10,000 FCFA",
      10000: "10,000 - 25,000 FCFA",
      25000: "25,000 - 50,000 FCFA",
      50000: "50,000 - 100,000 FCFA",
      100000: "100,000+ FCFA"
    };
    return ranges[boundary] || "Autre";
  }
}

module.exports = new ClusterService();