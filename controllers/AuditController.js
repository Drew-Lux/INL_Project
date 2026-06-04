const AuditLog  = require('../models/AuditLog');
const AuditService = require('../services/AuditService');

const AuditController = {
  /**
   * GET /api/audit-log
   * Returns paginated audit trail for the authenticated user.
   */
  async index(req, res) {
    try {
      const { resource, action, page = 1, limit = 50, startDate, endDate } = req.query;
      const query = { userId: req.user.id };

      if (resource) query.resource = resource;
      if (action)   query.action   = action;
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate)   query.createdAt.$lte = new Date(endDate);
      }

      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .sort({ createdAt: -1 })
          .skip((Number(page) - 1) * Number(limit))
          .limit(Number(limit))
          .lean(),
        AuditLog.countDocuments(query),
      ]);

      res.json({
        success: true,
        logs,
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * GET /api/audit-log/:resourceType/:resourceId
   * Returns the full change history for a specific document.
   */
  async resourceHistory(req, res) {
    try {
      const logs = await AuditLog.find({
        userId:     req.user.id,
        resource:   req.params.resourceType,
        resourceId: req.params.resourceId,
      }).sort({ createdAt: -1 }).lean();

      res.json({ success: true, logs });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * POST /api/audit-log/restore/:resourceType/:resourceId
   * Restores a soft-deleted document from its most recent DELETE audit entry.
   * Currently supports: Goal, Transaction (extend as needed).
   */
  async restore(req, res) {
    try {
      const { resourceType, resourceId } = req.params;

      // Find the most recent DELETE log for this resource
      const deleteLog = await AuditLog.findOne({
        userId:     req.user.id,
        action:     'DELETE',
        resource:   resourceType,
        resourceId,
      }).sort({ createdAt: -1 });

      if (!deleteLog) {
        return res.status(404).json({ success: false, message: 'No deletion record found' });
      }

      // Dynamically resolve the model
      const Model = _resolveModel(resourceType);
      if (!Model) {
        return res.status(400).json({ success: false, message: `Cannot restore resource type: ${resourceType}` });
      }

      const doc = await Model.findById(resourceId);
      if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

      doc.deletedAt = null;
      await doc.save();

      await AuditService.logRestore(req.user.id, resourceType, resourceId, doc.toObject(), req);

      res.json({ success: true, message: `${resourceType} restored`, document: doc });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

function _resolveModel(resourceType) {
  const modelMap = {
    Goal:        () => require('../models/Goal'),
    Transaction: () => require('../models/Transaction'),
    // Add other restorable models here
  };
  return modelMap[resourceType]?.();
}

module.exports = AuditController;
