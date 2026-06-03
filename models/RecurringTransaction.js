const mongoose = require("mongoose");
const { Schema } = mongoose;

const RecurringTransactionSchema = new Schema(
  {
    userId:         { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    merchantName:   { type: String, required: true },
    normalizedName: { type: String, required: true },

    amount: {
      min:      { type: Number, required: true },
      max:      { type: Number, required: true },
      mean:     { type: Number, required: true },
      currency: { type: String, default: "ZAR" },
    },

    category: { type: String, default: "Uncategorized" },

    frequency: {
      type: String,
      enum: ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL", "IRREGULAR"],
      default: "MONTHLY",
    },

    intervalDays:    { type: Number, required: true },
    intervalStdDev:  { type: Number, default: 0 },
    nextExpectedDate: { type: Date },
    lastSeenDate:    { type: Date, required: true },
    occurrenceCount: { type: Number, default: 0 },

    // 0–1: higher = more confident this is truly recurring
    confidence: { type: Number, min: 0, max: 1, default: 0 },

    status: {
      type: String,
      enum: ["DETECTED", "CONFIRMED", "DISMISSED"],
      default: "DETECTED",
    },

    transactionIds: [{ type: Schema.Types.ObjectId, ref: "Transaction" }],
  },
  { timestamps: true }
);

RecurringTransactionSchema.index({ userId: 1, status: 1 });
// One pattern per normalizedName per user — prevents duplicate detection runs
RecurringTransactionSchema.index({ userId: 1, normalizedName: 1 }, { unique: true });

module.exports = mongoose.model("RecurringTransaction", RecurringTransactionSchema);
