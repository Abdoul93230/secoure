const express = require('express');
const router = express.Router();
const fournisseurControler = require('../fournisseurController');
const middelware = require('../auth/middelware');

// Supplier CRUD
router.post('/fournisseur', middelware.upload.single('image'), fournisseurControler.createFournisseur);
router.get('/fournisseurs', fournisseurControler.getAll);
router.get('/fournisseur/:id', fournisseurControler.getByid);
router.put('/updateFournisseur/:id', middelware.upload.single('image'), fournisseurControler.updateFournisseur);

// Supplier search
router.get('/findFournisseurByName/:name', fournisseurControler.findFournisseurByName);
router.get('/searchProductBySupplier/:supplierId', fournisseurControler.searchProductBySupplier);
router.get('/searchProductBySupplierClients/:supplierId', fournisseurControler.searchProductBySupplierClients);
router.get('/searchProductBySupplierAdmin/:supplierId', fournisseurControler.searchProductBySupplierAdmin);

module.exports = router;