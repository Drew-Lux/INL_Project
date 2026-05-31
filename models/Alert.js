const mongoose = require('mongoose');

// ── Alert Configuration (user preferences) ───────────────────────────────────
const AlertConfigSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  budgetThreshold: {
    enabled:    { type: Boolean, default: true },
    percentWarn:{ type: Number, default: 80 },  // warn at 80% of budget
    percentCrit:{ type: Number, default: 100 }, // critical at 100%
  },
  anomalyAlerts: {
    enabled:          { type: Boolean, default: true },
    unusualSpending:  { type: Boolean, default: true },
    largeTransaction: { type: Boolean, default: true },
    largeTransactionThreshold: { type: Number, default: 500 },
  },
  goalAlerts: {
    enabled:    { type: Boolean, default: true },
    milestoneReached: { type: Boolean, default: true },
    goalCompleted:    { type: Boolean, default: true },
    goalAtRisk:       { type: Boolean, default: true },
  },
  recurringAlerts: {
    enabled:        { type: Boolean, default: true },
    upcomingDays:   { type: Number, default: 3 }, // alert N days before due
    missedPayment:  { type: Boolean, default: true },
  },
  channels: {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    push:  { type: Boolean, default: false },
  },
}, { timestamps: true });

// ── Alert Event (fired alerts) ────────────────────────────────────────────────
const AlertEventSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
    enum: [
      'budget_warning',
      'budget_exceeded',
      'anomaly_large_transaction',
      'anomaly_unusual_spending',
      'goal_milestone',
      'goal_completed',
      'goal_at_risk',
      'recurring_upcoming',
      'recurring_missed',
    ],
    index: true,
  },
  severity: {
    type: String,
    enum: ['info', 'warning', 'critical'],
    default: 'info',
  },
  title:   { type: String, required: true },
  message: { type: String, required: true },
  metadata: {
    type: mongoose.Schema.Types.Mixed, // e.g. { transactionId, budgetCategoryId, goalId }
    default: {},
  },
  read:     { type: Boolean, default: false, index: true },
  readAt:   { type: Date },
  channels: {
    inApp: { type: Boolean, default: false },
    email: { type: Boolean, default: false },
    push:  { type: Boolean, default: false },
  },
  deliveredAt: { type: Date },
}, { timestamps: true });

AlertEventSchema.index({ userId: 1, read: 1 });
AlertEventSchema.index({ userId: 1, createdAt: -1 });

const AlertConfig = mongoose.model('AlertConfig', AlertConfigSchema);
const AlertEvent  = mongoose.model('AlertEvent', AlertEventSchema);

module.exports = { AlertConfig, AlertEvent };
