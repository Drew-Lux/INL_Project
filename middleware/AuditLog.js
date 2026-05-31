const AuditService = require('../services/AuditService');

/**
 * HTTP middleware that automatically logs mutating requests (POST, PATCH, PUT, DELETE)
 * to the audit trail.
 *
 * Usage: mount AFTER your auth middleware so req.user is available.
 *   app.use('/api', auditMiddleware);
 *
 * For fine-grained before/after snapshots, use AuditService directly in controllers.
 * This middleware captures the coarser "what endpoint was hit" level.
 */
function auditMiddleware(req, res, next) {
  const LOGGED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!LOGGED_METHODS.includes(req.method)) return next();

  const startTime = Date.now();

  // Capture the original json() so we can sniff the response body
  const originalJson = res.json.bind(res);
  let responseBody;
  res.json = (body) => {
    responseBody = body;
    return originalJson(body);
  };

  res.on('finish', () => {
    if (!req.user?.id) return; // don't log unauthenticated requests

    const action = _inferAction(req.method, req.path);
    const resource = _inferResource(req.path);

    AuditService.log({
      userId:    req.user.id,
      action,
      resource,
      resourceId: req.params?.id || responseBody?.goal?._id || responseBody?.report?._id,
      after:     responseBody?.success ? (responseBody.goal || responseBody.report || null) : null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.id, // if you use express-request-id middleware
      note:      `${req.method} ${req.path} → ${res.statusCode} (${Date.now() - startTime}ms)`,
    }).catch(console.error);
  });

  next();
}

function _inferAction(method, path) {
  if (method === 'DELETE') return 'DELETE';
  if (method === 'POST' && path.includes('restore')) return 'RESTORE';
  if (method === 'POST') return 'CREATE';
  return 'UPDATE';
}

function _inferResource(path) {
  // Extract resource name from path segment: /api/goals/123 → Goal
  const segments = path.split('/').filter(Boolean);
  const map = {
    goals: 'Goal', alerts: 'Alert', budgets: 'Budget',
    reports: 'Report', 'audit-log': 'AuditLog',
    'exchange-rates': 'ExchangeRate',
  };
  for (const seg of segments) {
    if (map[seg]) return map[seg];
  }
  return 'Unknown';
}

module.exports = auditMiddleware;
