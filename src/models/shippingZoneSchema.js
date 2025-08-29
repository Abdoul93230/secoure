const mongoose = require("mongoose");

const shippingZoneSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Le nom de la zone est requis"],
  },
  transporteurId: {
    type: String,
    required: [true, "Le Id d'expedition est requis"],
  },
  transporteurName: {
    type: String,
    required: [true, "Le nom d'expedition est requis"],
  },
  transporteurContact: {
    type: String,
    required: [true, "Le numero d'expedition est requis"],
  },
  baseFee: {
    type: Number,
    required: [true, "Les frais de base sont requis"],
    min: [0, "Les frais ne peuvent pas être négatifs"],
  },
  weightFee: {
    type: Number,
    required: [true, "Les frais au kilo sont requis"],
    default: 0,
    min: [0, "Les frais ne peuvent pas être négatifs"],
  },
  countries: [
    {
      type: String,
      required: [true, "Au moins un pays est requis"],
    },
  ],
});

const ShippingZone = mongoose.model("ShippingZone", shippingZoneSchema);
module.exports = { ShippingZone };
