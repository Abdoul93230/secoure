const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN; // même valeur que dans le champ "Vérifier le token" sur Meta

/**
 * Étape de vérification faite une seule fois par Meta (handshake).
 * Meta envoie: ?hub.mode=subscribe&hub.verify_token=XXX&hub.challenge=YYY
 * On doit renvoyer hub.challenge tel quel si le token correspond.
 */
function verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    console.log('req.query complet:', JSON.stringify(req.query, null, 2));
    console.log('token reçu:', JSON.stringify(token), '| longueur:', token?.length);
    console.log('token attendu:', JSON.stringify(VERIFY_TOKEN), '| longueur:', VERIFY_TOKEN?.length);

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('[WhatsApp Webhook] Vérification réussie');
        return res.status(200).send(challenge);
    }

    console.warn('[WhatsApp Webhook] Échec de vérification (token invalide)');
    return res.sendStatus(403);
}

/**
 * Réception des événements en temps réel (messages, statuts).
 * IMPORTANT: toujours répondre 200 rapidement, sinon Meta reessaie
 * et peut finir par désactiver le webhook.
 */
async function handleIncomingMessage(req, res) {
    // On répond tout de suite pour ne jamais bloquer Meta
    res.sendStatus(200);

    try {
        const entry = req.body.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;

        // Cas 1: un vrai message entrant (texte, image, bouton, réponse OTP, etc.)
        if (value?.messages) {
            for (const message of value.messages) {
                const from = message.from; // numéro de l'expéditeur, format international sans "+"
                const type = message.type; // text, image, button, interactive, etc.
                const contactName = value.contacts?.[0]?.profile?.name;

                let content = null;
                if (type === 'text') {
                    content = message.text.body;
                } else if (type === 'button') {
                    content = message.button.text;
                } else if (type === 'interactive') {
                    content = message.interactive.button_reply?.title || message.interactive.list_reply?.title;
                }

                console.log(`[Message reçu] de ${contactName || from} (${from}): ${content || `[${type}]`}`);

                // TODO: brancher ici votre logique métier, par exemple:
                // - sauvegarder en base (MongoDB)
                // - si c'est une réponse à un OTP: vérifier le code
                // - notifier votre front via websocket/pusher pour affichage temps réel
                // await Message.create({ from, type, content, contactName, raw: message });
            }
        }

        // Cas 2: mise à jour de statut d'un message que VOUS avez envoyé
        // (sent -> delivered -> read, ou failed)
        if (value?.statuses) {
            for (const status of value.statuses) {
                console.log(`[Statut] message ${status.id} -> ${status.status}`);
                // TODO: mettre à jour le statut du message en base si besoin
            }
        }
    } catch (err) {
        console.error('[WhatsApp Webhook] Erreur de traitement:', err);
    }
}

module.exports = { verifyWebhook, handleIncomingMessage };