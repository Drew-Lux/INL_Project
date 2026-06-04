const express          = require('express');
const router           = express.Router();
const { protect } = require('../middleware/Auth');
const AuditController  = require('../controllers/AuditController');

router.use(protect);

router.get ('/',                                  AuditController.index);
router.get ('/:resourceType/:resourceId',         AuditController.resourceHistory);
router.post('/restore/:resourceType/:resourceId', AuditController.restore);

module.exports = router;
