const express           = require('express');
const router            = express.Router();
const { protect } = require('../middleware/Auth');
const ReportController  = require('../controllers/ReportController');

router.use(protect);

router.get   ('/',             ReportController.index);
router.post  ('/generate',     ReportController.generate);
router.get   ('/:id',          ReportController.show);
router.get   ('/:id/download', ReportController.download);
router.delete('/:id',          ReportController.destroy);

module.exports = router;
