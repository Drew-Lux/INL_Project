const express     = require("express");
const router      = express.Router();
const { protect } = require("../middleware/Auth");
const {
  getTrends,
  getPatterns,
  getAnomalies,
  getRecommendations,
} = require("../controllers/InsightsController");

// Month-over-month spending by category
// Usage: GET /api/insights/trends?months=3
router.get("/api/insights/trends", protect, getTrends);

// Day-of-week / week-of-month spending patterns
// Usage: GET /api/insights/patterns?months=3
router.get("/api/insights/patterns", protect, getPatterns);

// Statistically anomalous transactions
// Usage: GET /api/insights/anomalies?months=3
router.get("/api/insights/anomalies", protect, getAnomalies);

// AI-generated actionable recommendations
router.get("/api/insights/recommendations", protect, getRecommendations);

module.exports = router;
