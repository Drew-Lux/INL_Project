const express     = require("express");
const router      = express.Router();
const { protect } = require("../middleware/Auth");
const {
  getTasks,
  triggerTask,
} = require("../controllers/SchedulerController");

// List all registered background tasks and their last run status
router.get("/api/scheduler/tasks", protect, getTasks);

// Manually trigger a named task (responds 202 immediately; runs async)
// Usage: POST /api/scheduler/run/categorize-transactions
router.post("/api/scheduler/run/:name", protect, triggerTask);

module.exports = router;
