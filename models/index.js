const mongoose = require("mongoose");
const { Schema } = mongoose;

const TransactionSchema = require("./Transaction");
const BudgetCategorySchema = require("./BudgetCategory");
const PortfolioSnapshotSchema = require("./Portfolio");
const User = require("./User");
const Account = require("./Account");
const Holding = require("./Holding");
const RecurringTransaction = require("./RecurringTransaction");
const AuditLog = require("./AuditLog");
const ScheduledTask = require("./ScheduledTask");

module.exports = {
    User,
    Account,
    TransactionSchema,
    Holding,
    BudgetCategorySchema,
    PortfolioSnapshotSchema,
    RecurringTransaction,
    AuditLog,
    ScheduledTask,
}