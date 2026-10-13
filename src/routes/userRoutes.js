const express = require('express');
const router = express.Router();
const userController = require('../userControler');
const middelware = require('../auth/middelware');
const { ownerOrAdmin } = require('../auth/ownership');
const { promoCodeOwnerOrAdmin, mailLimiter } = require('../auth/accessGuards');

// SÉCURITÉ : un client ne peut modifier/lire que SES données (profil, adresse)
const sameUser = (pick) => (req, res, next) =>
  String(req.userId) === String(pick(req))
    ? next()
    : res.status(403).json({ message: "Action non autorisée sur ce compte." });

// User management
router.post('/user', userController.createUser);
router.get('/user', ownerOrAdmin((req) => req.query.id), userController.getUser);
// Listes complètes (emails, téléphones) : réservées à l'admin
router.get('/getUsers', middelware.authAdmin, userController.getUsers);
router.get('/getUserByName/:name', middelware.authAdmin, userController.getUserByName);

// Profile management
router.post('/createProfile', middelware.auth, middelware.upload.single('image'), sameUser((req) => req.body?.id), userController.creatProfile);
router.get('/getUserProfile', ownerOrAdmin((req) => req.query.id), userController.getUserProfile);
router.get('/getUserProfiles', middelware.authAdmin, userController.getUserProfiles);

// Address management
router.get('/getAllAddressByUser', middelware.authAdmin, userController.getAllAddressByUser);
router.post('/createOrUpdateAddress', middelware.auth, sameUser((req) => req.body?.clefUser), userController.createOrUpdateAddress);
router.get('/getAddressByUserKey/:clefUser', middelware.auth, sameUser((req) => req.params.clefUser), userController.getAddressByUserKey);

// Payment methods
// Moyens de paiement (contiennent des données de carte) : le client lui-même ou un admin
router.post('/createMoyentPayment', ownerOrAdmin((req) => req.body?.clefUser), userController.createMoyentPayment);
router.get('/getMoyentPaymentByClefUser/:clefUser', ownerOrAdmin((req) => req.params.clefUser), userController.getMoyentPaymentByClefUser);

// User messages
router.put('/lecturUserMessage', ownerOrAdmin((req) => req.body?.userKey), userController.lecturUserMessage);
router.put('/lecturAdminMessage', middelware.authAdmin, userController.lecturAdminMessage);
// Un client ne peut écrire qu'en son nom et jamais « en tant que support »
const clientMessageOnly = (req, res, next) => {
  if (!req.isAdmin) req.body.provenance = true;
  next();
};
router.post('/createUserMessage', ownerOrAdmin((req) => req.body?.clefUser), clientMessageOnly, userController.createUserMessage);
router.get('/getAllUserMessages', middelware.authAdmin, userController.getAllUserMessages);
router.delete('/deleteUserMessageById/:id', middelware.authAdmin, userController.deleteUserMessageById);
router.put('/updateUserMessageAttributeById/:id', ownerOrAdmin((req) => req.userId), userController.updateUserMessageAttributeById);
router.get('/getUserMessagesByClefUser/:id', ownerOrAdmin((req) => req.params.id), userController.getUserMessagesByClefUser);

// Push notifications
router.post('/saveUserPushToken', ownerOrAdmin((req) => req.body?.userId), userController.saveUserPushToken);

// Email services
// Formulaire de contact (vers la boîte de la société) : public mais limité ; partage à un ami : client connecté
router.post('/sendMail', mailLimiter, userController.Send_email);
router.post('/SendMail', mailLimiter, userController.Send_email);
router.post('/Send_email_freind', middelware.auth, mailLimiter, userController.Send_email_freind);

// Promo codes
router.post('/createCodePromo', middelware.authAdmin, userController.createCodePromo);
router.get('/getCodePromoByHashedCode', middelware.authAdmin, userController.getCodePromoByHashedCode);
router.get('/getCodePromoById/:id', middelware.authAdmin, userController.getCodePromoById);
router.get('/getCodePromoByClefUser/:clefUser', ownerOrAdmin((req) => req.params.clefUser), userController.getCodePromoByClefUser);
router.put('/updateCodePromo', promoCodeOwnerOrAdmin, userController.updateCodePromo);
router.delete('/deleteCodePromo/:id', middelware.authAdmin, userController.deleteCodePromo);

module.exports = router;