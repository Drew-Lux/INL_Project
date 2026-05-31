const { AlertConfig, AlertEvent } = require('../models/Alert');

/**
 * Default config for new users who haven't saved preferences yet.
 */
const DEFAULT_CONFIG = {
  budgetThreshold:  { enabled: true, percentWarn: 80, percentCrit: 100 },
  anomalyAlerts:    { enabled: true, unusualSpending: true, largeTransaction: true, largeTransactionThreshold: 500 },
  goalAlerts:       { enabled: true, milestoneReached: true, goalCompleted: true, goalAtRisk: true },
  recurringAlerts:  { enabled: true, upcomingDays: 3, missedPayment: true },
  channels:         { inApp: true, email: false, push: false },
};

const AlertService = {
  // ─── Config ────────────────────────────────────────────────────────────────

  async getConfig(userId) {
    const config = await AlertConfig.findOne({ userId });
    return config || DEFAULT_CONFIG;
  },

  async saveConfig(userId, updates) {
    return AlertConfig.findOneAndUpdate(
      { userId },
      { $set: updates },
      { upsert: true, new: true, runValidators: true }
    );
  },

  // ─── Events ────────────────────────────────────────────────────────────────

  async getAlerts(userId, { unreadOnly = false, page = 1, limit = 30 } = {}) {
    const query = { userId };
    if (unreadOnly) query.read = false;

    const [alerts, total, unreadCount] = await Promise.all([
      AlertEvent.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      AlertEvent.countDocuments(query),
      AlertEvent.countDocuments({ userId, read: false }),
    ]);
    return { alerts, total, unreadCount, page, pages: Math.ceil(total / limit) };
  },

  async markRead(userId, alertIds) {
    const query = { userId };
    if (alertIds?.length) query._id = { $in: alertIds };
    const result = await AlertEvent.updateMany(query, { $set: { read: true, readAt: new Date() } });
    return { updated: result.modifiedCount };
  },

  // ─── Budget threshold alerts (called by scheduler / BudgetVarianceService) ─

  async checkBudgetThresholds(userId, categoryId, categoryName, spent, budget) {
    const config = await AlertConfig.findOne({ userId }) || DEFAULT_CONFIG;
    if (!config.budgetThreshold?.enabled) return;

    const percent = budget > 0 ? (spent / budget) * 100 : 0;
    const warnPct = config.budgetThreshold.percentWarn || 80;
    const critPct = config.budgetThreshold.percentCrit || 100;

    let type, severity, title, message;

    if (percent >= critPct) {
      type = 'budget_exceeded';
      severity = 'critical';
      title = `Budget exceeded: ${categoryName}`;
      message = `You've spent ${percent.toFixed(0)}% of your ${categoryName} budget (${spent} / ${budget}).`;
    } else if (percent >= warnPct) {
      type = 'budget_warning';
      severity = 'warning';
      title = `Budget warning: ${categoryName}`;
      message = `You've used ${percent.toFixed(0)}% of your ${categoryName} budget. Only ${budget - spent} remaining.`;
    } else {
      return; // No alert needed
    }

    // Deduplicate: don't re-fire the same alert within 24 hours
    const recentAlert = await AlertEvent.findOne({
      userId, type,
      'metadata.categoryId': categoryId,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
    if (recentAlert) return;

    await AlertEvent.create({
      userId, type, severity, title, message,
      metadata: { categoryId, categoryName, spent, budget, percent },
      channels: { inApp: true, email: config.channels?.email },
    });
  },

  // ─── Anomaly alerts (consumes Person A's isAnomalous flag) ─────────────────

  async checkTransactionAnomaly(userId, transaction) {
    const config = await AlertConfig.findOne({ userId }) || DEFAULT_CONFIG;
    if (!config.anomalyAlerts?.enabled) return;

    const alerts = [];

    // Large transaction check
    if (
      config.anomalyAlerts.largeTransaction &&
      Math.abs(transaction.amount) >= (config.anomalyAlerts.largeTransactionThreshold || 500)
    ) {
      alerts.push({
        userId,
        type: 'anomaly_large_transaction',
        severity: 'warning',
        title: 'Large transaction detected',
        message: `A transaction of ${transaction.amount} ${transaction.currency || ''} was recorded at ${transaction.merchantName || 'Unknown merchant'}.`,
        metadata: { transactionId: transaction._id, amount: transaction.amount },
        channels: { inApp: true, email: config.channels?.email },
      });
    }

    // Unusual spending (Person A sets isAnomalous = true)
    if (config.anomalyAlerts.unusualSpending && transaction.isAnomalous) {
      alerts.push({
        userId,
        type: 'anomaly_unusual_spending',
        severity: 'warning',
        title: 'Unusual spending pattern',
        message: `Unusual spending detected: ${transaction.description} for ${transaction.amount}. This is outside your typical pattern.`,
        metadata: { transactionId: transaction._id },
        channels: { inApp: true, email: config.channels?.email },
      });
    }

    if (alerts.length) await AlertEvent.insertMany(alerts);
  },

  // ─── Recurring alerts (called by scheduler) ────────────────────────────────

  async checkUpcomingRecurring(userId, recurringTransaction) {
    const config = await AlertConfig.findOne({ userId }) || DEFAULT_CONFIG;
    if (!config.recurringAlerts?.enabled) return;

    const daysUntilDue = Math.ceil(
      (new Date(recurringTransaction.nextExpectedDate) - new Date()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilDue <= (config.recurringAlerts.upcomingDays || 3) && daysUntilDue >= 0) {
      const exists = await AlertEvent.findOne({
        userId, type: 'recurring_upcoming',
        'metadata.recurringId': recurringTransaction._id,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });
      if (exists) return;

      await AlertEvent.create({
        userId,
        type: 'recurring_upcoming',
        severity: 'info',
        title: `Upcoming payment: ${recurringTransaction.merchantName}`,
        message: `Your recurring payment of ${recurringTransaction.amount} to ${recurringTransaction.merchantName} is due in ${daysUntilDue} day(s).`,
        metadata: { recurringId: recurringTransaction._id, daysUntilDue },
        channels: { inApp: true, email: config.channels?.email },
      });
    }
  },
};

module.exports = AlertService;
