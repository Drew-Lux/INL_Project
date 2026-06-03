const Anthropic  = require("@anthropic-ai/sdk");
const Transaction = require("../models/Transaction");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Shared Helpers ───────────────────────────────────────────────────────────

const getDateRange = (months) => {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  return since;
};

const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const stdDev = (arr) => {
  const avg = mean(arr);
  return Math.sqrt(arr.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / arr.length);
};

// ─── GET /api/insights/trends ─────────────────────────────────────────────────

exports.getTrends = async (req, res) => {
  try {
    const userId = req.user.id;
    const months = Math.min(parseInt(req.query.months) || 3, 12);
    const since  = getDateRange(months);

    const transactions = await Transaction.find({
      userId,
      date:            { $gte: since },
      status:          "POSTED",
      "amount.amount": { $lt: 0 },
    }).lean();

    // Month-by-month category breakdown
    const monthly = {};
    transactions.forEach((tx) => {
      const d   = new Date(tx.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthly[key]) monthly[key] = { total: 0, categories: {} };
      const cat = tx.category || "Uncategorized";
      monthly[key].categories[cat] = (monthly[key].categories[cat] || 0) + Math.abs(tx.amount.amount);
      monthly[key].total += Math.abs(tx.amount.amount);
    });

    // Round all totals
    Object.values(monthly).forEach((m) => {
      m.total = Math.round(m.total);
      Object.keys(m.categories).forEach((c) => {
        m.categories[c] = Math.round(m.categories[c]);
      });
    });

    // Aggregate category totals across all months
    const categoryTotals = {};
    Object.values(monthly).forEach((m) => {
      Object.entries(m.categories).forEach(([cat, amt]) => {
        categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
      });
    });

    const topCategories = Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([category, total]) => ({ category, total }));

    // Month-over-month change (last two months)
    const monthKeys = Object.keys(monthly).sort();
    let monthOverMonth = null;
    if (monthKeys.length >= 2) {
      const prev = monthly[monthKeys[monthKeys.length - 2]]?.total || 0;
      const curr = monthly[monthKeys[monthKeys.length - 1]]?.total || 0;
      monthOverMonth = prev > 0 ? Math.round(((curr - prev) / prev) * 100) / 100 : null;
    }

    return res.status(200).json({ monthly, topCategories, monthOverMonth, months });
  } catch (err) {
    console.error("[InsightsController.getTrends]", err);
    return res.status(500).json({ error: "Could not fetch spending trends." });
  }
};

// ─── GET /api/insights/patterns ───────────────────────────────────────────────

exports.getPatterns = async (req, res) => {
  try {
    const userId = req.user.id;
    const months = Math.min(parseInt(req.query.months) || 3, 12);
    const since  = getDateRange(months);

    const transactions = await Transaction.find({
      userId,
      date:            { $gte: since },
      status:          "POSTED",
      "amount.amount": { $lt: 0 },
    }).lean();

    const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const byDayOfWeek  = Object.fromEntries(DAY_NAMES.map((d) => [d, { count: 0, total: 0 }]));
    const byWeekOfMonth = { 1: { count: 0, total: 0 }, 2: { count: 0, total: 0 }, 3: { count: 0, total: 0 }, 4: { count: 0, total: 0 } };
    const byHourOfDay   = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i, { count: 0, total: 0 }]));

    transactions.forEach((tx) => {
      const d    = new Date(tx.date);
      const amt  = Math.abs(tx.amount.amount);
      const day  = DAY_NAMES[d.getDay()];
      const week = Math.min(4, Math.ceil(d.getDate() / 7));
      const hour = d.getHours();

      byDayOfWeek[day].count++;
      byDayOfWeek[day].total += amt;
      byWeekOfMonth[week].count++;
      byWeekOfMonth[week].total += amt;
      byHourOfDay[hour].count++;
      byHourOfDay[hour].total += amt;
    });

    // Round totals
    [byDayOfWeek, byWeekOfMonth, byHourOfDay].forEach((obj) =>
      Object.values(obj).forEach((v) => { v.total = Math.round(v.total); })
    );

    const peakDay  = DAY_NAMES.reduce((peak, d) => byDayOfWeek[d].total > byDayOfWeek[peak].total ? d : peak, "Sunday");
    const peakWeek = Object.keys(byWeekOfMonth).reduce((pk, w) => byWeekOfMonth[w].total > byWeekOfMonth[pk].total ? w : pk, "1");

    return res.status(200).json({ byDayOfWeek, byWeekOfMonth, byHourOfDay, peakDay, peakWeek: parseInt(peakWeek) });
  } catch (err) {
    console.error("[InsightsController.getPatterns]", err);
    return res.status(500).json({ error: "Could not fetch spending patterns." });
  }
};

// ─── GET /api/insights/anomalies ──────────────────────────────────────────────

exports.getAnomalies = async (req, res) => {
  try {
    const userId = req.user.id;
    const months = Math.min(parseInt(req.query.months) || 3, 6);
    const since  = getDateRange(months);

    const transactions = await Transaction.find({
      userId,
      date:            { $gte: since },
      status:          "POSTED",
      "amount.amount": { $lt: 0 },
    }).lean();

    // Per-category statistical baseline
    const byCategory = {};
    transactions.forEach((tx) => {
      const cat = tx.category || "Uncategorized";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(Math.abs(tx.amount.amount));
    });

    const stats = {};
    Object.entries(byCategory).forEach(([cat, amounts]) => {
      if (amounts.length < 3) return;
      stats[cat] = { mean: mean(amounts), stdDev: stdDev(amounts) };
    });

    const anomalies = transactions
      .filter((tx) => {
        const cat = tx.category || "Uncategorized";
        if (!stats[cat] || stats[cat].stdDev === 0) return false;
        const { mean: m, stdDev: sd } = stats[cat];
        return Math.abs((Math.abs(tx.amount.amount) - m) / sd) > 2;
      })
      .map((tx) => {
        const cat = tx.category || "Uncategorized";
        const { mean: m, stdDev: sd } = stats[cat];
        const zScore = Math.abs((Math.abs(tx.amount.amount) - m) / sd);
        return {
          transaction: {
            id:       tx._id,
            merchant: tx.description.simple,
            amount:   tx.amount.amount,
            category: tx.category,
            date:     tx.date,
          },
          anomalyScore:  Math.round(zScore * 100) / 100,
          categoryMean:  Math.round(m),
          categorySd:    Math.round(sd),
        };
      })
      .sort((a, b) => b.anomalyScore - a.anomalyScore);

    return res.status(200).json({ anomalies, count: anomalies.length });
  } catch (err) {
    console.error("[InsightsController.getAnomalies]", err);
    return res.status(500).json({ error: "Could not fetch anomalies." });
  }
};

// ─── GET /api/insights/recommendations ───────────────────────────────────────

const RECOMMENDATIONS_PROMPT = `You are a financial advisor for South African users.
Given 3-month spending trends, provide 3–5 actionable recommendations.
Return ONLY a JSON array (no markdown):
[{ "type": "warning"|"opportunity"|"info", "title": "5 words max", "body": "40 words max", "priority": 1|2|3 }]
Focus on: reducing unnecessary spending, improving savings rate, emergency fund.`;

exports.getRecommendations = async (req, res) => {
  try {
    const userId = req.user.id;
    const since  = getDateRange(3);

    const transactions = await Transaction.find({
      userId,
      date:   { $gte: since },
      status: "POSTED",
    }).lean();

    // Build compact summary to pass to Claude
    const monthly = {};
    transactions.forEach((tx) => {
      const d   = new Date(tx.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthly[key]) monthly[key] = { income: 0, spending: 0, categories: {} };

      const amt = tx.amount.amount;
      if (amt > 0) {
        monthly[key].income += amt;
      } else {
        monthly[key].spending += Math.abs(amt);
        const cat = tx.category || "Uncategorized";
        monthly[key].categories[cat] = (monthly[key].categories[cat] || 0) + Math.abs(amt);
      }
    });

    Object.values(monthly).forEach((m) => {
      m.income   = Math.round(m.income);
      m.spending = Math.round(m.spending);
      Object.keys(m.categories).forEach((c) => { m.categories[c] = Math.round(m.categories[c]); });
    });

    // Static fallback recommendations
    const fallback = [
      { type: "opportunity", title: "Automate savings transfer", body: "Set up a recurring debit order the day after salary credit to lock in savings before discretionary spending begins.", priority: 1 },
      { type: "info",        title: "Review subscription spend", body: "Audit recurring subscriptions monthly — cancel any unused services to free up cashflow.", priority: 2 },
      { type: "warning",     title: "Build emergency fund first", body: "Aim for 3 months of expenses in a high-yield savings account before investing further.", priority: 3 },
    ];

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(200).json({ recommendations: fallback });
    }

    let recommendations;
    try {
      const response = await anthropic.messages.create({
        model:      "claude-sonnet-4-20250514",
        max_tokens: 768,
        system: [
          { type: "text", text: RECOMMENDATIONS_PROMPT, cache_control: { type: "ephemeral" } },
        ],
        messages: [
          { role: "user", content: `3-month spending data (ZAR):\n${JSON.stringify(monthly, null, 2)}` },
        ],
      });

      const raw = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
      recommendations = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      recommendations = fallback;
    }

    return res.status(200).json({ recommendations });
  } catch (err) {
    console.error("[InsightsController.getRecommendations]", err);
    return res.status(500).json({ error: "Could not generate recommendations." });
  }
};
