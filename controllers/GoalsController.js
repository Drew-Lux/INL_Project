const GoalService = require('../services/GoalService');

const GoalsController = {
  // GET /api/goals
  async index(req, res) {
    try {
      const { status, page, limit } = req.query;
      const result = await GoalService.getUserGoals(req.user.id, { status, page, limit });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // POST /api/goals
  async create(req, res) {
    try {
      const { title, description, category, targetAmount, currency, targetDate, milestones, linkedAccountIds, autoTrack } = req.body;
      if (!title || targetAmount === undefined) {
        return res.status(400).json({ success: false, message: 'title and targetAmount are required' });
      }
      const goal = await GoalService.createGoal(req.user.id, {
        title, description, category, targetAmount, currency, targetDate, milestones, linkedAccountIds, autoTrack,
      }, req);
      res.status(201).json({ success: true, goal });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // GET /api/goals/:id
  async show(req, res) {
    try {
      const Goal = require('../models/Goal');
      const goal = await Goal.findOne({ _id: req.params.id, userId: req.user.id, deletedAt: null })
        .lean({ virtuals: true });
      if (!goal) return res.status(404).json({ success: false, message: 'Goal not found' });
      res.json({ success: true, goal });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // PATCH /api/goals/:id
  async update(req, res) {
    try {
      const Goal = require('../models/Goal');
      const AuditService = require('../services/AuditService');

      const goal = await Goal.findOne({ _id: req.params.id, userId: req.user.id, deletedAt: null });
      if (!goal) return res.status(404).json({ success: false, message: 'Goal not found' });

      const before = goal.toObject();
      const allowed = ['title','description','category','targetAmount','currency','targetDate','status','milestones','linkedAccountIds','autoTrack'];
      allowed.forEach(f => { if (req.body[f] !== undefined) goal[f] = req.body[f]; });
      await goal.save();
      await AuditService.logUpdate(req.user.id, 'Goal', goal._id, before, goal.toObject(), req);

      res.json({ success: true, goal });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // PATCH /api/goals/:id/progress
  async updateProgress(req, res) {
    try {
      const { amount } = req.body;
      if (amount === undefined) return res.status(400).json({ success: false, message: 'amount is required' });
      const goal = await GoalService.updateProgress(req.params.id, req.user.id, Number(amount), req);
      res.json({ success: true, goal });
    } catch (err) {
      const code = err.message === 'Goal not found' ? 404 : 500;
      res.status(code).json({ success: false, message: err.message });
    }
  },

  // POST /api/goals/:id/milestones
  async addMilestone(req, res) {
    try {
      const Goal = require('../models/Goal');
      const goal = await Goal.findOne({ _id: req.params.id, userId: req.user.id, deletedAt: null });
      if (!goal) return res.status(404).json({ success: false, message: 'Goal not found' });
      const { title, targetAmount, targetDate } = req.body;
      if (!title || targetAmount === undefined) {
        return res.status(400).json({ success: false, message: 'title and targetAmount required' });
      }
      goal.milestones.push({ title, targetAmount, targetDate });
      await goal.save();
      res.status(201).json({ success: true, milestones: goal.milestones });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // DELETE /api/goals/:id
  async destroy(req, res) {
    try {
      const result = await GoalService.deleteGoal(req.params.id, req.user.id, req);
      res.json({ success: true, ...result });
    } catch (err) {
      const code = err.message === 'Goal not found' ? 404 : 500;
      res.status(code).json({ success: false, message: err.message });
    }
  },
};

module.exports = GoalsController;
