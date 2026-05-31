const AlertService = require('../services/AlertService');

/**
 * Budget Variance Controller
 * Consumes Person A's categorised transactions + existing BudgetCategory model
 * to produce variance analysis and fire budget alerts.
 */
const BudgetVarianceController = {
  /**
   * GET /api/budgets/variance
   * Returns budget vs actual for current (or specified) month.
   */
  async index(req, res) {
    try {
      const Transaction    = require('../models/Transaction');
      const BudgetCategory = require('../models/BudgetCategory');

      const userId = req.user.id;
      const now    = new Date();
      const year   = Number(req.query.year)  || now.getFullYear();
      const month  = Number(req.query.month) || now.getMonth() + 1; // 1-based

      const startDate = new Date(year, month - 1, 1);
      const endDate   = new Date(year, month, 0, 23, 59, 59); // last day of month

      const [transactions, budgets] = await Promise.all([
        Transaction.find({
          userId,
          date:      { $gte: startDate, $lte: endDate },
          amount:    { $lt: 0 },    // expenses only
          deletedAt: null,
        }).lean(),
        BudgetCategory.find({ userId }).lean(),
      ]);

      // Sum actual spending per category (uses Person A's clean category field)
      const actualByCategory = {};
      for (const tx of transactions) {
        const cat = tx.category || 'Uncategorized';
        actualByCategory[cat] = (actualByCategory[cat] || 0) + Math.abs(tx.amount);
      }

      // Build variance rows
      const rows = budgets.map(b => {
        const actual    = actualByCategory[b.name] || 0;
        const budget    = b.budgetedAmount || 0;
        const variance  = budget - actual;          // positive = under budget
        const pctUsed   = budget > 0 ? (actual / budget) * 100 : null;
        const status    =
          pctUsed === null  ? 'no_budget' :
          pctUsed >= 100    ? 'exceeded'  :
          pctUsed >= 80     ? 'warning'   : 'on_track';

        return {
          category:        b.name,
          budgetCategoryId:b._id,
          budgeted:        budget,
          actual:          Math.round(actual * 100) / 100,
          variance:        Math.round(variance * 100) / 100,
          percentUsed:     pctUsed !== null ? Math.round(pctUsed * 10) / 10 : null,
          status,
          recommendation:  _recommend(b.name, budget, actual, pctUsed),
        };
      });

      // Categories with spending but no budget rule
      const knownCats = new Set(budgets.map(b => b.name));
      for (const [cat, actual] of Object.entries(actualByCategory)) {
        if (!knownCats.has(cat)) {
          rows.push({
            category: cat, budgetCategoryId: null,
            budgeted: 0, actual, variance: -actual,
            percentUsed: null, status: 'no_budget',
            recommendation: `No budget set for "${cat}". Consider adding one.`,
          });
        }
      }

      // Totals
      const totalBudgeted = rows.reduce((s, r) => s + (r.budgeted || 0), 0);
      const totalActual   = rows.reduce((s, r) => s + r.actual, 0);

      // Fire budget threshold alerts asynchronously
      for (const r of rows) {
        if (r.budgetCategoryId && r.budgeted > 0) {
          AlertService.checkBudgetThresholds(
            userId, r.budgetCategoryId, r.category, r.actual, r.budgeted
          ).catch(console.error);
        }
      }

      res.json({
        success: true,
        period: { year, month, startDate, endDate },
        summary: {
          totalBudgeted: Math.round(totalBudgeted * 100) / 100,
          totalActual:   Math.round(totalActual   * 100) / 100,
          totalVariance: Math.round((totalBudgeted - totalActual) * 100) / 100,
          overallStatus: rows.some(r => r.status === 'exceeded') ? 'exceeded'
                       : rows.some(r => r.status === 'warning')  ? 'warning'
                       : 'on_track',
        },
        categories: rows.sort((a, b) => (b.percentUsed || 0) - (a.percentUsed || 0)),
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * GET /api/budgets/variance/trend
   * Returns month-by-month variance for last N months.
   */
  async trend(req, res) {
    try {
      const Transaction    = require('../models/Transaction');
      const BudgetCategory = require('../models/BudgetCategory');

      const userId = req.user.id;
      const months = Math.min(Number(req.query.months) || 6, 12);
      const category = req.query.category; // optional filter

      const budgets = await BudgetCategory.find({ userId }).lean();
      const budgetMap = Object.fromEntries(budgets.map(b => [b.name, b.budgetedAmount || 0]));

      const result = [];
      const now = new Date();
      for (let i = months - 1; i >= 0; i--) {
        const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

        const txQuery = { userId, date: { $gte: start, $lte: end }, amount: { $lt: 0 }, deletedAt: null };
        if (category) txQuery.category = category;

        const txs = await Transaction.find(txQuery).lean();
        const totalActual = txs.reduce((s, t) => s + Math.abs(t.amount), 0);
        const totalBudget = category
          ? (budgetMap[category] || 0)
          : Object.values(budgetMap).reduce((s, v) => s + v, 0);

        result.push({
          month: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
          budgeted: totalBudget,
          actual:   Math.round(totalActual * 100) / 100,
          variance: Math.round((totalBudget - totalActual) * 100) / 100,
        });
      }

      res.json({ success: true, trend: result });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

// ─── Private helper ──────────────────────────────────────────────────────────

function _recommend(category, budget, actual, pctUsed) {
  if (pctUsed === null)  return null;
  if (pctUsed >= 100) return `You've exceeded your ${category} budget by ${(actual - budget).toFixed(2)}. Review recent transactions or increase the budget.`;
  if (pctUsed >= 80)  return `You're at ${pctUsed.toFixed(0)}% of your ${category} budget with time remaining. Slow down spending in this category.`;
  if (pctUsed < 50 && budget > 0) return `Great job! You've only used ${pctUsed.toFixed(0)}% of your ${category} budget.`;
  return null;
}

module.exports = BudgetVarianceController;
