/**
 * routes/index.js
 * ===============
 * Barrel file — mounts all domain route modules onto the Express app.
 *
 * Usage in server.js:
 *   const registerRoutes = require('./routes');
 *   registerRoutes(app);
 */
const authRoutes       = require("./AuthRoute");
const dashboardRoutes  = require("./DashboardRoute");
const cashflowRoutes   = require("./CashflowRoute");
const portfolioRoutes  = require("./PortfolioRoute");
const forecasterRoutes = require("./ForecasterRoute");
const atlasRoutes      = require("./AtlasRoute");
const userRoutes       = require("./UserRoute");
const categoryRoutes   = require("./CategoryRoute");
const insightsRoutes   = require("./InsightsRoute");
const recurringRoutes  = require("./RecurringRoute");
const schedulerRoutes  = require("./SchedulerRoute");

module.exports = (app) => {
  app.use("/",         authRoutes);       // POST /auth/register, /auth/login …
  app.use("/",         dashboardRoutes);  // GET  /
  app.use("/",         cashflowRoutes);   // GET  /cashflow, /api/transactions …
  app.use("/",         portfolioRoutes);  // GET  /portfolio, /api/accounts …
  app.use("/",         forecasterRoutes); // GET  /forecaster, /api/forecaster
  app.use("/",         atlasRoutes);      // GET  /atlas, POST /api/atlas/chat …
  app.use("/api/user", userRoutes);       // GET  /api/user/profile …
  app.use("/",         categoryRoutes);   // POST /api/categorize/:id, /api/categorize/batch …
  app.use("/",         insightsRoutes);   // GET  /api/insights/trends, /patterns, /anomalies …
  app.use("/",         recurringRoutes);  // GET  /api/recurring, /api/recurring/detect …
  app.use("/",         schedulerRoutes);  // GET  /api/scheduler/tasks, POST /api/scheduler/run/:name
};

