const mongoose = require('mongoose');

const ExchangeRateSchema = new mongoose.Schema({
  base:    { type: String, required: true, uppercase: true }, // e.g. 'USD'
  target:  { type: String, required: true, uppercase: true }, // e.g. 'EUR'
  rate:    { type: Number, required: true },
  date: {
    type: Date,
    required: true,
    index: true,
    // Normalised to midnight UTC so one doc per pair per day
  },
  source: {
    type: String,
    enum: ['openexchangerates', 'exchangeratesapi', 'manual', 'fallback'],
    default: 'openexchangerates',
  },
}, {
  timestamps: true,
});

// One rate per base/target/date
ExchangeRateSchema.index({ base: 1, target: 1, date: -1 }, { unique: true });

// Helper: find closest rate on or before a given date
ExchangeRateSchema.statics.findClosest = async function (base, target, date = new Date()) {
  return this.findOne({
    base:   base.toUpperCase(),
    target: target.toUpperCase(),
    date:   { $lte: date },
  }).sort({ date: -1 });
};

module.exports = mongoose.model('ExchangeRate', ExchangeRateSchema);
