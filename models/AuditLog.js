const mongoose = require("mongoose");
const { Schema } = mongoose;

const AuditLogSchema = new Schema(
  {
    userId:     { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    entityType: { type: String, enum: ["Transaction", "RecurringTransaction"], required: true },
    entityId:   { type: Schema.Types.ObjectId, required: true },

    action: {
      type: String,
      enum: [
        "CATEGORY_AUTO_ASSIGNED",
        "CATEGORY_ML_ASSIGNED",
        "CATEGORY_USER_UPDATED",
        "RECURRING_DETECTED",
        "RECURRING_CONFIRMED",
        "RECURRING_DISMISSED",
        "ANOMALY_FLAGGED",
      ],
      required: true,
    },

    previousValue: { type: Schema.Types.Mixed },
    newValue:      { type: Schema.Types.Mixed },

    source: {
      type: String,
      enum: ["ML", "USER", "SYSTEM", "SCHEDULER"],
      required: true,
    },
  },
  { timestamps: true }
);

AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ entityType: 1, entityId: 1 });

module.exports = mongoose.model("AuditLog", AuditLogSchema);
