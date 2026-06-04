/**
 * Job: generateMonthlyReports
 * Runs on the 1st of every month at 01:00.
 * Auto-generates a monthly digest PDF for users who have opted in
 * via preferences.autoMonthlyReport = true on the User model.
 */
const User          = require('../models/User');
const ReportService = require('../services/ReportService');

module.exports = async function generateMonthlyReports() {
  const now       = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLast = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const users = await User.find({ 'preferences.autoMonthlyReport': true }).lean();

  for (const user of users) {
    try {
      await ReportService.scheduleReport(user._id, 'monthly_digest', 'pdf', {
        startDate: lastMonth,
        endDate:   endOfLast,
        currency:  user.preferences?.currency || 'USD',
      });
      console.log(`[Job:generateMonthlyReports] Queued for user ${user._id}`);
    } catch (err) {
      console.error(`[Job:generateMonthlyReports] Failed for user ${user._id}:`, err.message);
    }
  }
};
