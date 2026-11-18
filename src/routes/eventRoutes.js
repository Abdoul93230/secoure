const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const middelware = require("../auth/middelware");
const { AppEvent, EVENT_NAMES } = require("../models/AppEvent");

const router = express.Router();
router.use(express.json({ limit: "50kb" }));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });
const clean = (v, n = 64) => (v === undefined || v === null || v === "" ? null : String(v).trim().slice(0, n));

/** POST /api/events — lot d'événements envoyé par l'app ou le site (20 au plus) */
router.post("/", limiter, async (req, res) => {
  try {
    const list = Array.isArray(req.body?.events) ? req.body.events.slice(0, 20) : [];
    if (!list.length) return res.json({ success: true, saved: 0 });

    let userId = null;
    const auth = req.headers.authorization || "";
    if (auth.startsWith("Bearer ")) {
      try { userId = String(jwt.verify(auth.slice(7), require("../auth/clef"))?.userId || "") || null; } catch { /* visiteur anonyme */ }
    }
    const device = clean(req.headers["x-visitor-id"]);
    const visitorKey = crypto.createHash("sha256")
      .update(device ? `d:${device}` : `ip:${req.ip}|${req.headers["user-agent"] || ""}`).digest("hex").slice(0, 32);
    const platform = ["android", "ios", "web"].includes(req.body?.platform) ? req.body.platform : "web";
    const source = clean(req.body?.source, 40);
    const now = Date.now();

    const docs = list
      .filter((e) => e && EVENT_NAMES.includes(e.name))
      .map((e) => {
        // Heure de l'appareil acceptée seulement si elle est plausible (événements gardés hors ligne)
        const ts = Number(e.ts);
        const at = Number.isFinite(ts) && ts <= now && ts > now - 7 * 864e5 ? ts : now;
        const value = Number(e.value);
        return {
          name: e.name, visitorKey, userId, platform, source,
          productId: clean(e.productId, 32), orderRef: clean(e.orderRef, 40),
          value: Number.isFinite(value) && value >= 0 ? Math.round(value) : null,
          day: new Date(at + 3600e3).toISOString().slice(0, 10),
          createdAt: new Date(at),
        };
      });
    if (docs.length) await AppEvent.insertMany(docs, { ordered: false });
    res.json({ success: true, saved: docs.length });
  } catch (e) {
    // La mesure ne doit jamais gêner le client
    res.json({ success: false });
  }
});

/** GET /api/events/funnel?days=30 — tunnel d'achat par plateforme (admin) */
router.get("/funnel", middelware.authAdmin, async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 180);
    const since = new Date(Date.now() - days * 864e5);
    const rows = await AppEvent.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { name: "$name", platform: "$platform" }, events: { $sum: 1 }, visitors: { $addToSet: "$visitorKey" }, value: { $sum: { $ifNull: ["$value", 0] } } } },
      { $project: { _id: 0, name: "$_id.name", platform: "$_id.platform", events: 1, visitors: { $size: "$visitors" }, value: 1 } },
    ]);
    const steps = ["product_view", "add_to_cart", "begin_checkout", "payment_start", "purchase"];
    const funnel = {};
    for (const platform of ["android", "ios", "web"]) {
      const by = Object.fromEntries(rows.filter((r) => r.platform === platform).map((r) => [r.name, r]));
      const views = by.product_view?.visitors || 0;
      const buyers = by.purchase?.visitors || 0;
      funnel[platform] = {
        steps: steps.map((s) => ({ name: s, visitors: by[s]?.visitors || 0, events: by[s]?.events || 0 })),
        conversion: views ? Math.round((buyers / views) * 1000) / 10 : 0, // % des visiteurs d'un article qui achètent
        averageOrder: by.purchase?.events ? Math.round(by.purchase.value / by.purchase.events) : 0,
        opens: by.app_open?.visitors || 0,
      };
    }
    const sources = await AppEvent.aggregate([
      { $match: { createdAt: { $gte: since }, source: { $ne: null } } },
      { $group: { _id: "$source", visitors: { $addToSet: "$visitorKey" } } },
      { $project: { _id: 0, source: "$_id", visitors: { $size: "$visitors" } } },
      { $sort: { visitors: -1 } }, { $limit: 20 },
    ]);
    // Chiffres de commandes réelles (payées ou à la livraison, hors annulées et démonstrations)
    const { Commande } = require("../Models");
    const { SELLER_VISIBLE } = require("../services/orderPaymentLifecycle");
    const realOrder = { ...SELLER_VISIBLE, etatTraitement: { $ne: "annulé" } };
    const [orderStats] = await Commande.aggregate([
      { $match: { ...realOrder, date: { $gte: since } } },
      { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: { $ifNull: ["$prix", 0] } }, clients: { $addToSet: "$clefUser" } } },
      { $project: { _id: 0, orders: 1, revenue: 1, clients: { $size: "$clients" } } },
    ]);

    // Réachat à 30 jours : parmi les clients dont la 1re commande date de plus de 30 jours (dans la période),
    // part de ceux qui ont recommandé dans les 30 jours suivants
    const cohortEnd = new Date(Date.now() - 30 * 864e5);
    const [repeat] = await Commande.aggregate([
      { $match: { ...realOrder, clefUser: { $nin: [null, ""] } } },
      { $sort: { date: 1 } },
      { $group: { _id: "$clefUser", dates: { $push: "$date" } } },
      { $project: { first: { $arrayElemAt: ["$dates", 0] }, second: { $ifNull: [{ $arrayElemAt: ["$dates", 1] }, null] } } },
      { $match: { first: { $gte: since, $lte: cohortEnd } } },
      { $group: {
        _id: null,
        cohort: { $sum: 1 },
        repeaters: { $sum: { $cond: [{ $and: [{ $ne: ["$second", null] }, { $lte: [{ $subtract: ["$second", "$first"] }, 30 * 864e5] }] }, 1, 0] } },
      } },
    ]);

    // Évolution jour par jour (toutes plateformes) : visiteurs d'articles, paniers, achats
    const daily = await AppEvent.aggregate([
      { $match: { createdAt: { $gte: since }, name: { $in: ["product_view", "add_to_cart", "purchase", "app_open"] } } },
      { $group: { _id: { day: "$day", name: "$name" }, visitors: { $addToSet: "$visitorKey" } } },
      { $project: { _id: 0, day: "$_id.day", name: "$_id.name", visitors: { $size: "$visitors" } } },
      { $sort: { day: 1 } },
    ]);
    const byDay = {};
    for (const r of daily) (byDay[r.day] = byDay[r.day] || { day: r.day })[r.name] = r.visitors;

    res.json({
      success: true, days, funnel, sources,
      orders: {
        count: orderStats?.orders || 0,
        revenue: orderStats?.revenue || 0,
        clients: orderStats?.clients || 0,
        averageOrder: orderStats?.orders ? Math.round(orderStats.revenue / orderStats.orders) : 0,
      },
      repeat30: { cohort: repeat?.cohort || 0, repeaters: repeat?.repeaters || 0, rate: repeat?.cohort ? Math.round((repeat.repeaters / repeat.cohort) * 1000) / 10 : null },
      daily: Object.values(byDay),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
