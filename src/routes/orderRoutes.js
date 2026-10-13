const express = require('express');
const router = express.Router();
const userController = require('../userControler');
const middelware = require('../auth/middelware');
const productControler = require('../productControler');
const { Commande } = require('../Models');

// Order creation and management
// SÉCURITÉ : l'auteur vient du jeton (compte, invité ou admin), jamais du corps de la requête
const { orderActor } = require('../auth/guestAuth');
router.post('/createCommande', orderActor(), userController.createCommande);
router.get('/getCommandesById/:id', orderActor(), userController.getCommandesById);
router.get('/getOrderPaymentStatus/:reference', userController.getOrderPaymentStatus);
router.get('/getCommandeByReference/:reference', orderActor(), userController.getCommandeByReference);
// SÉCURITÉ : un client ne peut lire que SES commandes (adresses et téléphones de livraison)
const ownOrdersOnly = (req, res, next) =>
  String(req.userId) === String(req.params.clefUser)
    ? next()
    : res.status(403).json({ message: "Accès refusé à ces commandes." });
router.get('/getCommandesByClefUser/:clefUser', middelware.auth, ownOrdersOnly, userController.getCommandesByClefUser);
router.get('/getCommandesByClefUser2/:clefUser', middelware.auth, ownOrdersOnly, userController.getCommandesByClefUser2);
// Toutes les commandes de tous les clients : réservé à l'admin
router.get('/getAllCommandes', middelware.authAdmin, userController.getAllCommandes);
router.delete('/deleteCommandeById/:commandeId', middelware.authAdmin, userController.deleteCommandeById);

// Order status updates
// Changements d'état des commandes : admin uniquement
router.put('/mettreAJourStatuts/:commandeId', middelware.authAdmin, userController.mettreAJourStatuts);
router.put('/commande/etatTraitement/:id', middelware.authAdmin, productControler.updateEtatTraitementCommande);
router.put('/command/updateEtatTraitement/:commandeId', middelware.authAdmin, userController.updateEtatTraitement);
router.put('/command/updateStatusLivraison/:commandeId', middelware.authAdmin, userController.updateStatusLivraison);

// Order reference update
router.put('/updateCommande', orderActor(), userController.updateCommanderef);

// Order status checking
router.get('/checkOrderStatus/:orderId', middelware.authAdmin, async (req, res) => {
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

// Invité sans code SMS : l'équipe confirme (ou remet en attente) la commande après l'appel
router.put('/commande/:id/phone-confirmation', middelware.authAdmin, async (req, res) => {
  try {
    const value = req.body?.confirmed === false ? 'pending' : 'confirmed';
    const c = await Commande.findOneAndUpdate(
      { _id: req.params.id, phoneConfirmation: { $in: ['pending', 'confirmed'] } },
      { $set: { phoneConfirmation: value } },
      { new: true, projection: { phoneConfirmation: 1, reference: 1 } }
    ).lean();
    if (!c) return res.status(404).json({ success: false, message: 'Commande introuvable ou sans confirmation par appel.' });
    return res.json({ success: true, data: c });
  } catch (e) {
    return res.status(400).json({ success: false, message: 'Commande invalide.' });
  }
});

module.exports = router;