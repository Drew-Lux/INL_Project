const mongoose = require("mongoose");
const { Schema } = mongoose;

const Transaction = require("./Transaction");
const BudgetCategory = require("./BudgetCategory");
const PortfolioSnapshot = require("./Portfolio");
const User = require("./User");
const Account = require("./Account");
const Holding = require("./Holding");

const Goal                        = require('./Goal');
const { AlertConfig, AlertEvent } = require('./Alert');
const AuditLog                    = require('./AuditLog');
const ExchangeRate                = require('./ExchangeRate');
const Report                      = require('./Report');
const AtlasSession                = require("./Atlas");


module.exports = {
    User,
    Account,
    Transaction,
    Holding,
    BudgetCategory,
    PortfolioSnapshot,

    AtlasSession,
    Goal,
    AlertConfig,
    AlertEvent,
    AuditLog,
    ExchangeRate,
    Report,
}