// controllers/emailCampaignController.js
const EmailCampaign = require("../EmailCampaign_Model");
const { validationResult } = require("express-validator");

// @desc    Obtenir toutes les campagnes email du vendeur
// @route   GET /api/marketing/emails
// @access  Private (Sellers)
exports.getEmailCampaigns = async (req, res) => {
  try {
    const campaigns = await EmailCampaign.find({ sellerId: req.user.id });

    res.status(200).json({
      success: true,
      count: campaigns.length,
      data: campaigns,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des campagnes email",
    });
  }
};

// @desc    Obtenir une campagne email spécifique
// @route   GET /api/marketing/emails/:id
// @access  Private (Sellers)
exports.getEmailCampaign = async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campagne email non trouvée",
      });
    }

    // Vérification que le vendeur est propriétaire de la campagne
    if (campaign.sellerId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Non autorisé à accéder à cette campagne",
      });
    }

    res.status(200).json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération de la campagne email",
    });
  }
};

// @desc    Créer une nouvelle campagne email
// @route   POST /api/marketing/emails
// @access  Private (Sellers)
exports.createEmailCampaign = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  try {
    const { title, subject, content, recipients, sendDate, storeId } = req.body;

    const newCampaign = await EmailCampaign.create({
      title,
      subject,
      content,
      recipients,
      sendDate: sendDate || null,
      status: sendDate ? "programmé" : "brouillon",
      storeId,
      sellerId: req.user.id,
    });

    res.status(201).json({
      success: true,
      data: newCampaign,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la création de la campagne email",
    });
  }
};

// @desc    Mettre à jour une campagne email
// @route   PUT /api/marketing/emails/:id
// @access  Private (Sellers)
exports.updateEmailCampaign = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  try {
    let campaign = await EmailCampaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campagne email non trouvée",
      });
    }

    // Vérification que le vendeur est propriétaire de la campagne
    if (campaign.sellerId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Non autorisé à modifier cette campagne",
      });
    }

    // Vérification qu'on ne modifie pas une campagne déjà envoyée
    if (campaign.status === "terminé") {
      return res.status(400).json({
        success: false,
        message: "Impossible de modifier une campagne terminée",
      });
    }

    const { title, subject, content, recipients, sendDate, status } = req.body;

    // Mise à jour des champs
    if (title) campaign.title = title;
    if (subject) campaign.subject = subject;
    if (content) campaign.content = content;
    if (recipients) campaign.recipients = recipients;
    if (sendDate) campaign.sendDate = sendDate;
    if (status) campaign.status = status;

    await campaign.save();

    res.status(200).json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la mise à jour de la campagne email",
    });
  }
};

// @desc    Supprimer une campagne email
// @route   DELETE /api/marketing/emails/:id
// @access  Private (Sellers)
exports.deleteEmailCampaign = async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campagne email non trouvée",
      });
    }

    // Vérification que le vendeur est propriétaire de la campagne
    if (campaign.sellerId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Non autorisé à supprimer cette campagne",
      });
    }

    await campaign.remove();

    res.status(200).json({
      success: true,
      message: "Campagne email supprimée avec succès",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la suppression de la campagne email",
    });
  }
};
