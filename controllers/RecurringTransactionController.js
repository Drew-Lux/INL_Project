const Transaction           = require("../models/Transaction");
const RecurringTransaction  = require("../models/RecurringTransaction");
const AuditLog              = require("../models/AuditLog");

// ─── Detection Helpers ─────────────────────────────────────────────────────────

// Strip store numbers, reference codes, and noise from a merchant name
const normalizeDescription = (text) =>
  text
    .toLowerCase()
    .replace(/\b\d{3,}\b/g, "")                                              // remove 3+ digit numbers
    .replace(/\b(pos|eft|ibt|npo|debit order|purchase|payment|transfer)\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")                                             // keep alphanumeric + spaces
    .replace(/\s+/g, " ")
    .trim();

const mean   = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const stdDev = (arr) => {
  const avg = mean(arr);
  return Math.sqrt(arr.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / arr.length);
};

const inferFrequency = (avgDays) => {
  if (avgDays < 2)   return "DAILY";
  if (avgDays < 10)  return "WEEKLY";
  if (avgDays < 20)  return "BIWEEKLY";
  if (avgDays < 45)  return "MONTHLY";
  if (avgDays < 100) return "QUARTERLY";
  if (avgDays < 400) return "ANNUAL";
  return "IRREGULAR";
};

// confidence = 70% consistency + 30% occurrence count (capped at 10 occurrences)
const calcConfidence = (intervalStdDev, intervalMean, count) => {
  const consistency  = intervalMean > 0 ? Math.max(0, 1 - intervalStdDev / intervalMean) : 0;
  const countFactor  = Math.min(1, (count - 2) / 10);
  return Math.round((consistency * 0.7 + countFactor * 0.3) * 100) / 100;
};

// ─── Core Detection Function (exported for Scheduler) ─────────────────────────

exports.detectForUser = async (userId) => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const transactions = await Transaction.find({
    userId,
    date:     { $gte: sixMonthsAgo },
    status:   "POSTED",
    category: { $ne: "Income" }, // exclude income credits
    "amount.amount": { $lt: 0 }, // debits only
  }).sort({ date: 1 }).lean();

  // Group by normalized description
  const groups = {};
  transactions.forEach((tx) => {
    const key = normalizeDescription(tx.description.simple);
    if (!key) return;
    if (!groups[key]) groups[key] = { merchantName: tx.description.simple, txs: [] };
    groups[key].txs.push(tx);
  });

  let detected = 0;
  let updated  = 0;

  for (const [normalizedName, { merchantName, txs }] of Object.entries(groups)) {
    if (txs.length < 3) continue; // need at least 3 occurrences to call it recurring

    // Sort by date and calculate day-intervals between consecutive transactions
    const sorted    = txs.sort((a, b) => new Date(a.date) - new Date(b.date));
    const intervals = [];
    for (let i = 1; i < sorted.length; i++) {
      const days = (new Date(sorted[i].date) - new Date(sorted[i - 1].date)) / (1000 * 60 * 60 * 24);
      intervals.push(days);
    }

    const avgInterval = mean(intervals);
    const sdInterval  = stdDev(intervals);

    // Only qualify as recurring if the coefficient of variation is < 30%
    if (avgInterval > 0 && sdInterval / avgInterval >= 0.3) continue;

    const amounts     = txs.map((tx) => Math.abs(tx.amount.amount));
    const lastTx      = sorted[sorted.length - 1];
    const nextDate    = new Date(lastTx.date);
    nextDate.setDate(nextDate.getDate() + Math.round(avgInterval));

    const confidence  = calcConfidence(sdInterval, avgInterval, txs.length);
    const frequency   = inferFrequency(avgInterval);

    try {
      await RecurringTransaction.findOneAndUpdate(
        { userId, normalizedName },
        {
          merchantName,
          normalizedName,
          amount: {
            min:      Math.round(Math.min(...amounts)),
            max:      Math.round(Math.max(...amounts)),
            mean:     Math.round(mean(amounts)),
            currency: txs[0].amount.currency || "ZAR",
          },
          category:         lastTx.category,
          frequency,
          intervalDays:     Math.round(avgInterval),
          intervalStdDev:   Math.round(sdInterval * 10) / 10,
          nextExpectedDate: nextDate,
          lastSeenDate:     lastTx.date,
          occurrenceCount:  txs.length,
          confidence,
          transactionIds:   txs.map((tx) => tx._id),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      await AuditLog.create({
        userId,
        entityType:    "RecurringTransaction",
        entityId:      lastTx._id,
        action:        "RECURRING_DETECTED",
        previousValue: null,
        newValue:      { merchantName, frequency, confidence },
        source:        "SYSTEM",
      });

      detected++;
    } catch (err) {
      // Unique index conflict on update is fine — means it already exists
      if (err.code !== 11000) throw err;
      updated++;
    }
  }

  return { detected, updated, totalGroups: Object.keys(groups).length };
};

// ─── HTTP Handlers ─────────────────────────────────────────────────────────────

exports.getRecurring = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    const filter = { userId };
    if (status) filter.status = status.toUpperCase();

    const recurring = await RecurringTransaction.find(filter)
      .sort({ confidence: -1 })
      .lean();

    return res.status(200).json({ recurring, count: recurring.length });
  } catch (err) {
    console.error("[RecurringTransactionController.getRecurring]", err);
    return res.status(500).json({ error: "Could not fetch recurring transactions." });
  }
};

exports.runDetection = async (req, res) => {
  try {
    const result = await exports.detectForUser(req.user.id);
    return res.status(200).json({ message: "Detection complete.", ...result });
  } catch (err) {
    console.error("[RecurringTransactionController.runDetection]", err);
    return res.status(500).json({ error: "Detection failed." });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { id }     = req.params;
    const { status } = req.body;
    const userId     = req.user.id;

    if (!["CONFIRMED", "DISMISSED"].includes(status?.toUpperCase())) {
      return res.status(400).json({ error: "status must be CONFIRMED or DISMISSED." });
    }

    const recurring = await RecurringTransaction.findOneAndUpdate(
      { _id: id, userId },
      { status: status.toUpperCase() },
      { new: true }
    );

    if (!recurring) return res.status(404).json({ error: "Recurring transaction not found." });

    await AuditLog.create({
      userId,
      entityType:    "RecurringTransaction",
      entityId:      recurring._id,
      action:        status.toUpperCase() === "CONFIRMED" ? "RECURRING_CONFIRMED" : "RECURRING_DISMISSED",
      previousValue: "DETECTED",
      newValue:      status.toUpperCase(),
      source:        "USER",
    });

    return res.status(200).json({ message: `Marked as ${status}.`, recurring });
  } catch (err) {
    console.error("[RecurringTransactionController.updateStatus]", err);
    return res.status(500).json({ error: "Could not update status." });
  }
};

exports.getForecast = async (req, res) => {
  try {
    const { id }  = req.params;
    const userId  = req.user.id;
    const periods = Math.min(parseInt(req.query.periods) || 6, 24);

    const recurring = await RecurringTransaction.findOne({ _id: id, userId }).lean();
    if (!recurring) return res.status(404).json({ error: "Recurring transaction not found." });

    const forecast = [];
    for (let i = 1; i <= periods; i++) {
      const date = new Date(recurring.lastSeenDate);
      date.setDate(date.getDate() + recurring.intervalDays * i);
      forecast.push({
        period:          i,
        expectedDate:    date,
        expectedAmount:  recurring.amount.mean,
        currency:        recurring.amount.currency,
      });
    }

    return res.status(200).json({
      recurring,
      forecast,
      totalForecast: forecast.reduce((s, f) => s + f.expectedAmount, 0),
    });
  } catch (err) {
    console.error("[RecurringTransactionController.getForecast]", err);
    return res.status(500).json({ error: "Could not generate forecast." });
  }
};
