const { Expo } = require('expo-server-sdk');

const expo = new Expo();

/**
 * Envoie des push notifications Expo aux sellers ET sauvegarde en DB.
 * @param {ObjectId[]} sellerIds  - IDs Mongoose des sellers
 * @param {string[]}   tokens     - Expo push tokens
 * @param {object}     payload    - { title, body, data }
 */
async function sendExpoPushToSellers(sellerIds, tokens, { title, body, data = {} }) {
  // Sauvegarde en DB (offline-first : l'historique existe même si la push ne passe pas)
  try {
    const { SellerNotification } = require('../Models');
    const docs = sellerIds.map(sellerId => ({ sellerId, type: data.type || 'generic', title, body, data }));
    await SellerNotification.insertMany(docs, { ordered: false });
  } catch (err) {
    console.error('[ExpoNotif] Erreur save DB:', err.message);
  }

  if (!tokens || tokens.length === 0) return;

  const messages = tokens
    .filter(t => Expo.isExpoPushToken(t))
    .map(token => ({ to: token, sound: 'default', title, body, data }));

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
