const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  action: {
    type: String,
    required: true,
    enum: [
      'CREATE', 'UPDATE', 'DELETE', 'RESTORE',
      'EXPORT', 'LOGIN', 'LOGOUT', 'CATEGORY_OVERRIDE',
    ],
    index: true,
  },
  resource:   { type: String, required: true, index: true }, // e.g. 'Transaction', 'Goal'
  resourceId: { type: mongoose.Schema.Types.ObjectId, index: true },
  before:     { type: mongoose.Schema.Types.Mixed, default: null }, // snapshot before
  after:      { type: mongoose.Schema.Types.Mixed, default: null }, // snapshot after
  diff: [{
    field:    String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
  }],
  ipAddress:  { type: String },
  userAgent:  { type: String },
  requestId:  { type: String }, // correlation id for tracing
  note:       { type: String }, // free-text context
}, {
  timestamps: true,
  // Audit logs are append-only; never update or delete them
});

// TTL: keep audit logs for 2 years (63072000 seconds)
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 63072000 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ resource: 1, resourceId: 1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
