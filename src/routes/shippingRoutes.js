const express = require('express');
const router = express.Router();
const productControler = require('../productControler');

// Zones management
router.post('/zones', productControler.createZone);
router.get('/zones', productControler.getAllZones);
router.put('/zones/:zoneId', productControler.updateZone);
router.delete('/zones/:zoneId', productControler.deleteZone);

// Transporteurs management
router.post('/transporteurs', productControler.createTransporteur);
router.get('/transporteurs', productControler.getAllTransporteurs);
router.put('/transporteurs/:transporteurId', productControler.updateTransporteur);
router.delete('/transporteurs/:transporteurId', productControler.deleteTransporteur);

// Shipping options management
router.post('/produits/:produitId/shipping-options', productControler.addShippingOptionToProduit);
router.put('/produits/:produitId/shipping-options/:shippingOptionId', productControler.updateShippingOption);
router.delete('/produits/:produitId/shipping-options/:shippingOptionId', productControler.deleteShippingOption);

module.exports = router;