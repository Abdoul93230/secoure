// controllers/shippingZoneController.js
const { ShippingZone } = require("../models/shippingZoneSchema");

// Créer une nouvelle zone d'expédition
const createShippingZone = async (req, res) => {
  try {
    const newZone = new ShippingZone(req.body);
    await newZone.save();

    return res.status(201).json({
      success: true,
      message: "Zone d'expédition créée avec succès",
      zone: newZone,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Récupérer toutes les zones d'expédition
const getAllShippingZones = async (req, res) => {
  try {
    const zones = await ShippingZone.find({});
    return res.status(200).json({
      success: true,
      zones,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Récupérer une zone d'expédition par ID
const getShippingZoneById = async (req, res) => {
  try {
    const zone = await ShippingZone.findById(req.params.id);

    if (!zone) {
      return res.status(404).json({
        success: false,
        message: "Zone d'expédition non trouvée",
      });
    }

    return res.status(200).json({
      success: true,
      zone,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Mettre à jour une zone d'expédition
const updateShippingZone = async (req, res) => {
  try {
    const zone = await ShippingZone.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!zone) {
      return res.status(404).json({
        success: false,
        message: "Zone d'expédition non trouvée",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Zone d'expédition mise à jour avec succès",
      zone,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Supprimer une zone d'expédition
const deleteShippingZone = async (req, res) => {
  try {
    const zone = await ShippingZone.findByIdAndDelete(req.params.id);

    if (!zone) {
      return res.status(404).json({
        success: false,
        message: "Zone d'expédition non trouvée",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Zone d'expédition supprimée avec succès",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Récupérer les zones d'expédition par pays
const getZonesByCountry = async (req, res) => {
  try {
    const countryCode = req.params.countryCode;
    const zones = await ShippingZone.find({
      countries: countryCode,
    });

    return res.status(200).json({
      success: true,
      zones,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createShippingZone,
  getAllShippingZones,
  getShippingZoneById,
  updateShippingZone,
  deleteShippingZone,
  getZonesByCountry,
};
