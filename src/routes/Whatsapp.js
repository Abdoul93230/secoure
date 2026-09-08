const express = require('express');
const router = express.Router();
const { verifyWebhook, handleIncomingMessage } = require('../controllers/Whatsappcontroller');

// GET /webhook/whatsapp
// Meta appelle cette route UNE FOIS quand vous cliquez sur "Vérifier et enregistrer"
// dans le Gestionnaire d'app. Elle sert juste à prouver que le endpoint vous appartient.
router.get('/', verifyWebhook);

// POST /webhook/whatsapp
// Meta appelle cette route à CHAQUE événement : nouveau message reçu,
// changement de statut d'un message envoyé (delivered/read/failed), etc.
router.post('/', handleIncomingMessage);

module.exports = router;