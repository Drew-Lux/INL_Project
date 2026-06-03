const User                        = require("./User");
const Account                     = require("./Account");
const Transaction                 = require("./Transaction");
const BudgetCategory              = require("./BudgetCategory");
const PortfolioSnapshot           = require("./Portfolio");
const Holding                     = require("./Holding");
const AtlasSession                = require("./Atlas");

// ── Person A models ───────────────────────────────────────────────────────────
const RecurringTransaction        = require("./RecurringTransaction");
const ScheduledTask               = require("./ScheduledTask");

// ── Person B models ───────────────────────────────────────────────────────────
const Goal                        = require('./Goal');
const { AlertConfig, AlertEvent } = require('./Alert');
const AuditLog                    = require('./AuditLog');
const ExchangeRate                = require('./ExchangeRate');
const Report                      = require('./Report');

module.exports = {
  // Existing
  User,
  Account,
  Transaction,
  Holding,
  BudgetCategory,
  PortfolioSnapshot,
  AtlasSession,

  // Person A
  RecurringTransaction,
  ScheduledTask,

  // Person B
  Goal,
  AlertConfig,
  AlertEvent,
  AuditLog,
  ExchangeRate,
  Report,
};
