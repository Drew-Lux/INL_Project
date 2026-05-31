/**
 * routes/index.js
 * ===============
 * Barrel file — mounts all domain route modules onto the Express app.
 *
 * Usage in server.js:
 *   const registerRoutes = require('./routes');
 *   registerRoutes(app);
 */
const auditMiddleware = require('../middleware/AuditLog');

const authRoutes          = require("./AuthRoute");
const dashboardRoutes     = require("./DashboardRoute");
const cashflowRoutes      = require("./CashflowRoute");
const portfolioRoutes     = require("./PortfolioRoute");
const forecasterRoutes    = require("./ForecasterRoute");
const atlasRoutes         = require("./AtlasRoute");
const userRoutes          = require("./UserRoute");

const GoalsRoute          = require('./GoalsRoute');
const AlertsRoute         = require('./AlertsRoute');
const BudgetVarianceRoute = require('./BudgetVarianceRoute');
const AuditRoute          = require('./AuditRoute');
const CurrencyRoute       = require('./CurrencyRoute');
const ReportRoute         = require('./ReportRoute');
const FredsBPageRoute     = require('./FredsBPageRoute');

/**
 * @param {import('express').Application} app
 */
module.exports = (app) => {
app.use("/",         authRoutes);       // POST /auth/register, /auth/login …
app.use("/",         dashboardRoutes);  // GET  /
app.use("/",         cashflowRoutes);   // GET  /cashflow, /api/transactions …
app.use("/",         portfolioRoutes);  // GET  /portfolio, /api/accounts …
app.use("/",         forecasterRoutes); // GET  /forecaster, /api/forecaster
app.use("/",         atlasRoutes);      // GET  /atlas, POST /api/atlas/chat …
app.use("/",         userRoutes);       // GET  /api/user/profile …

app.use("/api/goals",            auditMiddleware, GoalsRoute);
app.use("/api/alerts",           AlertsRoute);
app.use("/api/budgets/variance", BudgetVarianceRoute);
app.use("/api/audit-log",        AuditRoute);
app.use("/api/exchange-rates",   CurrencyRoute);
app.use("/api/reports",          auditMiddleware, ReportRoute);
app.use("/",                     FredsBPageRoute);
};