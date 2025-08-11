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

// Import routes
const userRoutes = require("./src/routes/userRoutes");
const productRoutes = require("./src/routes/productRoutes");
const orderRoutes = require("./src/routes/orderRoutes");
const sellerRoutes = require("./src/routes/sellerRoutes");
const supplierRoutes = require("./src/routes/supplierRoutes");
const authRoutes = require("./src/routes/authRoutes");
const paymentRoutes = require("./src/routes/paymentRoutes");
const shippingRoutes = require("./src/routes/shippingRoutes");
const socialRoutes = require("./src/routes/socialRoutes");
const marketingRoutes = require("./src/routes/marketingRoutes");

const port = 8083;
const app = express();
const server = http.createServer(app);

// Socket.IO configuration
const io = socketIo(server, {
  cors: {
    origin: [
      "https://chagona-ne.onrender.com",
      "http://localhost:3000",
      "http://localhost:3001",
      "https://habou227.onrender.com",
      "https://habou227-seller.onrender.com",
      "https://e-habou.onrender.com",
      "https://ihambaobab.onrender.com",
      "http://localhost:5500",
      "http://localhost:5173",
      "https://i-pay.money",
      "https://ihambaobadmin.onrender.com",
    ],
    credentials: true,
  },
});

// Middleware configuration
app
  .use(
    cors({
      origin: [
        "https://chagona-ne.onrender.com",
        "http://localhost:3000",
        "http://localhost:3001",
        "https://habou227.onrender.com",
        "https://habou227-seller.onrender.com",
        "https://e-habou.onrender.com",
        "https://ihambaobab.onrender.com",
        "http://localhost:5500",
        "http://localhost:5173",
        "https://i-pay.money",
        "https://ihambaobadmin.onrender.com",
      ],
      credentials: true,
    })
  )
  .use(morgan("dev"))
  .use(bodyparser.json())
  .use(cookieParser())
  .use("/images", express.static(path.join(__dirname, "./src/uploads/images")));

// WebSocket management
io.on("connection", (socket) => {
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
app.use("/", supplierRoutes);
app.use("/", paymentRoutes);
app.use("/", shippingRoutes);
app.use("/api/marketing", marketingRoutes);
app.use("/api", socialRoutes);

// Start server
server.listen(port, () => {
  console.log(
    `Votre application est en écoute sur : https://habou227.onrender.com:${port}`
  );
});