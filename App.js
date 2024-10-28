const express = require("express");
const cors = require("cors");
const db = require("./src/dbs");
const userController = require("./src/userControler");
const forgotPassword = require("./src/auth/forgotPassword");
const bodyparser = require("body-parser");
const cookieParser = require("cookie-parser");
const path = require("path");
const authentification = require("./src/auth/authentification");
const port = 8080;
const middelware = require("./src/auth/middelware");
const productControler = require("./src/productControler");
const fournisseurControler = require("./src/fournisseurController");
const sellerController = require("./src/storeController");
const AdminController = require("./src/auth/AdminController");
const morgan = require("morgan");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      "https://chagona-ne.onrender.com",
      "http://localhost:3000",
      "https://habou227.onrender.com",
      "https://habou227-seller.onrender.com",
      "https://e-habou.onrender.com",
      "https://ihambaobab.onrender.com",
    ],
    credentials: true,
  },
});

// app
//   .use(
//     cors({
//       credentials: true,
//       origin: ["http://localhost:3000", "https://chagona-ne.onrender.com/"],
//       exposedHeaders: ["Set-Cookie", "Date", "ETag"],
//     })
//   )
app
  .use(
    cors({
      origin: [
        "https://chagona-ne.onrender.com",
        "http://localhost:3000",
        "https://habou227.onrender.com",
        "https://habou227-seller.onrender.com",
        "https://e-habou.onrender.com",
        "https://ihambaobab.onrender.com",
      ],
      credentials: true,
    })
  )
  .use(morgan("dev"))
  .use(bodyparser.json())
  .use(cookieParser())
  .use("/images", express.static(path.join(__dirname, "./src/uploads/images")));
//   '/images',express.static(path.join(__dirname, 'images'))

// app.use((req, res, next) => {
//   res;
//   res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
//   res.setHeader("Access-Control-Allow-Credentials", "true");
//   next();
// });

// Gérez les connexions WebSocket
io.on("connection", (socket) => {
  // console.log("Nouvelle connexion WebSocket établie.");

  // Gérez les événements liés aux messages en temps réel
  socket.on("delete_message", (data) => {
    // Enregistrez le message en base de données (si nécessaire)
    // Émettez le message à tous les clients connectés, y compris l'expéditeur
    io.emit("delete_message", data);
  });
  socket.on("new_message_u", (data) => {
    io.emit("new_message_user", data);
  });

  // Gérez d'autres événements liés aux utilisateurs connectés, etc.
});

app.get("/", (req, res) => {
  res.json("node");
});

app.post("/user", userController.createUser);
app.post("/login", authentification.login);
app.post("/AdminLogin", authentification.AdminLogin);
app.post(
  "/createProfile",
  middelware.upload.single("image"),
  userController.creatProfile
);
app.get("/user", userController.getUser);
app.post("/createMoyentPayment", userController.createMoyentPayment);
app.get(
  "/getMoyentPaymentByClefUser/:clefUser",
  userController.getMoyentPaymentByClefUser
);
app.get("/verify", middelware.auth, userController.verifyToken);
app.get("/verifyAdmin", middelware.authAdmin, AdminController.verifyToken);
app.get("/productPubget", productControler.productPubget);
app.delete("/productPubDelete/:id", productControler.productPubDelete);
app.post(
  "/productPubCreate",
  middelware.upload.single("image"),
  productControler.productPubCreate
);
app.get("/getCodePromoByHashedCode", userController.getCodePromoByHashedCode);
app.put("/updateCodePromo", userController.updateCodePromo);
app.get("/getUserProfile", userController.getUserProfile);
app.get("/getUsers", userController.getUsers);
app.get("/getUserProfiles", userController.getUserProfiles);
app.get("/getAllAddressByUser", userController.getAllAddressByUser);
app.post("/createOrUpdateAddress", userController.createOrUpdateAddress);
app.get("/getAddressByUserKey/:clefUser", userController.getAddressByUserKey);
app.get("/getAllCategories", productControler.getAllCategories);
app.delete("/supCategorie", productControler.supCategorie);
app.post("/createCommande", userController.createCommande);
app.put("/mettreAJourStatuts/:commandeId", userController.mettreAJourStatuts);
app.get("/getCommandesById/:id", userController.getCommandesById);
app.put(
  "/commande/etatTraitement/:id",
  productControler.updateEtatTraitementCommande
);
app.put("/lecturUserMessage", userController.lecturUserMessage);
app.put("/lecturAdminMessage", userController.lecturAdminMessage);
app.post("/createUserMessage", userController.createUserMessage);
app.post("/saveUserPushToken", userController.saveUserPushToken);
app.get("/getAllUserMessages", userController.getAllUserMessages);
app.delete("/deleteUserMessageById/:id", userController.deleteUserMessageById);
app.put(
  "/updateUserMessageAttributeById/:id",
  userController.updateUserMessageAttributeById
);
app.get(
  "/getUserMessagesByClefUser/:id",
  userController.getUserMessagesByClefUser
);
app.get(
  "/getCommandesByClefUser/:clefUser",
  userController.getCommandesByClefUser
);
app.get("/getAllCommandes", userController.getAllCommandes);
app.get("/getUserByName/:name", userController.getUserByName);
app.post("/createCodePromo", userController.createCodePromo);
app.get(
  "/getCodePromoByClefUser/:clefUser",
  userController.getCodePromoByClefUser
);
app.delete(
  "/deleteCommandeById/:commandeId",
  userController.deleteCommandeById
);
app.delete("/deleteCodePromo/:id", userController.deleteCodePromo);
app.put(
  "/updateCategorie/:id",
  middelware.upload.single("image"),
  productControler.updateCategorie
);
app.delete("/suppType", productControler.suppType);
app.post("/createProductType", productControler.createProductType);
app.get("/getAllType", productControler.getAllType);

app.post(
  "/categorie",
  middelware.upload.single("image"),
  productControler.createCategorie
);

app.post(
  "/fournisseur",
  middelware.upload.single("image"),
  fournisseurControler.createFournisseur
);
app.get("/fournisseurs", fournisseurControler.getAll);
app.get("/fournisseur/:id", fournisseurControler.getByid);
app.get(
  "/findFournisseurByName/:name",
  fournisseurControler.findFournisseurByName
);
app.post("/sendMail", userController.Send_email);
app.post("/Send_email_freind", userController.Send_email_freind);

app.post(
  "/product",
  middelware.upload2.fields([
    { name: "image1" },
    { name: "image2" },
    { name: "image3" },
    { name: "nouveauChampImages", maxCount: 5 }, // Suppose que le nouveau champ est appelé "nouveauChampImages" et peut avoir jusqu'à 5 images
  ]),
  productControler.createProduct
);

const a =
  "https://res.cloudinary.com/dkfddtykk/image/upload/v1689343440/images/emcve0mcblihepzw32zd.jpg";
// console.log(a.split("/").pop().split(".")[0]);
app.get("/Products", productControler.getAllProducts);
app.put(
  "/Product/:productId",
  middelware.upload2.fields([
    { name: "image1" },
    { name: "image2" },
    { name: "image3" },
    { name: "nouveauChampImages", maxCount: 5 },
  ]),
  productControler.updateProduct
);
app.get("/Product/:productId", productControler.getProductById);
app.delete("/Product/:productId", productControler.deleteProduct);
app.get("/searchProductByType/:type", productControler.searchProductByType);
app.get("/searchProductByName/:name", productControler.searchProductByName);
app.get("/getAllCommenteProduit", productControler.getAllCommenteProduit);
app.get("/getMarqueClusters", productControler.getMarqueClusters);
app.get("/getCouleurClusters", productControler.getCouleurClusters);
app.get(
  "/getAllCommenteProduitById/:id",
  productControler.getAllCommenteProduitById
);
app.post("/createCommenteProduit", productControler.createCommenteProduit);
app.get(
  "/searchProductBySupplier/:supplierId",
  fournisseurControler.searchProductBySupplier
);
app.put(
  "/updateFournisseur/:id",
  middelware.upload.single("image"),
  fournisseurControler.updateFournisseur
);

///////////////////////////////////// SellerController //////////////////////////////////////////
app.post(
  "/createSeller",
  middelware.upload.single("image"),
  sellerController.createSeller
);
app.post("/SellerLogin", sellerController.login);
app.delete("/deleteSeller/:id", sellerController.deleteSeller);
app.put("/validerDemandeVendeur/:id", sellerController.validerDemandeVendeur);

app.get(
  "/Sellerverify/:id",
  middelware.authSeller,
  sellerController.verifyToken
);
app.get("/getSeller/:Id", sellerController.getSeller);
app.get("/getSellers/", sellerController.getSellers);
app.get("/findSellerByName/:name", sellerController.findSellerByName);
app.put(
  "/setImage/:id",
  middelware.upload.single("image"),
  sellerController.setImage
);
app.put("/validerDemandeVendeur/:id", sellerController.validerDemandeVendeur);

app.post("/forgot_password", forgotPassword.forgot_password);
app.post("/reset_password", forgotPassword.reset_password);

app.post("/payments", userController.requette);
app.get("/payments", userController.requetteGet);

app.post("/generate_payment_page", userController.generate_payment_page);
app.get("/payment_success", userController.payment_success);
app.get("/payment_failure", userController.payment_failure);
app.get("/payment_callback", userController.payment_callback);
app.post("/payment_success", userController.payment_success);

///////////////////////////////////// fin SellerController //////////////////////////////////////////
// app.get("/user",auth,userController.getUsers)
// app.get("/login",userController.getUserByEmail)

// app.listen(port, () =>
//   console.log(
//     `votre application est sur ecoute sur: https://habou227.onrender.com: ${port}`
//   )
// );
app.get("/productte/:id", (req, res) => {
  // Récupérez l'ID du produit à partir de la route
  const productId = req.params.id;

  // Simulez la récupération des données du produit
  const product = {
    id: productId,
    name: "Produit génial",
    description: "Ceci est un produit incroyable.",
    price: 19.99,
  };

  // Générez le HTML de base de la page
  const html = `
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Détails du produit - ${product.name}</title>
      </head>
      <body>
        <div id="root"></div>
        <script src="/bundle.js"></script>
      </body>
    </html>
  `;

  res.send(html);
});

server.listen(port, () => {
  console.log(
    `Votre application est en écoute sur : https://habou227.onrender.com:${port}`
  );
});
