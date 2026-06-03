const cron          = require("node-cron");
const mongoose      = require("mongoose");
const User          = require("../models/User");
const Transaction   = require("../models/Transaction");
const AuditLog      = require("../models/AuditLog");
const ScheduledTask = require("../models/ScheduledTask");



// Lazy-require to avoid circular dependency at module load time
const getCategory  = () => require("./CategoryController");
const getRecurring = () => require("./RecurringTransactionController");

// ─── Per-user Job Runners ─────────────────────────────────────────────────────

const runForAllUsers = async (jobFn, label) => {
  const users = await User.find({ isActive: true }).select("_id").lean();
  let success = 0;
  let failed  = 0;

  for (const user of users) {
    try {
      await jobFn(user._id);
      success++;
    } catch (err) {
      console.error(`[Scheduler][${label}] Failed for user ${user._id}:`, err.message);
      failed++;
    }
  }

  return { total: users.length, success, failed };
};

// ─── Anomaly Flagging (runs after categorization is up to date) ───────────────

const flagAnomaliesForUser = async (userId) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const allTx = await Transaction.find({
    userId,
    date:            { $gte: thirtyDaysAgo },
    status:          "POSTED",
    "amount.amount": { $lt: 0 },
  }).lean();

  if (allTx.length < 5) return { flagged: 0 };

  // Build per-category stats
  const byCategory = {};
  allTx.forEach((tx) => {
    const cat = tx.category || "Uncategorized";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(Math.abs(tx.amount.amount));
  });

  const stats = {};
  Object.entries(byCategory).forEach(([cat, amounts]) => {
    if (amounts.length < 3) return;
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const sd  = Math.sqrt(amounts.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / amounts.length);
    stats[cat] = { mean: avg, stdDev: sd };
  });

  // Flag in the last 48h (to avoid re-processing the whole history every run)
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  const recentTx = allTx.filter((tx) => new Date(tx.date) >= twoDaysAgo);
  const auditEntries = [];
  let flagged = 0;

  for (const tx of recentTx) {
    const cat = tx.category || "Uncategorized";
    if (!stats[cat] || stats[cat].stdDev === 0) continue;
    const { mean: m, stdDev: sd } = stats[cat];
    const zScore = Math.abs((Math.abs(tx.amount.amount) - m) / sd);
    if (zScore <= 2) continue;

    await Transaction.findByIdAndUpdate(tx._id, { isAnomalous: true });
    auditEntries.push({
      userId,
      entityType:    "Transaction",
      entityId:      tx._id,
      action:        "ANOMALY_FLAGGED",
      previousValue: false,
      newValue:      { zScore: Math.round(zScore * 100) / 100 },
      source:        "SCHEDULER",
    });
    flagged++;
  }

  if (auditEntries.length) await AuditLog.insertMany(auditEntries);
  return { flagged };
};

// ─── Task Wrapper — tracks status in MongoDB ──────────────────────────────────

const runTask = async (name, fn) => {
  const start = Date.now();

  await ScheduledTask.findOneAndUpdate(
    { name },
    { lastRunStatus: "RUNNING", lastRunAt: new Date() },
  );

  try {
    const result  = await fn();
    const message = JSON.stringify(result);

    await ScheduledTask.findOneAndUpdate(
      { name },
      {
        lastRunStatus:   "SUCCESS",
        lastRunDuration: Date.now() - start,
        lastRunMessage:  message,
        $inc: { runCount: 1 },
      },
    );

    console.log(`[Scheduler][${name}] SUCCESS in ${Date.now() - start}ms — ${message}`);
  } catch (err) {
    await ScheduledTask.findOneAndUpdate(
      { name },
      {
        lastRunStatus:   "FAILED",
        lastRunDuration: Date.now() - start,
        lastRunMessage:  err.message,
        $inc: { runCount: 1, errorCount: 1 },
      },
    );
    console.error(`[Scheduler][${name}] FAILED:`, err.message);
  }
};

// ─── Task Definitions ─────────────────────────────────────────────────────────

const TASK_DEFINITIONS = [
  {
    name:           "categorize-transactions",
    description:    "ML-powered batch categorization of uncategorized transactions for all users",
    cronExpression: "0 2 * * *", // 2am daily
    handler: () =>
      runForAllUsers((uid) => getCategory().batchCategorizeForUser(uid), "categorize-transactions"),
  },
  {
    name:           "detect-recurring",
    description:    "Detect and update recurring transaction patterns for all users",
    cronExpression: "0 3 * * *", // 3am daily
    handler: () =>
      runForAllUsers((uid) => getRecurring().detectForUser(uid), "detect-recurring"),
  },
  {
    name:           "flag-anomalies",
    description:    "Flag statistically anomalous transactions in the last 48 hours",
    cronExpression: "0 4 * * *", // 4am daily
    handler: () =>
      runForAllUsers(flagAnomaliesForUser, "flag-anomalies"),
  },
];

// ─── init() — called once after MongoDB connects ──────────────────────────────

const activeJobs = {};

exports.initScheduler = async () => {
  // Upsert task definitions into DB (so the API can list them)
  for (const def of TASK_DEFINITIONS) {
    await ScheduledTask.findOneAndUpdate(
      { name: def.name },
      { description: def.description, cronExpression: def.cronExpression },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }

  // Register cron jobs
  for (const def of TASK_DEFINITIONS) {
    activeJobs[def.name] = cron.schedule(def.cronExpression, () => runTask(def.name, def.handler));
  }

  console.log(`[Scheduler] ${TASK_DEFINITIONS.length} jobs registered.`);
};

// ─── HTTP Handlers ─────────────────────────────────────────────────────────────

exports.getTasks = async (req, res) => {
  try {
    const tasks = await ScheduledTask.find().lean();
    return res.status(200).json({ tasks });
  } catch (err) {
    console.error("[SchedulerController.getTasks]", err);
    return res.status(500).json({ error: "Could not fetch tasks." });
  }
};

exports.triggerTask = async (req, res) => {
  try {
    const { name } = req.params;
    const def = TASK_DEFINITIONS.find((d) => d.name === name);

    if (!def) {
      return res.status(404).json({
        error:          `Task '${name}' not found.`,
        availableTasks: TASK_DEFINITIONS.map((d) => d.name),
      });
    }

    // Run asynchronously so the HTTP response returns immediately
    runTask(name, def.handler).catch((err) =>
      console.error(`[Scheduler.triggerTask][${name}]`, err)
    );

    return res.status(202).json({ message: `Task '${name}' triggered.` });
  } catch (err) {
    console.error("[SchedulerController.triggerTask]", err);
    return res.status(500).json({ error: "Could not trigger task." });
  }
};
