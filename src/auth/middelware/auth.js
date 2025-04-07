// middleware/auth.js
const jwt = require("jsonwebtoken");
const { SellerRequest } = require("../../Models");

exports.protect = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Non autorisé à accéder à cette ressource",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await SellerRequest.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Token invalide",
      });
    }

    req.user = user;
    req.role = decoded.role;
    next();
  } catch (error) {
    console.error(error);
    return res.status(401).json({
      success: false,
      message: "Non autorisé à accéder à cette ressource",
    });
  }
};

exports.isSeller = (req, res, next) => {
  // console.log(req.role);
  // if (req.user && req.user.role === "seller") {
  if (req.user && req.role === "seller") {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: "Accès réservé aux vendeurs",
    });
  }
};
