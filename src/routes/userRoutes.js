const express = require('express');
const router = express.Router();
const userController = require('../userControler');
const middelware = require('../auth/middelware');

// User management
router.post('/user', userController.createUser);
router.get('/user', userController.getUser);
router.get('/getUsers', userController.getUsers);
router.get('/getUserByName/:name', userController.getUserByName);

// Profile management
router.post('/createProfile', middelware.upload.single('image'), userController.creatProfile);
router.get('/getUserProfile', userController.getUserProfile);
router.get('/getUserProfiles', userController.getUserProfiles);

// Address management
router.get('/getAllAddressByUser', userController.getAllAddressByUser);
router.post('/createOrUpdateAddress', userController.createOrUpdateAddress);
router.get('/getAddressByUserKey/:clefUser', userController.getAddressByUserKey);

// Payment methods
router.post('/createMoyentPayment', userController.createMoyentPayment);
router.get('/getMoyentPaymentByClefUser/:clefUser', userController.getMoyentPaymentByClefUser);

// User messages
router.put('/lecturUserMessage', userController.lecturUserMessage);
router.put('/lecturAdminMessage', userController.lecturAdminMessage);
router.post('/createUserMessage', userController.createUserMessage);
router.get('/getAllUserMessages', userController.getAllUserMessages);
router.delete('/deleteUserMessageById/:id', userController.deleteUserMessageById);
router.put('/updateUserMessageAttributeById/:id', userController.updateUserMessageAttributeById);
router.get('/getUserMessagesByClefUser/:id', userController.getUserMessagesByClefUser);

// Push notifications
router.post('/saveUserPushToken', userController.saveUserPushToken);

// Email services
router.post('/sendMail', userController.Send_email);
router.post('/Send_email_freind', userController.Send_email_freind);

// Promo codes
router.post('/createCodePromo', userController.createCodePromo);
router.get('/getCodePromoByHashedCode', userController.getCodePromoByHashedCode);
router.get('/getCodePromoById/:id', userController.getCodePromoById);
router.get('/getCodePromoByClefUser/:clefUser', userController.getCodePromoByClefUser);
router.put('/updateCodePromo', userController.updateCodePromo);
router.delete('/deleteCodePromo/:id', userController.deleteCodePromo);

module.exports = router;