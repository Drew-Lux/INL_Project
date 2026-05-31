/**
 * Job: checkBudgetThresholds
 * Runs hourly. Scans all users' budget categories against MTD spending
 * and fires warning/exceeded alerts via AlertService.
 */
const BudgetCategory = require('../models/BudgetCategory');
const Transaction    = require('../models/Transaction');
const AlertService   = require('../services/AlertService');

module.exports = async function checkBudgetThresholds() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);

  const budgets = await BudgetCategory.find({}).lean();
  const userIds = [...new Set(budgets.map(b => b.userId.toString()))];

  for (const userId of userIds) {
    const userBudgets = budgets.filter(b => b.userId.toString() === userId);

    const txs = await Transaction.find({
      userId,
      date:      { $gte: start },
      amount:    { $lt: 0 },
      deletedAt: null,
    }).lean();

    const actualByCategory = {};
    for (const tx of txs) {
      const cat = tx.category || 'Uncategorized';
      actualByCategory[cat] = (actualByCategory[cat] || 0) + Math.abs(tx.amount);
    }

    for (const b of userBudgets) {
      const actual = actualByCategory[b.name] || 0;
      await AlertService.checkBudgetThresholds(
        userId, b._id, b.name, actual, b.budgetedAmount
      );
    }
  }

  console.log(`[Job:checkBudgetThresholds] Processed ${userIds.length} users`);
};
