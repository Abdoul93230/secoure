const express = require('express');
const router = express.Router();
const DeletionRequest = require('../models/DeletionRequest');

// POST /api/deletion-request — public, pas d'auth requise
router.post('/deletion-request', async (req, res) => {
  try {
    const { name, email, accountType, reason } = req.body;
    if (!name?.trim() || !email?.trim()) {
      return res.status(400).json({ message: 'Nom et email sont obligatoires.' });
    }

    const existing = await DeletionRequest.findOne({ email: email.toLowerCase().trim(), status: 'pending' });
    if (existing) {
      return res.status(409).json({ message: 'Une demande est déjà en cours pour cet email. Nous vous contacterons sous 30 jours.' });
    }

    const request = await DeletionRequest.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      accountType: accountType || 'client',
      reason: reason?.trim() || '',
    });

    res.status(201).json({ success: true, message: 'Votre demande a bien été enregistrée. Nous vous contacterons sous 30 jours.', id: request._id });
  } catch (err) {
    console.error('[DeletionRequest] POST error:', err);
    res.status(500).json({ message: 'Erreur serveur. Veuillez réessayer.' });
  }
});

// GET /api/admin/deletion-requests — admin uniquement
router.get('/deletion-requests', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status && status !== 'all' ? { status } : {};
    const skip = (Number(page) - 1) * Number(limit);

    const [requests, total] = await Promise.all([
      DeletionRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      DeletionRequest.countDocuments(filter),
    ]);

    res.json({ requests, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error('[DeletionRequest] GET list error:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// PATCH /api/admin/deletion-requests/:id — admin uniquement
router.patch('/deletion-requests/:id', async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    if (!['processed', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ message: 'Statut invalide.' });
    }
    const update = { status };
    if (adminNote !== undefined) update.adminNote = adminNote.trim();
    if (status !== 'pending') update.processedAt = new Date();
    else update.processedAt = null;

    const request = await DeletionRequest.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!request) return res.status(404).json({ message: 'Demande introuvable.' });
    res.json({ success: true, message: 'Statut mis à jour.', request });
  } catch (err) {
    console.error('[DeletionRequest] PATCH error:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

module.exports = router;
