const Anthropic = require("@anthropic-ai/sdk");
const Transaction  = require("../models/Transaction");
const AuditLog     = require("../models/AuditLog");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Category Registry ─────────────────────────────────────────────────────────

const CATEGORIES = [
  "Housing & Utilities",
  "Food & Dining",
  "Transport",
  "Subscriptions",
  "Income",
  "Healthcare",
  "Shopping",
  "Entertainment",
  "Education",
  "Travel",
  "Personal Care",
  "Financial Services",
  "Insurance",
  "Uncategorized",
];

const CATEGORY_SET = new Set(CATEGORIES);

// Regex fallback — used when Claude is unavailable or returns an invalid category
const RULES = [
  { pattern: /rent|landlord|property|rates/i,                         category: "Housing & Utilities" },
  { pattern: /electricity|water|eskom|municipal|telkom|fibre/i,       category: "Housing & Utilities" },
  { pattern: /woolworths food|checkers|pick n pay|spar|grocery/i,     category: "Food & Dining" },
  { pattern: /uber eats|mr d|nandos|kfc|mcdonalds|restaurant|cafe/i,  category: "Food & Dining" },
  { pattern: /uber(?! eats)|bolt|fuel|petrol|engen|shell|bp|caltex/i, category: "Transport" },
  { pattern: /netflix|spotify|dstv|showmax|apple tv|subscription/i,   category: "Subscriptions" },
  { pattern: /salary|payroll|income|deposit from/i,                   category: "Income" },
  { pattern: /medical|clicks|dischem|pharmacy|doctor|dentist/i,       category: "Healthcare" },
  { pattern: /gym|planet fitness|virgin active|bodytech/i,            category: "Personal Care" },
  { pattern: /school|university|tuition|college/i,                    category: "Education" },
  { pattern: /hotel|airbnb|flight|kulula|safair|booking\.com/i,       category: "Travel" },
  { pattern: /insurance|assurance|discovery life|momentum/i,          category: "Insurance" },
  { pattern: /bank fee|service fee|monthly fee|interest|loan/i,       category: "Financial Services" },
  { pattern: /woolworths(?! food)|mr price|h&m|zara|edgars|truworths/i, category: "Shopping" },
  { pattern: /cinema|movies|computicket|theatre/i,                    category: "Entertainment" },
];

const regexCategory = (merchant) => {
  for (const rule of RULES) {
    if (rule.pattern.test(merchant)) return rule.category;
  }
  return "Uncategorized";
};

// ─── Claude API ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You categorize South African bank transactions.
Valid categories: ${CATEGORIES.join(", ")}.
Return ONLY a JSON object mapping the "id" field to a category string.
Example: {"abc123": "Food & Dining", "def456": "Transport"}`;

// items: [{ id: string, merchant: string, amount: number }]
const callClaude = async (items) => {
  const response = await anthropic.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 768,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      { role: "user", content: `Categorize:\n${JSON.stringify(items)}` },
    ],
  });

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return JSON.parse(raw.replace(/```json|```/g, "").trim());
};

// ─── Core Exported Function (used by SchedulerController) ─────────────────────

exports.batchCategorizeForUser = async (userId) => {
  const transactions = await Transaction.find({
    userId,
    category:         "Uncategorized",
    categoryIsManual: false,
    status:           "POSTED",
  }).lean();

  if (!transactions.length) return { processed: 0, updated: 0, errors: 0 };

  const BATCH_SIZE = 25;
  let updated = 0;
  let errors  = 0;
  const useClaude = !!process.env.ANTHROPIC_API_KEY;

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    const items = batch.map((tx) => ({
      id:       tx._id.toString(),
      merchant: tx.description.simple,
      amount:   tx.amount.amount,
    }));

    let mapping = {};

    if (useClaude) {
      try {
        mapping = await callClaude(items);
      } catch (err) {
        console.error("[CategoryController] Claude batch failed, falling back to regex:", err.message);
        items.forEach((it) => { mapping[it.id] = regexCategory(it.merchant); });
        errors++;
      }
    } else {
      items.forEach((it) => { mapping[it.id] = regexCategory(it.merchant); });
    }

    const auditEntries = [];

    for (const tx of batch) {
      const raw      = mapping[tx._id.toString()];
      const category = CATEGORY_SET.has(raw) ? raw : regexCategory(tx.description.simple);
      if (category === "Uncategorized") continue;

      await Transaction.findByIdAndUpdate(tx._id, { category });

      auditEntries.push({
        userId,
        entityType:    "Transaction",
        entityId:      tx._id,
        action:        useClaude ? "CATEGORY_ML_ASSIGNED" : "CATEGORY_AUTO_ASSIGNED",
        previousValue: "Uncategorized",
        newValue:      category,
        source:        useClaude ? "ML" : "SYSTEM",
      });

      updated++;
    }

    if (auditEntries.length) await AuditLog.insertMany(auditEntries);
  }

  return { processed: transactions.length, updated, errors };
};

// ─── HTTP Handlers ─────────────────────────────────────────────────────────────

exports.categorizeOne = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const tx = await Transaction.findOne({ _id: id, userId });
    if (!tx) return res.status(404).json({ error: "Transaction not found." });

    if (tx.categoryIsManual) {
      return res.status(400).json({
        error: "This transaction was manually categorized. Use PATCH /api/transactions/:id/category to change it.",
      });
    }

    let category = regexCategory(tx.description.simple);

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const mapping = await callClaude([{
          id:       tx._id.toString(),
          merchant: tx.description.simple,
          amount:   tx.amount.amount,
        }]);
        const raw = mapping[tx._id.toString()];
        if (CATEGORY_SET.has(raw)) category = raw;
      } catch (err) {
        console.error("[CategoryController.categorizeOne] Claude failed:", err.message);
      }
    }

    const previousCategory = tx.category;
    tx.category = category;
    await tx.save();

    await AuditLog.create({
      userId,
      entityType:    "Transaction",
      entityId:      tx._id,
      action:        "CATEGORY_ML_ASSIGNED",
      previousValue: previousCategory,
      newValue:      category,
      source:        "ML",
    });

    return res.status(200).json({ message: "Transaction re-categorized.", category, transaction: tx });
  } catch (err) {
    console.error("[CategoryController.categorizeOne]", err);
    return res.status(500).json({ error: "Could not categorize transaction." });
  }
};

exports.batchCategorize = async (req, res) => {
  try {
    const result = await exports.batchCategorizeForUser(req.user.id);
    return res.status(200).json({ message: "Batch categorization complete.", ...result });
  } catch (err) {
    console.error("[CategoryController.batchCategorize]", err);
    return res.status(500).json({ error: "Batch categorization failed." });
  }
};

exports.getSuggestion = async (req, res) => {
  try {
    const { merchant, amount } = req.query;
    if (!merchant) return res.status(400).json({ error: "merchant query param is required." });

    let category = regexCategory(merchant);

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const mapping = await callClaude([{
          id:       "suggest",
          merchant,
          amount:   parseFloat(amount) || 0,
        }]);
        if (CATEGORY_SET.has(mapping["suggest"])) category = mapping["suggest"];
      } catch (err) {
        console.error("[CategoryController.getSuggestion] Claude failed:", err.message);
      }
    }

    return res.status(200).json({ merchant, category });
  } catch (err) {
    console.error("[CategoryController.getSuggestion]", err);
    return res.status(500).json({ error: "Could not generate suggestion." });
  }
};

exports.getAuditLog = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 50 } = req.query;

    const [logs, total] = await Promise.all([
      AuditLog.find({ userId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean(),
      AuditLog.countDocuments({ userId }),
    ]);

    return res.status(200).json({ logs, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) {
    console.error("[CategoryController.getAuditLog]", err);
    return res.status(500).json({ error: "Could not fetch audit log." });
  }
};
