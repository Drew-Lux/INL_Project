const mongoose = require('mongoose');

const MilestoneSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  targetAmount:{ type: Number, required: true },
  targetDate:  { type: Date },
  reached:     { type: Boolean, default: false },
  reachedAt:   { type: Date },
}, { _id: true });

const GoalSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title:       { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  category: {
    type: String,
    enum: ['savings', 'debt_payoff', 'investment', 'emergency_fund', 'purchase', 'other'],
    default: 'other',
  },
  targetAmount:   { type: Number, required: true, min: 0 },
  currentAmount:  { type: Number, default: 0, min: 0 },
  currency:       { type: String, default: 'USD', uppercase: true },
  targetDate:     { type: Date },
  status: {
    type: String,
    enum: ['active', 'completed', 'paused', 'cancelled'],
    default: 'active',
    index: true,
  },
  milestones:     [MilestoneSchema],
  linkedAccountIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Account' }],
  autoTrack: {
    type: Boolean,
    default: false,
    comment: 'If true, scheduler auto-updates currentAmount from linked accounts',
  },
  completedAt:  { type: Date },
  deletedAt:    { type: Date, default: null }, // soft delete
}, {
  timestamps: true,
});

// Virtual: progress percentage
GoalSchema.virtual('progressPercent').get(function () {
  if (!this.targetAmount) return 0;
  return Math.min(100, Math.round((this.currentAmount / this.targetAmount) * 100));
});

// Virtual: days remaining
GoalSchema.virtual('daysRemaining').get(function () {
  if (!this.targetDate) return null;
  const diff = this.targetDate - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

GoalSchema.set('toJSON', { virtuals: true });
GoalSchema.set('toObject', { virtuals: true });

// Indexes
GoalSchema.index({ userId: 1, status: 1 });
GoalSchema.index({ userId: 1, deletedAt: 1 });

module.exports = mongoose.model('Goal', GoalSchema);
