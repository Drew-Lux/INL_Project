const path   = require('path');
const fs     = require('fs');
const Report = require('../models/Report');
const AuditService = require('./AuditService');

// Lazy-load heavy deps so they don't crash the server if not installed
let PDFDocument, createObjectCsvWriter;
try { PDFDocument = require('pdfkit'); } catch { /* will fail gracefully */ }
try { createObjectCsvWriter = require('csv-writer').createObjectCsvWriter; } catch { /* */ }

const REPORTS_DIR = path.resolve(process.env.REPORTS_DIR || './storage/reports');

const ReportService = {
  /**
   * Kick off an async report generation job.
   * Returns the Report record immediately; generation runs in background.
   */
  async scheduleReport(userId, type, format, parameters = {}) {
    const report = await Report.create({
      userId, type, format, parameters,
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7-day TTL
    });

    // Fire-and-forget generation
    this._generate(report).catch(err => {
      console.error('[ReportService] Generation failed:', err.message);
      Report.findByIdAndUpdate(report._id, { status: 'failed', errorMessage: err.message }).exec();
    });

    return report;
  },

  /**
   * Generate the report file.
   */
  async _generate(report) {
    await Report.findByIdAndUpdate(report._id, { status: 'processing' });

    // Ensure output directory exists
    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

    const filename  = `${report._id}.${report.format}`;
    const filePath  = path.join(REPORTS_DIR, filename);
    const data      = await this._fetchData(report);

    if (report.format === 'pdf') {
      await this._generatePDF(filePath, report, data);
    } else {
      await this._generateCSV(filePath, report, data);
    }

    const stats = fs.statSync(filePath);
    await Report.findByIdAndUpdate(report._id, {
      status: 'completed',
      filePath,
      fileSize: stats.size,
      downloadUrl: `/api/reports/${report._id}/download`,
      generatedAt: new Date(),
    });
  },

  /**
   * Fetch the transaction/goal/budget data needed for a given report type.
   * Adjust model imports to match your existing Transaction/BudgetCategory models.
   */
  async _fetchData(report) {
    // Dynamic require to avoid circular deps
    const Transaction    = require('../models/Transaction');
    const BudgetCategory = require('../models/BudgetCategory');
    const Goal           = require('../models/Goal');

    const { startDate, endDate, accountIds, categories, currency = 'USD' } = report.parameters;
    const userId = report.userId;

    const txQuery = { userId, deletedAt: null };
    if (startDate) txQuery.date = { $gte: new Date(startDate) };
    if (endDate)   txQuery.date = { ...(txQuery.date || {}), $lte: new Date(endDate) };
    if (accountIds?.length) txQuery.accountId = { $in: accountIds };
    if (categories?.length) txQuery.category  = { $in: categories };

    const [transactions, budgets, goals] = await Promise.all([
      Transaction.find(txQuery).sort({ date: -1 }).lean(),
      BudgetCategory.find({ userId }).lean(),
      Goal.find({ userId, deletedAt: null }).lean({ virtuals: true }),
    ]);

    return { transactions, budgets, goals, currency };
  },

  // ─── PDF ───────────────────────────────────────────────────────────────────

  async _generatePDF(filePath, report, data) {
    if (!PDFDocument) throw new Error('pdfkit not installed. Run: npm install pdfkit');

    return new Promise((resolve, reject) => {
      const doc  = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // ── Cover ──────────────────────────────────────────────────────────────
      doc.fontSize(22).font('Helvetica-Bold').text('Financial Report', { align: 'center' });
      doc.fontSize(12).font('Helvetica').text(
        `Generated: ${new Date().toLocaleDateString()}`, { align: 'center' }
      );
      doc.moveDown(2);

      // ── Summary ────────────────────────────────────────────────────────────
      const totalIncome  = data.transactions.filter(t => t.amount > 0).reduce((s,t)=>s+t.amount,0);
      const totalExpense = data.transactions.filter(t => t.amount < 0).reduce((s,t)=>s+Math.abs(t.amount),0);

      doc.fontSize(14).font('Helvetica-Bold').text('Summary');
      doc.fontSize(11).font('Helvetica');
      doc.text(`Total Income:   ${data.currency} ${totalIncome.toFixed(2)}`);
      doc.text(`Total Expenses: ${data.currency} ${totalExpense.toFixed(2)}`);
      doc.text(`Net Cash Flow:  ${data.currency} ${(totalIncome - totalExpense).toFixed(2)}`);
      doc.moveDown();

      // ── Transactions ───────────────────────────────────────────────────────
      if (data.transactions.length) {
        doc.fontSize(14).font('Helvetica-Bold').text('Transactions');
        doc.fontSize(9).font('Helvetica');

        // Simple table header
        const cols = [50, 130, 310, 430];
        doc.text('Date',        cols[0], doc.y, { continued: true });
        doc.text('Merchant',    cols[1], doc.y, { continued: true });
        doc.text('Category',    cols[2], doc.y, { continued: true });
        doc.text('Amount',      cols[3], doc.y);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();

        for (const t of data.transactions.slice(0, 100)) { // cap at 100 rows in PDF
          if (doc.y > 720) { doc.addPage(); } // page break
          const dateStr = new Date(t.date).toLocaleDateString();
          doc.text(dateStr,              cols[0], doc.y, { continued: true, width: 75 });
          doc.text(t.merchantName||'—',  cols[1], doc.y, { continued: true, width: 175 });
          doc.text(t.category||'—',      cols[2], doc.y, { continued: true, width: 115 });
          doc.text(`${t.amount<0?'-':''}${Math.abs(t.amount).toFixed(2)}`, cols[3], doc.y, { width: 80 });
        }
        if (data.transactions.length > 100) {
          doc.moveDown().text(`… and ${data.transactions.length - 100} more transactions. Export CSV for full list.`);
        }
        doc.moveDown();
      }

      // ── Goals ──────────────────────────────────────────────────────────────
      if (data.goals.length) {
        doc.addPage();
        doc.fontSize(14).font('Helvetica-Bold').text('Financial Goals');
        doc.fontSize(11).font('Helvetica');
        for (const g of data.goals) {
          doc.moveDown(0.5);
          doc.font('Helvetica-Bold').text(g.title, { continued: true });
          doc.font('Helvetica').text(`  (${g.status})`);
          doc.text(`Progress: ${g.currentAmount} / ${g.targetAmount} ${g.currency} — ${g.progressPercent}%`);
        }
      }

      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  },

  // ─── CSV ───────────────────────────────────────────────────────────────────

  async _generateCSV(filePath, report, data) {
    if (!createObjectCsvWriter) {
      throw new Error('csv-writer not installed. Run: npm install csv-writer');
    }

    const writer = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'date',         title: 'Date' },
        { id: 'merchantName', title: 'Merchant' },
        { id: 'category',     title: 'Category' },
        { id: 'amount',       title: 'Amount' },
        { id: 'currency',     title: 'Currency' },
        { id: 'accountId',    title: 'Account ID' },
        { id: 'isAnomalous',  title: 'Flagged' },
        { id: 'description',  title: 'Description' },
      ],
    });

    const rows = data.transactions.map(t => ({
      date:         new Date(t.date).toISOString().slice(0,10),
      merchantName: t.merchantName || '',
      category:     t.category     || '',
      amount:       t.amount,
      currency:     t.currency     || data.currency,
      accountId:    t.accountId?.toString() || '',
      isAnomalous:  t.isAnomalous ? 'YES' : '',
      description:  t.description || '',
    }));

    await writer.writeRecords(rows);
  },

  // ─── Download ──────────────────────────────────────────────────────────────

  async getReportFile(reportId, userId) {
    const report = await Report.findOne({ _id: reportId, userId, status: 'completed' });
    if (!report) throw new Error('Report not found or not ready');
    if (!fs.existsSync(report.filePath)) throw new Error('Report file missing from disk');
    await AuditService.logExport(userId, report.format, `report:${reportId}`);
    return report;
  },

  async getUserReports(userId, { page = 1, limit = 20 } = {}) {
    const [reports, total] = await Promise.all([
      Report.find({ userId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Report.countDocuments({ userId }),
    ]);
    return { reports, total, page, pages: Math.ceil(total / limit) };
  },
};

module.exports = ReportService;
