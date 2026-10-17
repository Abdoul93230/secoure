/**
 * Notifications push des clients (app mobile) pour la messagerie boutiques.
 * Jetons Expo : User.expoPushTokens (plusieurs appareils) + ancien champ User.pushToken.
 * Les jetons refusés par Expo (appareil désinstallé) sont retirés automatiquement.
 */
const { Expo } = require("expo-server-sdk");

const expo = new Expo();

async function sendToClient(userId, { title, body, data = {} }) {
  const { User } = require("../Models");
  const user = await User.findById(userId).select("pushToken expoPushTokens").lean();
  if (!user) return;
  const tokens = [...new Set([...(user.expoPushTokens || []), user.pushToken].filter((t) => t && Expo.isExpoPushToken(t)))];
  if (!tokens.length) return;

  const messages = tokens.map((to) => ({
    to,
    title,
    body,
    data,
    sound: "default",
    channelId: "messages",
    priority: "high",
  }));

  const dead = [];
  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((t, i) => {
        if (t.status === "error" && t.details?.error === "DeviceNotRegistered") dead.push(chunk[i].to);
      });
    } catch (err) {
      console.error("[Messagerie] Push client non envoyée :", err.message);
    }
  }
  if (dead.length) {
    await User.updateOne(
      { _id: userId },
      { $pull: { expoPushTokens: { $in: dead } }, ...(dead.includes(user.pushToken) ? { $unset: { pushToken: 1 } } : {}) }
    ).catch(() => {});
  }
}

module.exports = { sendToClient, isExpoPushToken: (t) => Expo.isExpoPushToken(t) };
