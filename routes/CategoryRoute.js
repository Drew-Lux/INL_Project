const express     = require("express");
const router      = express.Router();
const { protect } = require("../middleware/Auth");
const {
  categorizeOne,
  batchCategorize,
  getSuggestion,
  getAuditLog,
} = require("../controllers/CategoryController");

// Batch ML-categorize all Uncategorized transactions for the logged-in user
// Must be registered before /:id so "batch" isn't treated as a transaction ID
router.post("/api/categorize/batch", protect, batchCategorize);

// Re-categorize a single transaction via ML
router.post("/api/categorize/:id", protect, categorizeOne);

// Suggest a category for a merchant name without writing to DB
// Usage: GET /api/categorize/suggest?merchant=Netflix&amount=-149
router.get("/api/categorize/suggest", protect, getSuggestion);

// Categorization change history
router.get("/api/categorize/audit", protect, getAuditLog);

module.exports = router;
