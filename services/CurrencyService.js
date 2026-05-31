const ExchangeRate = require('../models/ExchangeRate');

// Popular currencies list used for seeding / validation
const SUPPORTED_CURRENCIES = [
  'USD','EUR','GBP','JPY','CAD','AUD','CHF','CNY','INR','MXN',
  'BRL','SGD','HKD','NOK','SEK','DKK','NZD','ZAR','AED','SAR',
];

const CurrencyService = {
  /**
   * Fetch latest rates from external API and store them.
   * Uses Open Exchange Rates (free tier: base = USD only).
   * Set OPENEXCHANGERATES_APP_ID in .env
   */
  async fetchAndStoreRates(base = 'USD') {
    const appId = process.env.OPENEXCHANGERATES_APP_ID;
    if (!appId) {
      console.warn('[CurrencyService] No OPENEXCHANGERATES_APP_ID set; using fallback rates');
      return this._storeFallbackRates(base);
    }

    const url = `https://openexchangerates.org/api/latest.json?app_id=${appId}&base=${base}`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error(`FX API error: ${res.status}`);

    const data  = await res.json();
    const today = this._normaliseDate(new Date());
    const ops   = [];

    for (const [target, rate] of Object.entries(data.rates)) {
      if (!SUPPORTED_CURRENCIES.includes(target)) continue;
      ops.push({
        updateOne: {
          filter: { base, target, date: today },
          update: { $set: { base, target, rate, date: today, source: 'openexchangerates' } },
          upsert: true,
        },
      });
    }

    if (ops.length) await ExchangeRate.bulkWrite(ops);
    return ops.length;
  },

  /**
   * Get the conversion rate between two currencies on a given date.
   * Falls back to stored rates if the date is in the past.
   */
  async getRate(from, to, date = new Date()) {
    from = from.toUpperCase();
    to   = to.toUpperCase();
    if (from === to) return 1;

    // Direct lookup
    const direct = await ExchangeRate.findClosest(from, to, date);
    if (direct) return direct.rate;

    // Cross-rate via USD
    const fromUsd = await ExchangeRate.findClosest('USD', from, date);
    const toUsd   = await ExchangeRate.findClosest('USD', to,   date);
    if (fromUsd && toUsd) return toUsd.rate / fromUsd.rate;

    throw new Error(`No exchange rate found for ${from}→${to} on ${date.toISOString().slice(0,10)}`);
  },

  /**
   * Convert an amount from one currency to another.
   */
  async convert(amount, from, to, date = new Date()) {
    if (from === to) return { amount, rate: 1 };
    const rate = await this.getRate(from, to, date);
    return { amount: Math.round(amount * rate * 100) / 100, rate };
  },

  /**
   * Get historical rates for a currency pair over a date range.
   */
  async getHistoricalRates(from, to, startDate, endDate) {
    return ExchangeRate.find({
      base:   from.toUpperCase(),
      target: to.toUpperCase(),
      date:   { $gte: startDate, $lte: endDate },
    }).sort({ date: 1 }).lean();
  },

  /**
   * Supported currencies list.
   */
  getSupportedCurrencies() {
    return SUPPORTED_CURRENCIES;
  },

  // ─── Private helpers ───────────────────────────────────────────────────────

  _normaliseDate(d) {
    const n = new Date(d);
    n.setUTCHours(0, 0, 0, 0);
    return n;
  },

  async _storeFallbackRates(base) {
    // Hardcoded fallback so the app doesn't break without an API key
    const fallback = { EUR:0.92, GBP:0.79, JPY:149.5, CAD:1.36, AUD:1.53, CHF:0.90, INR:83.1, ZAR:18.6 };
    const today = this._normaliseDate(new Date());
    const ops = Object.entries(fallback).map(([target, rate]) => ({
      updateOne: {
        filter: { base, target, date: today },
        update: { $set: { base, target, rate, date: today, source: 'fallback' } },
        upsert: true,
      },
    }));
    await ExchangeRate.bulkWrite(ops);
    return ops.length;
  },
};

module.exports = CurrencyService;
