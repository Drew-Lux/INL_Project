const path          = require('path');
const ReportService = require('../services/ReportService');

const ReportController = {
  // GET /api/reports
  async index(req, res) {
    try {
      const result = await ReportService.getUserReports(req.user.id, {
        page:  Number(req.query.page)  || 1,
        limit: Number(req.query.limit) || 20,
      });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // POST /api/reports/generate
  async generate(req, res) {
    try {
      const { type = 'custom_range', format = 'pdf', parameters = {} } = req.body;
      const validTypes   = ['monthly_digest','custom_range','tax_summary','budget_variance','goal_summary'];
      const validFormats = ['pdf','csv'];

      if (!validTypes.includes(type))   return res.status(400).json({ success: false, message: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
      if (!validFormats.includes(format)) return res.status(400).json({ success: false, message: 'Invalid format. Must be pdf or csv' });

      const report = await ReportService.scheduleReport(req.user.id, type, format, parameters);
      res.status(202).json({
        success: true,
        message: 'Report generation queued',
        report: { _id: report._id, status: report.status, type, format },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // GET /api/reports/:id
  async show(req, res) {
    try {
      const Report = require('../models/Report');
      const report = await Report.findOne({ _id: req.params.id, userId: req.user.id });
      if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
      res.json({ success: true, report });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // GET /api/reports/:id/download
  async download(req, res) {
    try {
      const report = await ReportService.getReportFile(req.params.id, req.user.id);
      const mimeType = report.format === 'pdf' ? 'application/pdf' : 'text/csv';
      const filename = `report-${report.type}-${report._id}.${report.format}`;

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.sendFile(path.resolve(report.filePath));
    } catch (err) {
      const code = err.message.includes('not found') ? 404 : 500;
      res.status(code).json({ success: false, message: err.message });
    }
  },

  // DELETE /api/reports/:id
  async destroy(req, res) {
    try {
      const Report = require('../models/Report');
      const report = await Report.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
      if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
      // Optionally delete file from disk
      const fs = require('fs');
      if (report.filePath && fs.existsSync(report.filePath)) fs.unlinkSync(report.filePath);
      res.json({ success: true, message: 'Report deleted' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

module.exports = ReportController;
