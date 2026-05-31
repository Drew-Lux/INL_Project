const express         = require('express');
const router          = express.Router();
const { protect } = require('../middleware/Auth');
const GoalsController = require('../controllers/GoalsController');

router.use(protect);

router.get   ('/',               GoalsController.index);
router.post  ('/',               GoalsController.create);
router.get   ('/:id',            GoalsController.show);
router.patch ('/:id',            GoalsController.update);
router.patch ('/:id/progress',   GoalsController.updateProgress);
router.post  ('/:id/milestones', GoalsController.addMilestone);
router.delete('/:id',            GoalsController.destroy);

module.exports = router;
