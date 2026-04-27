const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    multiplier: { type: Number, required: true, min: 1, max: 10, default: 2 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    // Which earning types get the multiplier — empty array means ALL
    applicableTypes: {
      type: [String],
      enum: ["PURCHASE", "CHECKIN", "REVIEW", "FIRST_ORDER"],
      default: [],
    },
    createdBy: { type: String, default: null },
  },
  { timestamps: true }
);

// Virtual: current status
eventSchema.virtual("status").get(function () {
  const now = new Date();
  if (!this.isActive) return "inactive";
  if (now < this.startDate) return "planned";
  if (now > this.endDate) return "expired";
  return "active";
});

eventSchema.set("toJSON", { virtuals: true });
eventSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Event", eventSchema);
