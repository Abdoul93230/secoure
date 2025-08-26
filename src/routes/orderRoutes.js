const express = require('express');
const router = express.Router();
const userController = require('../userControler');
const productControler = require('../productControler');
const { Commande } = require('../Models');

// Order creation and management
router.post('/createCommande', userController.createCommande);
router.get('/getCommandesById/:id', userController.getCommandesById);
router.get('/getCommandesByClefUser/:clefUser', userController.getCommandesByClefUser);
router.get('/getCommandesByClefUser2/:clefUser', userController.getCommandesByClefUser2);
router.get('/getAllCommandes', userController.getAllCommandes);
router.delete('/deleteCommandeById/:commandeId', userController.deleteCommandeById);

// Order status updates
router.put('/mettreAJourStatuts/:commandeId', userController.mettreAJourStatuts);
router.put('/commande/etatTraitement/:id', productControler.updateEtatTraitementCommande);
router.put('/command/updateEtatTraitement/:commandeId', userController.updateEtatTraitement);
router.put('/command/updateStatusLivraison/:commandeId', userController.updateStatusLivraison);

// Order reference update
router.put('/updateCommande', userController.updateCommanderef);

// Order status checking
router.get('/checkOrderStatus/:orderId', async (req, res) => {
  try {
    const order = await Commande.findById(req.params.orderId);
    console.log(req.params.orderId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    return res.json({
      status: order.statusPayment,
      lastUpdated: order.updatedAt,
      reference: order.reference,
      transactionDetails: order.transactionTracking || {},
    });
  } catch (error) {
    console.error('Error checking order status:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;