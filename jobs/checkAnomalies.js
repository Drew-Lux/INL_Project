/**
 * Job: checkAnomalies
 * Runs hourly. Picks up transactions Person A has flagged as isAnomalous
 * in the last 2 hours and dispatches alerts for each user.
 */
const Transaction  = require('../models/Transaction');
const AlertService = require('../services/AlertService');

module.exports = async function checkAnomalies() {
  // 2-hour window to ensure no misses between runs
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const anomalous = await Transaction.find({
    isAnomalous: true,
    updatedAt:   { $gte: since },
    deletedAt:   null,
  }).lean();

  for (const tx of anomalous) {
    await AlertService.checkTransactionAnomaly(tx.userId, tx);
  }

  console.log(`[Job:checkAnomalies] Processed ${anomalous.length} flagged transactions`);
};
