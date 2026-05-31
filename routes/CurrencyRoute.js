const express             = require('express');
const router              = express.Router();
const { protect } = require('../middleware/Auth');
const CurrencyController  = require('../controllers/CurrencyController');

// Public read endpoints (no auth needed for rate lookups)
router.get ('/currencies', CurrencyController.getSupportedCurrencies);
router.get ('/rate',       CurrencyController.getRate);
router.get ('/historical', CurrencyController.getHistorical);
router.post('/convert',    CurrencyController.convert);
router.get ('/',           CurrencyController.getRates);

// Admin: manual rate sync (auth required)
router.post('/sync', protect, CurrencyController.syncRates);

module.exports = router;
