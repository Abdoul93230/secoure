const express = require('express');
const router = express.Router();
const userController = require('../userControler');
const transactionController = require('../transactionController');
const { 
  generateToken, 
  processMobilePayment 
} = require('../services/komipayService');
const { 
  processBankCardPayment, 
  checkPaymentStatusReq 
} = require('../services/cardService');
const { 
  processSTAPayment, 
  requestZeynaCashSecurityCode 
} = require('../services/staService');
const { Commande } = require('../Models');

// Basic payment routes
router.post('/payments', userController.requette);
router.get('/payments', userController.requetteGet);

// Payment page generation
router.post('/generate_payment_page', userController.generate_payment_page);
router.post('/payment_callback', userController.payment_callback);

// Mobile payment
router.post('/processMobilePayment', processMobilePayment);

// Card payment
router.post('/pay-with-card', processBankCardPayment);
router.get('/payment_status_card', checkPaymentStatusReq);

// STA payment
router.post('/processSTAPayment', processSTAPayment);
router.post('/requestZeynaCashSecurityCode', requestZeynaCashSecurityCode);

// Token generation
router.get('/generate-token', async (req, res) => {
  const token = await generateToken();
  if (token) {
    res.json({ success: true, token });
  } else {
    res.status(500).json({ success: false, message: 'Échec de la génération du token' });
  }
});

// Payment webhook
router.post('/payment_webhook', async (req, res) => {
  try {
    const { reference, status, transactionDetails } = req.body;

    const order = await Commande.findOne({ reference });
    if (order) {
      order.statusPayment = status === 'success' ? 'payé' : 'échec';
      order.transactionDetails = transactionDetails;
      await order.save();

      if (status === 'success') {
        await sendOrderConfirmationEmail(order);
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Transaction management
router.post('/api/initiate-transaction', transactionController.initiateTransaction);
router.post('/api/confirm-transaction', transactionController.confirmTransaction);
router.get('/api/transaction-status/:transactionId', transactionController.getTransactionStatus);

module.exports = router;