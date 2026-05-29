const CreditClient = require('./CreditClient');
const { SellerRequest } = require('../../Models');

// GET /?statut=en_cours&page=1&limit=20
const listerCreances = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { statut, page = 1, limit = 20 } = req.query;

    const query = { sellerId };
    if (statut && ['en_cours', 'rembourse', 'litige'].includes(statut)) {
      query.statut = statut;
    }

    const [credits, total] = await Promise.all([
      CreditClient.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),
      CreditClient.countDocuments(query),
    ]);

    return res.json({ status: 'success', data: { credits, total, page: Number(page), limit: Number(limit) } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// GET /stats
const getStats = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const [enCours, rembourse, litige] = await Promise.all([
      CreditClient.find({ sellerId, statut: 'en_cours' }).lean(),
      CreditClient.countDocuments({ sellerId, statut: 'rembourse' }),
      CreditClient.countDocuments({ sellerId, statut: 'litige' }),
    ]);

    const totalDu = enCours.reduce((s, c) => s + c.montantDu, 0);
    const totalInitial = enCours.reduce((s, c) => s + c.montantInitial, 0);

    return res.json({
      status: 'success',
      data: { enCours: enCours.length, rembourse, litige, totalDu, totalInitial },
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// POST /
const creerCreance = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { clientNom, clientTel, montantInitial, montantDu, produitLabel, note, dateEcheance } = req.body;

    if (!clientNom || !montantInitial) {
      return res.status(400).json({ status: 'error', message: 'clientNom et montantInitial sont requis' });
    }

    const montantInitialNum = Number(montantInitial);
    const montantDuNum = montantDu !== undefined
      ? Math.min(Math.max(0, Number(montantDu)), montantInitialNum)
      : montantInitialNum;

    const dejaPaye = montantInitialNum - montantDuNum;
    const paiementsInitiaux = dejaPaye > 0
      ? [{ montant: dejaPaye, note: 'Acompte à la création' }]
      : [];

    const credit = new CreditClient({
      sellerId,
      clientNom: clientNom.trim(),
      clientTel: clientTel || '',
      montantInitial: montantInitialNum,
      montantDu: montantDuNum,
      produitLabel: produitLabel || '',
      note: note || '',
      dateEcheance: dateEcheance ? new Date(dateEcheance) : null,
      paiements: paiementsInitiaux,
      statut: montantDuNum === 0 ? 'rembourse' : 'en_cours',
    });

    await credit.save();
    return res.status(201).json({ status: 'success', data: credit });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// PATCH /:id/rembourser  { montant, note }
const rembourser = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { id } = req.params;
    const { montant, note } = req.body;

    const credit = await CreditClient.findOne({ _id: id, sellerId });
    if (!credit) return res.status(404).json({ status: 'error', message: 'Crédit non trouvé' });

    // Vérifier quota SMS avant d'incrémenter (pour les rappels futurs)
    const montantPaye = Math.min(Number(montant), credit.montantDu);
    credit.montantDu = Math.max(0, credit.montantDu - montantPaye);
    credit.paiements.push({ montant: montantPaye, note: note || '' });

    if (credit.montantDu === 0) {
      credit.statut = 'rembourse';
    }

    await credit.save();
    return res.json({ status: 'success', data: credit });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// PATCH /:id
const modifierCreance = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { id } = req.params;
    const { clientNom, clientTel, produitLabel, note, dateEcheance, montantInitial } = req.body;

    const credit = await CreditClient.findOne({ _id: id, sellerId });
    if (!credit) return res.status(404).json({ status: 'error', message: 'Crédit non trouvé' });

    if (clientNom !== undefined) credit.clientNom = clientNom.trim();
    if (clientTel !== undefined) credit.clientTel = clientTel;
    if (produitLabel !== undefined) credit.produitLabel = produitLabel;
    if (note !== undefined) credit.note = note;
    if (dateEcheance !== undefined) credit.dateEcheance = dateEcheance ? new Date(dateEcheance) : null;

    if (montantInitial !== undefined && Number(montantInitial) > 0) {
      const deja = credit.montantInitial - credit.montantDu;
      credit.montantInitial = Number(montantInitial);
      credit.montantDu = Math.max(0, Number(montantInitial) - deja);
      if (credit.montantDu === 0) credit.statut = 'rembourse';
    }

    await credit.save();
    return res.json({ status: 'success', data: credit });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// DELETE /:id
const supprimerCreance = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { id } = req.params;
    const credit = await CreditClient.findOneAndDelete({ _id: id, sellerId });
    if (!credit) return res.status(404).json({ status: 'error', message: 'Crédit non trouvé' });
    return res.json({ status: 'success', data: { id } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// PATCH /:id/statut  { statut }
const changerStatut = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { id } = req.params;
    const { statut } = req.body;

    if (!['en_cours', 'rembourse', 'litige'].includes(statut)) {
      return res.status(400).json({ status: 'error', message: 'Statut invalide' });
    }

    const credit = await CreditClient.findOneAndUpdate(
      { _id: id, sellerId },
      { statut },
      { new: true }
    );
    if (!credit) return res.status(404).json({ status: 'error', message: 'Crédit non trouvé' });

    return res.json({ status: 'success', data: credit });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// POST /:id/rappel  { canal }
const envoyerRappel = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { id } = req.params;
    const { canal = 'manuel' } = req.body;

    const credit = await CreditClient.findOne({ _id: id, sellerId }).populate('sellerId', 'storeName businessPhone smsQuota');
    if (!credit) return res.status(404).json({ status: 'error', message: 'Crédit non trouvé' });

    credit.rappels.push({ canal, date: new Date() });
    await credit.save();

    const storeName = credit.sellerId?.storeName || 'La boutique';
    const message = `Rappel de ${storeName} : vous avez un crédit de ${credit.montantDu.toLocaleString()} FCFA en cours. Merci de vous acquitter de votre dû.`;

    let sendResult = { sent: false, message };

    if (canal === 'sms' && credit.clientTel) {
      // Vérifier le quota SMS du vendeur
      const seller = await SellerRequest.findById(sellerId).select('smsQuota');
      const quota = seller?.smsQuota;

      if (!quota || quota.mensuel === 0) {
        sendResult.smsError = 'Aucun quota SMS alloué sur votre compte';
      } else if (quota.utilise >= quota.mensuel) {
        sendResult.smsError = `Quota SMS mensuel atteint (${quota.mensuel} SMS)`;
      } else {
        try {
          const smsService = require('../../services/lafricaMobileSmsService');
          await smsService.sendSms({ to: credit.clientTel, text: message });
          // Incrémenter le compteur
          await SellerRequest.findByIdAndUpdate(sellerId, { $inc: { 'smsQuota.utilise': 1 } });
          sendResult.sent = true;
          sendResult.quotaRestant = quota.mensuel - quota.utilise - 1;
        } catch (smsErr) {
          if (smsErr.code !== 'SMS_DISABLED') {
            console.error('SMS rappel error:', smsErr.message);
          }
          sendResult.smsError = smsErr.message;
        }
      }
    }

    return res.json({
      status: 'success',
      data: { rappel: { canal, date: new Date(), ...sendResult } },
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

module.exports = { listerCreances, creerCreance, modifierCreance, supprimerCreance, rembourser, changerStatut, envoyerRappel, getStats };
