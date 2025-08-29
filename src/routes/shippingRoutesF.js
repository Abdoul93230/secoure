// routes/shippingRoutes.js
const express = require("express");
const router = express.Router();
const shippingZoneController = require("../controllers/shippingZoneController");
const { calculateShippingCost } = require("../services/shippingService");
const { ShippingZone } = require("../models/shippingZoneSchema");
const { Produit } = require("../Models");
const jsonParser = express.json();
const urlencodedParser = express.urlencoded({ extended: true });
router.use(jsonParser, urlencodedParser);
// Routes CRUD pour les zones d'expédition
router.post("/zones", shippingZoneController.createShippingZone);
router.get("/zones", shippingZoneController.getAllShippingZones);
router.get("/zones/:id", shippingZoneController.getShippingZoneById);
router.put("/zones/:id", shippingZoneController.updateShippingZone);
router.delete("/zones/:id", shippingZoneController.deleteShippingZone);
router.get(
  "/zones/country/:countryCode",
  shippingZoneController.getZonesByCountry
);

// Calculer les frais de livraison pour un panier
router.post("/calculate", async (req, res) => {
  try {
    const { cartItems, countryCode, pp } = req.body;
    if (!cartItems || !Array.isArray(cartItems) || !countryCode) {
      return res.status(400).json({
        success: false,
        message: "Les articles du panier et le pays de destination sont requis",
      });
    }

    // Récupérer les détails complets des produits
    const productIds = cartItems.map((item) => item._id);
    const products = await Produit.find({ _id: { $in: productIds } });

    // Associer les produits à leurs quantités
    const itemsWithProducts = cartItems.map((item) => {
      const product = products.find(
        (p) => p._id.toString() === item._id.toString()
      );
      return { product, quantity: item.quantity };
    });

    const shippingDetails = await calculateShippingCost(
      itemsWithProducts,
      countryCode,
      ShippingZone,
      pp
    );

    return res.status(200).json({
      success: true,
      shippingDetails,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
