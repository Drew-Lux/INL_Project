const express                  = require('express');
const router                   = express.Router();
const { protect } = require('../middleware/Auth');
const BudgetVarianceController = require('../controllers/BudgetVarianceController');

router.use(protect);

router.get('/',      BudgetVarianceController.index);
router.get('/trend', BudgetVarianceController.trend);

module.exports = router;
