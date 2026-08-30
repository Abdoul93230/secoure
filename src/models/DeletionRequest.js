const mongoose = require('mongoose');

const deletionRequestSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  email:       { type: String, required: true, trim: true, lowercase: true },
  accountType: { type: String, enum: ['client', 'vendeur'], default: 'client' },
  reason:      { type: String, trim: true },
  status:      { type: String, enum: ['pending', 'processed', 'rejected'], default: 'pending' },
  adminNote:   { type: String, trim: true },
  processedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('DeletionRequest', deletionRequestSchema);
