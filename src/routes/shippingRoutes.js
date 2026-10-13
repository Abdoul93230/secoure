const express = require('express');
const router = express.Router();
const productControler = require('../productControler');
const middelware = require('../auth/middelware');

// Zones management
router.post('/zones', middelware.authAdmin, productControler.createZone);
router.get('/zones', productControler.getAllZones);
router.put('/zones/:zoneId', middelware.authAdmin, productControler.updateZone);
router.delete('/zones/:zoneId', middelware.authAdmin, productControler.deleteZone);

// Transporteurs management
router.post('/transporteurs', middelware.authAdmin, productControler.createTransporteur);
router.get('/transporteurs', productControler.getAllTransporteurs);
router.put('/transporteurs/:transporteurId', middelware.authAdmin, productControler.updateTransporteur);
router.delete('/transporteurs/:transporteurId', middelware.authAdmin, productControler.deleteTransporteur);

// Shipping options management
router.post('/produits/:produitId/shipping-options', middelware.authAdmin, productControler.addShippingOptionToProduit);
router.put('/produits/:produitId/shipping-options/:shippingOptionId', middelware.authAdmin, productControler.updateShippingOption);
router.delete('/produits/:produitId/shipping-options/:shippingOptionId', middelware.authAdmin, productControler.deleteShippingOption);

module.exports = router;