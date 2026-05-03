const express = require('express');
const { google } = require('googleapis');
const router = express.Router();

function getGoogleAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// POST /api/newsletter
router.post('/', async (req, res) => {
  const { email, phone } = req.body;

  if (!email && !phone) {
    return res.status(400).json({ error: 'Email ou téléphone requis' });
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }

  try {
    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const date = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Niamey' });

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `'Newsletter Abonnés'!A:C`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[date, email || '', phone || '']],
      },
    });

    res.json({ success: true, message: 'Inscription réussie !' });
  } catch (err) {
    console.error('❌ Newsletter Sheets error:', err.message);
    res.status(500).json({ error: 'Erreur serveur lors de l\'inscription' });
  }
});

module.exports = router;
