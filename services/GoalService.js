const Goal = require('../models/Goal');
const { AlertEvent, AlertConfig } = require('../models/Alert');
const AuditService = require('./AuditService');

const GoalService = {
  /**
   * Create a new goal for a user.
   */
  async createGoal(userId, data, req = {}) {
    const goal = await Goal.create({ userId, ...data });
    await AuditService.logCreate(userId, 'Goal', goal._id, goal.toObject(), req);
    return goal;
  },

  /**
   * Get all active goals for a user (excluding soft-deleted).
   */
  async getUserGoals(userId, { status, page = 1, limit = 20 } = {}) {
    const query = { userId, deletedAt: null };
    if (status) query.status = status;

    const [goals, total] = await Promise.all([
      Goal.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean({ virtuals: true }),
      Goal.countDocuments(query),
    ]);
    return { goals, total, page, pages: Math.ceil(total / limit) };
  },

  /**
   * Update goal progress (currentAmount).
   * Checks for milestone completions and fires alerts.
   */
  async updateProgress(goalId, userId, newAmount, req = {}) {
    const goal = await Goal.findOne({ _id: goalId, userId, deletedAt: null });
    if (!goal) throw new Error('Goal not found');

    const before = goal.toObject();
    const prevAmount = goal.currentAmount;
    goal.currentAmount = newAmount;

    // Check milestones
    const newlyReached = [];
    for (const m of goal.milestones) {
      if (!m.reached && newAmount >= m.targetAmount) {
        m.reached   = true;
        m.reachedAt = new Date();
        newlyReached.push(m);
      }
    }

    // Check goal completion
    if (!['completed', 'cancelled'].includes(goal.status) && newAmount >= goal.targetAmount) {
      goal.status      = 'completed';
      goal.completedAt = new Date();
    }

    await goal.save();
    await AuditService.logUpdate(userId, 'Goal', goal._id, before, goal.toObject(), req);

    // Fire in-app alerts
    const alertConfig = await AlertConfig.findOne({ userId });
    if (alertConfig?.goalAlerts?.enabled) {
      for (const m of newlyReached) {
        if (alertConfig.goalAlerts.milestoneReached) {
          await AlertEvent.create({
            userId,
            type: 'goal_milestone',
            severity: 'info',
            title: `Milestone reached: ${m.title}`,
            message: `You've reached the "${m.title}" milestone for "${goal.title}"! Keep going!`,
            metadata: { goalId: goal._id, milestoneId: m._id },
            channels: { inApp: true, email: alertConfig.channels.email },
          });
        }
      }
      if (goal.status === 'completed' && alertConfig.goalAlerts.goalCompleted) {
        await AlertEvent.create({
          userId,
          type: 'goal_completed',
          severity: 'info',
          title: `Goal completed: ${goal.title}!`,
          message: `Congratulations! You've achieved your "${goal.title}" goal of ${goal.targetAmount} ${goal.currency}.`,
          metadata: { goalId: goal._id },
          channels: { inApp: true, email: alertConfig.channels.email },
        });
      }
    }

    return goal;
  },

  /**
   * Soft-delete a goal.
   */
  async deleteGoal(goalId, userId, req = {}) {
    const goal = await Goal.findOne({ _id: goalId, userId, deletedAt: null });
    if (!goal) throw new Error('Goal not found');

    const before = goal.toObject();
    goal.deletedAt = new Date();
    await goal.save();
    await AuditService.logDelete(userId, 'Goal', goal._id, before, req);
    return { message: 'Goal deleted' };
  },

  /**
   * Check goals at risk (target date approaching, progress too slow).
   * Called by the scheduler.
   */
  async checkGoalsAtRisk() {
    const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const atRiskGoals = await Goal.find({
      status: 'active',
      deletedAt: null,
      targetDate: { $lte: thirtyDaysOut, $gte: new Date() },
    }).lean({ virtuals: true });

    for (const goal of atRiskGoals) {
      if (goal.progressPercent < 80) {
        const config = await AlertConfig.findOne({ userId: goal.userId });
        if (config?.goalAlerts?.goalAtRisk) {
          const existing = await AlertEvent.findOne({
            userId: goal.userId,
            type: 'goal_at_risk',
            'metadata.goalId': goal._id,
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          });
          if (!existing) {
            await AlertEvent.create({
              userId: goal.userId,
              type: 'goal_at_risk',
              severity: 'warning',
              title: `Goal at risk: ${goal.title}`,
              message: `Your goal "${goal.title}" is ${goal.progressPercent}% complete but due in ${goal.daysRemaining} days.`,
              metadata: { goalId: goal._id },
              channels: { inApp: true, email: config.channels.email },
            });
          }
        }
      }
    }
  },
};

module.exports = GoalService;
