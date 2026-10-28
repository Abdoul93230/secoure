/**
 * Notifications push des clients (app mobile) pour la messagerie boutiques.
 * Jetons Expo : User.expoPushTokens (plusieurs appareils) + ancien champ User.pushToken.
 * Les jetons refusés par Expo (appareil désinstallé) sont retirés automatiquement.
 */
const { Expo } = require("expo-server-sdk");

const expo = new Expo();

/**
 * Envoi tolérant : un compte peut avoir des jetons de plusieurs projets Expo
 * (ancienne app + nouvelle). Expo refuse alors tout le lot (PUSH_TOO_MANY_EXPERIENCE_IDS) :
 * on renvoie un lot par projet. Les tickets sont rendus dans l'ordre des messages.
 */
async function sendGrouped(messages) {
  const tickets = new Array(messages.length);
  for (const chunk of expo.chunkPushNotifications(messages)) {
    let groups = [chunk];
    try {
      const res = await expo.sendPushNotificationsAsync(chunk);
      res.forEach((t, i) => { tickets[messages.indexOf(chunk[i])] = t; });
      continue;
    } catch (err) {
      if (err.code !== "PUSH_TOO_MANY_EXPERIENCE_IDS" || !err.details) throw err;
      groups = Object.values(err.details).map((toks) => chunk.filter((m) => toks.includes(m.to)));
    }
    for (const group of groups) {
      if (!group.length) continue;
      try {
        const res = await expo.sendPushNotificationsAsync(group);
        res.forEach((t, i) => { tickets[messages.indexOf(group[i])] = t; });
      } catch (err) {
        group.forEach((m) => { tickets[messages.indexOf(m)] = { status: "error", message: err.message, details: { error: err.code } }; });
      }
    }
  }
  return tickets.map((t) => t || { status: "error", message: "non envoyé" });
}

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
  try {
    const tickets = await sendGrouped(messages);
    tickets.forEach((t, i) => {
      if (t.status !== "error") return;
      if (t.details?.error === "DeviceNotRegistered") dead.push(messages[i].to);
      else console.error("[Messagerie] Push client refusée :", t.details?.error, t.message);
    });
  } catch (err) {
    console.error("[Messagerie] Push client non envoyée :", err.message);
  }
  if (dead.length) {
    await User.updateOne(
      { _id: userId },
      { $pull: { expoPushTokens: { $in: dead } }, ...(dead.includes(user.pushToken) ? { $unset: { pushToken: 1 } } : {}) }
    ).catch(() => {});
  }
}

/**
 * Diagnostic : envoie une notification de test au compte et renvoie, pour chaque jeton,
 * le ticket Expo puis le reçu (réponse de FCM), pour savoir où la chaîne casse.
 */
async function testClient(userId) {
  const { User } = require("../Models");
  const user = await User.findById(userId).select("pushToken expoPushTokens").lean();
  const tokens = [...new Set([...(user?.expoPushTokens || []), user?.pushToken].filter(Boolean))];
  const valid = tokens.filter((t) => Expo.isExpoPushToken(t));
  const report = { tokens: tokens.length, valid: valid.length, results: [] };
  if (!valid.length) return report;

  const messages = valid.map((to) => ({
    to, title: "Test Iham Baobab", body: "Les notifications fonctionnent ✅",
    data: { type: "push_test" }, sound: "default", channelId: "messages", priority: "high",
  }));
  const tickets = await sendGrouped(messages);
  tickets.forEach((t, i) => report.results.push({
    token: `${valid[i].slice(0, 22)}…`, ticket: t.status, error: t.details?.error || t.message || null, id: t.id,
  }));
  // Le reçu arrive quelques secondes après le ticket
  const ids = report.results.map((r) => r.id).filter(Boolean);
  if (ids.length) {
    await new Promise((r) => setTimeout(r, 4000));
    const receipts = await expo.getPushNotificationReceiptsAsync(ids).catch((e) => ({ _err: e.message }));
    report.results.forEach((r) => {
      const rc = receipts[r.id];
      r.receipt = rc ? rc.status : receipts._err ? `erreur: ${receipts._err}` : "en attente";
      if (rc?.status === "error") r.error = `${rc.details?.error || ""} ${rc.message || ""}`.trim();
    });
  }
  report.results.forEach((r) => delete r.id);
  return report;
}

module.exports = { sendToClient, testClient, isExpoPushToken: (t) => Expo.isExpoPushToken(t) };
