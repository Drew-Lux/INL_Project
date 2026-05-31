const CurrencyService = require('../services/CurrencyService');

const CurrencyController = {
  // GET /api/exchange-rates?base=USD
  async getRates(req, res) {
    try {
      const ExchangeRate = require('../models/ExchangeRate');
      const base = (req.query.base || 'USD').toUpperCase();
      const date = req.query.date ? new Date(req.query.date) : new Date();

      // Get all targets for this base on or before the date
      const rates = await ExchangeRate.find({
        base,
        date: { $lte: date },
      })
        .sort({ date: -1 })
        // Get only the most recent rate per target
        .lean();

      // Deduplicate: keep only the latest per target
      const seen = new Set();
      const deduped = [];
      for (const r of rates) {
        if (!seen.has(r.target)) { seen.add(r.target); deduped.push(r); }
      }

      res.json({ success: true, base, date, rates: deduped });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // GET /api/exchange-rates/rate?from=USD&to=EUR&date=2024-01-15
  async getRate(req, res) {
    try {
      const { from = 'USD', to = 'EUR', date } = req.query;
      const rate = await CurrencyService.getRate(from, to, date ? new Date(date) : new Date());
      res.json({ success: true, from: from.toUpperCase(), to: to.toUpperCase(), rate });
    } catch (err) {
      res.status(404).json({ success: false, message: err.message });
    }
  },

  // POST /api/exchange-rates/convert
  // Body: { amount, from, to, date? }
  async convert(req, res) {
    try {
      const { amount, from, to, date } = req.body;
      if (!amount || !from || !to) {
        return res.status(400).json({ success: false, message: 'amount, from, and to are required' });
      }
      const result = await CurrencyService.convert(
        Number(amount), from, to, date ? new Date(date) : new Date()
      );
      res.json({
        success: true,
        input: { amount: Number(amount), currency: from.toUpperCase() },
        output: { amount: result.amount, currency: to.toUpperCase() },
        rate: result.rate,
      });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  // GET /api/exchange-rates/historical?from=USD&to=EUR&start=2024-01-01&end=2024-03-01
  async getHistorical(req, res) {
    try {
      const { from, to, start, end } = req.query;
      if (!from || !to || !start || !end) {
        return res.status(400).json({ success: false, message: 'from, to, start, and end are required' });
      }
      const rates = await CurrencyService.getHistoricalRates(from, to, new Date(start), new Date(end));
      res.json({ success: true, from: from.toUpperCase(), to: to.toUpperCase(), rates });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // GET /api/exchange-rates/currencies
  async getSupportedCurrencies(req, res) {
    res.json({ success: true, currencies: CurrencyService.getSupportedCurrencies() });
  },

  // POST /api/exchange-rates/sync  (admin / scheduler use)
  async syncRates(req, res) {
    try {
      const count = await CurrencyService.fetchAndStoreRates(req.query.base || 'USD');
      res.json({ success: true, message: `Synced ${count} rates` });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

module.exports = CurrencyController;
