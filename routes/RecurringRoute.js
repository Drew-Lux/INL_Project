const express     = require("express");
const router      = express.Router();
const { protect } = require("../middleware/Auth");
const {
  getRecurring,
  runDetection,
  updateStatus,
  getForecast,
} = require("../controllers/RecurringTransactionController");

// List all detected recurring patterns
// Usage: GET /api/recurring?status=DETECTED
router.get("/api/recurring", protect, getRecurring);

// Run detection algorithm on the logged-in user's transactions
router.post("/api/recurring/detect", protect, runDetection);

// Confirm or dismiss a detected pattern
// Body: { status: "CONFIRMED" | "DISMISSED" }
router.patch("/api/recurring/:id", protect, updateStatus);

// Forecast next N expected occurrences
// Usage: GET /api/recurring/:id/forecast?periods=6
router.get("/api/recurring/:id/forecast", protect, getForecast);

module.exports = router;
