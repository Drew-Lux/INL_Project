const AlertService = require('../services/AlertService');

const AlertsController = {
  // GET /api/alerts
  async index(req, res) {
    try {
      const { unreadOnly, page, limit } = req.query;
      const result = await AlertService.getAlerts(req.user.id, {
        unreadOnly: unreadOnly === 'true',
        page: Number(page) || 1,
        limit: Number(limit) || 30,
      });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // PATCH /api/alerts/read
  // Body: { alertIds: [...] } — omit alertIds to mark ALL as read
  async markRead(req, res) {
    try {
      const result = await AlertService.markRead(req.user.id, req.body.alertIds);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // GET /api/alerts/config
  async getConfig(req, res) {
    try {
      const config = await AlertService.getConfig(req.user.id);
      res.json({ success: true, config });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // PUT /api/alerts/config
  async saveConfig(req, res) {
    try {
      const config = await AlertService.saveConfig(req.user.id, req.body);
      res.json({ success: true, config });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },
};

module.exports = AlertsController;
