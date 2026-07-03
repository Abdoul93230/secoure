const express = require("express");
require("dotenv").config();
const cors = require("cors");
const db = require("./src/dbs");
const bodyparser = require("body-parser");
const cookieParser = require("cookie-parser");
const path = require("path");
const morgan = require("morgan");
const http = require("http");
const socketIo = require("socket.io");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");

// Import routes
const userRoutes = require("./src/routes/userRoutes");
const productRoutes = require("./src/routes/productRoutes");
const orderRoutes = require("./src/routes/orderRoutes");
const sellerRoutes = require("./src/routes/sellerRoutes");
const authRoutes = require("./src/routes/authRoutes");
const paymentRoutes = require("./src/routes/paymentRoutes");
const shippingRoutes = require("./src/routes/shippingRoutes");
const socialRoutes = require("./src/routes/socialRoutes");
const marketingRoutes = require("./src/routes/marketingRoutes");
const financeRoutes = require("./src/routes/financeRoutes");
const adminFinancialRoutes = require('./src/routes/adminFinancialRoutes');
const shippingAddressRoutes = require("./src/routes/shippingRoutesF");
const stockRoutes = require("./src/routes/stockRoutes");

const adminZonesRoutes = require('./src/routes/adminZones');
const adminShippingRoutes = require('./src/routes/adminShippingRoutes');
const sellerShippingRoutes = require('./src/routes/sellerShipping');
const publicShippingRoutes = require('./src/routes/publicShipping');
const adminSellersRoutes = require('./src/routes/adminSellersRoutes');
const enhancedAdminRoutes = require('./src/routes/enhancedAdminRoutes');
const sellerSubscriptionRoutes = require('./src/routes/sellerSubscriptionRoutes');
const promoCodeRoutes = require('./src/routes/promoCodeRoutes');
const gamificationRoutes = require('./src/routes/gamificationRoutes');
const newsletterRoutes = require('./src/routes/newsletterRoutes');
const posRoutes = require('./src/routes/posRoutes');

// Modules métier
const bilanRoutes = require('./src/modules/bilanJournalier/bilanRoutes');
const alertesRoutes = require('./src/modules/alertesStock/alertesRoutes');
const performanceRoutes = require('./src/modules/performanceProduits/performanceRoutes');
const creancesRoutes = require('./src/modules/carnetCreances/creancesRoutes');
const rapportRoutes = require('./src/modules/rapportPeriodique/rapportRoutes');

// Import middleware
const { errorHandler } = require('./src/middleware/errorHandler');
const authMiddleware = require('./src/middleware/auth');
const CronJobs = require('./src/utils/cronJobs');


const port = 8084;
const app = express();
const server = http.createServer(app);

// Render (et la plupart des hébergeurs cloud) font passer les requêtes par un reverse proxy.
// Sans ça, express-rate-limit voit l'IP du proxy au lieu de l'IP du client réel → ValidationError.
app.set('trust proxy', 1);

// Absorb abrupt client disconnections (ECONNRESET) at the TCP level
server.on("connection", (socket) => {
  socket.on("error", (err) => {
    if (err.code === "ECONNRESET") return;
    console.error("Socket error:", err);
  });
});

// ─── Rate Limiting ──────────────────────────────────────────────────────────
// Limite générale : 200 req/15 min par IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Trop de requêtes. Veuillez réessayer dans quelques minutes." },
});

// Limite stricte sur les endpoints d'authentification : 10 tentatives/15 min
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // ne compte que les échecs
  message: { success: false, message: "Trop de tentatives de connexion. Compte temporairement bloqué (15 min)." },
});


// Socket.IO configuration
const io = socketIo(server, {
  cors: {
    origin: [
      "https://chagona-ne.onrender.com",
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      "https://habou227.onrender.com",
      "https://habou227-seller.onrender.com",
      "https://e-habou.onrender.com",
      "https://ihambaobab.onrender.com",
      "http://localhost:5500",
      "http://localhost:5173",
      "https://i-pay.money",
      "https://ihambaobadmin.onrender.com",
      "https://ihambaobabv.onrender.com",
      "https://www.ihambaobab.com",
      "https://iham-admin.onrender.com",
      "https://admin.ihambaobab.com",
      "https://sellers-k9ce.onrender.com",
    ],
    credentials: true,
  },
});

app.set("io", io);

// Middleware configuration
app
  .use(globalLimiter)
  .use(
    cors({
      origin: [
        "https://chagona-ne.onrender.com",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "https://habou227.onrender.com",
        "https://habou227-seller.onrender.com",
        "https://e-habou.onrender.com",
        "https://ihambaobab.onrender.com",
        "http://localhost:5500",
        "http://localhost:5173",
        "https://i-pay.money",
        "https://ihambaobadmin.onrender.com",
        "https://ihambaobabv.onrender.com",
        "https://www.ihambaobab.com",
        "https://iham-admin.onrender.com",
        "https://admin.ihambaobab.com",
        "https://sellers-k9ce.onrender.com",
      ],
      credentials: true,
    })
  )
  .use(morgan("dev"))
  .use(bodyparser.json())
  .use(cookieParser())
  .use(mongoSanitize()) // Bloque les injections NoSQL ($where, $ne, etc.)
  .use("/images", express.static(path.join(__dirname, "./src/uploads/images")));

// WebSocket management
io.on("connection", (socket) => {
  // Absorb transport errors (ECONNRESET, etc.) so they don't crash the process
  socket.on("error", (err) => {
    // client disconnected abruptly — nothing to do
  });

  socket.on("payment:join", ({ reference }) => {
    if (reference) {
      socket.join(`payment:${reference}`);
    }
  });

  socket.on("payment:leave", ({ reference }) => {
    if (reference) {
      socket.leave(`payment:${reference}`);
    }
  });

  socket.on("seller:join", ({ sellerId }) => {
    if (sellerId) {
      socket.join(`seller:${sellerId}`);
    }
  });

  socket.on("seller:leave", ({ sellerId }) => {
    if (sellerId) {
      socket.leave(`seller:${sellerId}`);
    }
  });

  socket.on("delete_message", (data) => {
    io.emit("delete_message", data);
  });

  socket.on("new_message_u", (data) => {
    io.emit("new_message_user", data);
  });
});

// Basic routes
app.get("/", (req, res) => {
  res.json("node");
});

app.get("/proxy/ip-api", async (req, res) => {
  try {
    const clientIP = req.headers["client-ip"];
    const response = await axios.get(`http://ip-api.com/json/${clientIP}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).send("Error fetching data from ip-api");
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Serveur backend fonctionnel",
    timestamp: new Date().toISOString()
  });
});

// Routes configuration
app.use("/", authRoutes);
app.use("/", userRoutes);
app.use("/", productRoutes);
app.use("/", orderRoutes);
app.use("/", sellerRoutes);
app.use("/", paymentRoutes);
app.use("/", shippingRoutes);
app.use("/api/marketing", marketingRoutes);
app.use("/api", socialRoutes);
app.use("/api/financial", financeRoutes);
app.use('/adminf', adminFinancialRoutes);
app.use("/api/shipping", shippingAddressRoutes);
app.use("/api/stock", stockRoutes);

app.use('/api/admin/zones', authMiddleware.requireAdmin, adminZonesRoutes);
app.use('/api/admin/seller-shipping', authMiddleware.requireAdmin, adminShippingRoutes);
app.use('/api/seller', authMiddleware.requireSeller, sellerShippingRoutes);
app.use('/api/shipping2', publicShippingRoutes);
app.use('/api/adminSeller', authMiddleware.requireAdmin, adminSellersRoutes);
app.use('/api/adminSeller', authMiddleware.requireAdmin, enhancedAdminRoutes);
app.use('/api/seller/subscription', authMiddleware.requireSeller, sellerSubscriptionRoutes);
app.use('/api/promocodes', promoCodeRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/pos', posRoutes);

// Modules métier (tous protégés par requireSeller)
const { SellerRequest } = require('./src/Models');

// GET /api/modules/acces — retourne les modules activés + quota SMS du vendeur connecté
app.get('/api/modules/acces', authMiddleware.requireSeller, async (req, res) => {
  try {
    const seller = await SellerRequest.findById(req.user.id).select('modules smsQuota').lean();
    if (!seller) return res.status(404).json({ status: 'error', message: 'Vendeur introuvable' });
    return res.json({ status: 'success', data: { modules: seller.modules || {}, smsQuota: seller.smsQuota || {} } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /api/sync/heartbeat
// Retourne le timestamp de dernière modification de chaque entité pour ce vendeur.
// Ultra-léger : 4 requêtes MongoDB avec index → <30ms
// Permet au mobile de savoir exactement ce qui a changé sans tout fetcher
// GET /api/sync/heartbeat
// Retourne le timestamp de dernière modification de chaque entité pour ce vendeur.
// Ultra-léger : requêtes MongoDB avec index → <30ms
// Bilan = MAX(dernière VenteDirecte POS, dernière Transaction marketplace)
app.get('/api/sync/heartbeat', authMiddleware.requireSeller, async (req, res) => {
  try {
    const sellerId = req.user.id;
    const sellerIdStr = String(sellerId);
    const { Produit } = require('./src/Models');
    const VenteDirecte = require('./src/models/VenteDirecte');
    const Transaction = require('./src/models/transactionSchema');
    const CreditClient = require('./src/modules/carnetCreances/CreditClient');

    const [lastProduit, lastVentePOS, lastTxnMarket, lastCreance, lastCommande, deletedProduits] = await Promise.all([
      // Dernière modification produit actif du vendeur
      Produit.findOne(
        { Clefournisseur: sellerId, isDeleted: false },
        { updatedAt: 1, createdAt: 1 }
      ).sort({ updatedAt: -1 }).lean().catch(() => null),

      // Dernière vente POS (caisse) du vendeur
      VenteDirecte.findOne(
        { sellerId: sellerIdStr },
        { createdAt: 1 }
      ).sort({ createdAt: -1 }).lean().catch(() => null),

      // Dernière transaction marketplace (CREDIT_COMMANDE)
      Transaction.findOne(
        { sellerId: sellerIdStr, type: 'CREDIT_COMMANDE' },
        { dateTransaction: 1 }
      ).sort({ dateTransaction: -1 }).lean().catch(() => null),

      // Dernière créance du vendeur
      CreditClient.findOne(
        { sellerId },
        { updatedAt: 1 }
      ).sort({ updatedAt: -1 }).lean().catch(() => null),

      // Dernière commande marketplace (pour l'écran commandes)
      // On utilise la transaction pour être cohérent avec le bilan
      Transaction.findOne(
        { sellerId: sellerIdStr, type: 'CREDIT_COMMANDE' },
        { dateTransaction: 1 }
      ).sort({ dateTransaction: -1 }).lean().catch(() => null),

        // IDs supprimés physiquement (tombstone) OU via soft-delete (isDeleted:true)
      // Les deux cas couverts
      Promise.all([
        Produit.find({ Clefournisseur: sellerId, isDeleted: true }, { _id: 1 }).lean().catch(() => []),
        require('./src/Models').DeletedProduct
          .find({ sellerId }, { productId: 1 }).lean().catch(() => []),
      ]),
    ]);

    // Bilan = MAX(POS, Marketplace)
    const bilanPOS    = lastVentePOS?.createdAt       ? new Date(lastVentePOS.createdAt).getTime()        : 0;
    const bilanMarket = lastTxnMarket?.dateTransaction ? new Date(lastTxnMarket.dateTransaction).getTime() : 0;
    const bilanTs     = Math.max(bilanPOS, bilanMarket) || null;

    // IDs à supprimer du cache local (soft-delete + suppression physique)
    const [softDeleted, hardDeleted] = deletedProduits || [[], []];
    const deletedIds = [
      ...(softDeleted || []).map(p => String(p._id)),
      ...(hardDeleted || []).map(p => String(p.productId)),
    ].filter((v, i, a) => a.indexOf(v) === i); // déduplique

    return res.json({
      status: 'success',
      data: {
        bilan:      bilanTs,
        commandes:  lastCommande?.dateTransaction
          ? new Date(lastCommande.dateTransaction).getTime() : null,
        produits:   lastProduit?.updatedAt
          ? new Date(lastProduit.updatedAt).getTime()
          : lastProduit?.createdAt
          ? new Date(lastProduit.createdAt).getTime() : null,
        creances:   lastCreance?.updatedAt
          ? new Date(lastCreance.updatedAt).getTime() : null,
        deletedIds,   // ← IDs supprimés côté serveur
        serverTime: Date.now(),
      },
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

app.use('/api/modules/bilan', authMiddleware.requireSeller, bilanRoutes);
app.use('/api/modules/stock', authMiddleware.requireSeller, alertesRoutes);
app.use('/api/modules/performance', authMiddleware.requireSeller, performanceRoutes);
app.use('/api/modules/creances', authMiddleware.requireSeller, creancesRoutes);
app.use('/api/modules/rapports', authMiddleware.requireSeller, rapportRoutes);


// Start server
server.listen(port, () => {
  console.log(
    `Votre application est en écoute sur : https://habou227.onrender.com:${port}`
  );
  
  // Nettoyer les vieux logs financiers au démarrage (garde 7 jours)
  const financialLogger = require('./src/utils/financialLogger');
  financialLogger.cleanOldLogs(7);

  // Initialize cron jobs for subscription management and financial tasks
  console.log('Initializing cron jobs...');
  CronJobs.init();
  console.log('Cron jobs initialized successfully');
});