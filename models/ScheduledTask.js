const mongoose = require("mongoose");
const { Schema } = mongoose;

const ScheduledTaskSchema = new Schema(
  {
    name:           { type: String, required: true, unique: true },
    description:    { type: String, required: true },
    cronExpression: { type: String, required: true },

    lastRunAt:       { type: Date, default: null },
    nextRunAt:       { type: Date, default: null },
    lastRunStatus:   {
      type: String,
      enum: ["SUCCESS", "FAILED", "RUNNING", "PENDING"],
      default: "PENDING",
    },
    lastRunDuration: { type: Number, default: null }, // ms
    lastRunMessage:  { type: String, default: null },

    isEnabled:  { type: Boolean, default: true },
    runCount:   { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ScheduledTask", ScheduledTaskSchema);
