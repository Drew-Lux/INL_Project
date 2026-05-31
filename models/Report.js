const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['monthly_digest', 'custom_range', 'tax_summary', 'budget_variance', 'goal_summary'],
    index: true,
  },
  format: {
    type: String,
    enum: ['pdf', 'csv'],
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true,
  },
  parameters: {
    startDate:   Date,
    endDate:     Date,
    currency:    { type: String, default: 'USD' },
    accountIds:  [mongoose.Schema.Types.ObjectId],
    categories:  [String],
    includeCharts: { type: Boolean, default: true },
  },
  filePath:    { type: String },   // local/cloud path once generated
  fileSize:    { type: Number },   // bytes
  downloadUrl: { type: String },   // pre-signed or relative URL
  expiresAt:   { type: Date },     // when to purge the file
  emailedAt:   { type: Date },
  errorMessage:{ type: String },
  generatedAt: { type: Date },
}, { timestamps: true });

ReportSchema.index({ userId: 1, createdAt: -1 });
// Auto-delete record 30 days after file expires
ReportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Report', ReportSchema);
