const express           = require('express');
const router            = express.Router();
const { protect } = require('../middleware/Auth');
const AlertsController  = require('../controllers/AlertsController');

router.use(protect);

router.get  ('/',       AlertsController.index);
router.patch('/read',   AlertsController.markRead);
router.get  ('/config', AlertsController.getConfig);
router.put  ('/config', AlertsController.saveConfig);

module.exports = router;
