const AuditLog = require('../models/AuditLog');

/**
 * Compute a field-level diff between two plain objects.
 * Only top-level keys are diffed (deep diff would be too noisy for most uses).
 */
function computeDiff(before, after) {
  const diff = [];
  const allKeys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);
  for (const field of allKeys) {
    const oldVal = before?.[field];
    const newVal = after?.[field];
    const changed =
      JSON.stringify(oldVal) !== JSON.stringify(newVal);
    if (changed) diff.push({ field, oldValue: oldVal, newValue: newVal });
  }
  return diff;
}

/**
 * Log a single audit event.
 *
 * @param {Object} opts
 * @param {string}  opts.userId
 * @param {string}  opts.action   - CREATE | UPDATE | DELETE | RESTORE | EXPORT | …
 * @param {string}  opts.resource - Model name, e.g. 'Transaction'
 * @param {string}  opts.resourceId
 * @param {Object}  [opts.before] - Document state before change
 * @param {Object}  [opts.after]  - Document state after change
 * @param {string}  [opts.ipAddress]
 * @param {string}  [opts.userAgent]
 * @param {string}  [opts.requestId]
 * @param {string}  [opts.note]
 */
async function log(opts) {
  try {
    const diff =
      opts.before || opts.after
        ? computeDiff(opts.before || {}, opts.after || {})
        : [];

    await AuditLog.create({
      userId:     opts.userId,
      action:     opts.action,
      resource:   opts.resource,
      resourceId: opts.resourceId,
      before:     opts.before || null,
      after:      opts.after  || null,
      diff,
      ipAddress:  opts.ipAddress,
      userAgent:  opts.userAgent,
      requestId:  opts.requestId,
      note:       opts.note,
    });
  } catch (err) {
    // Audit logging should never crash the main request
    console.error('[AuditService] Failed to write log:', err.message);
  }
}

/**
 * Convenience wrappers
 */
const AuditService = {
  log,

  logCreate: (userId, resource, resourceId, after, req = {}) =>
    log({ userId, action: 'CREATE', resource, resourceId, after,
          ipAddress: req.ip, userAgent: req.headers?.['user-agent'], requestId: req.id }),

  logUpdate: (userId, resource, resourceId, before, after, req = {}) =>
    log({ userId, action: 'UPDATE', resource, resourceId, before, after,
          ipAddress: req.ip, userAgent: req.headers?.['user-agent'], requestId: req.id }),

  logDelete: (userId, resource, resourceId, before, req = {}) =>
    log({ userId, action: 'DELETE', resource, resourceId, before,
          ipAddress: req.ip, userAgent: req.headers?.['user-agent'], requestId: req.id }),

  logRestore: (userId, resource, resourceId, after, req = {}) =>
    log({ userId, action: 'RESTORE', resource, resourceId, after,
          ipAddress: req.ip, userAgent: req.headers?.['user-agent'], requestId: req.id }),

  logExport: (userId, format, note, req = {}) =>
    log({ userId, action: 'EXPORT', resource: 'Report', note: `${format}: ${note}`,
          ipAddress: req.ip, userAgent: req.headers?.['user-agent'], requestId: req.id }),
};

module.exports = AuditService;
