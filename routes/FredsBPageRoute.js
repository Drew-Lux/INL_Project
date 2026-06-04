const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/Auth');

router.get('/goals',     protect, (req, res) => res.render('goals'));
router.get('/alerts',    protect, (req, res) => res.render('alerts'));
router.get('/reports',   protect, (req, res) => res.render('reports'));
router.get('/audit-log', protect, (req, res) => res.render('audit-log'));

module.exports = router;
