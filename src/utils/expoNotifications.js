const { Expo } = require('expo-server-sdk');

const expo = new Expo();

/**
 * Envoie des push notifications Expo à une liste de tokens.
 * @param {string[]} tokens  - Expo push tokens des destinataires
 * @param {object}   payload - { title, body, data }
 */
async function sendExpoPushToSellers(tokens, { title, body, data = {} }) {
  if (!tokens || tokens.length === 0) return;

  const messages = tokens
    .filter(t => Expo.isExpoPushToken(t))
    .map(token => ({
      to: token,
      sound: 'default',
      title,
      body,
      data,
    }));

  if (messages.length === 0) return;

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      console.error('[ExpoNotif] Erreur envoi push seller:', err.message);
    }
  }
}

module.exports = { sendExpoPushToSellers };
