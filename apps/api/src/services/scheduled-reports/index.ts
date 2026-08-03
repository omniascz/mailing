/**
 * Scheduled reports — generate periodic analytics digests and email them
 * to a configurable recipient list. Designed to be triggered by a cron worker.
 */

import { and, eq, lte } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { scheduledReports, type ScheduledReport } from '../../db/schema/index.js';
import { getOrgDailyStats } from '../analytics/index.js';
import { runSavedReport } from '../report-builder/index.js';
import type { ReportResult } from '../report-builder/pure.js';
import { sendTransactionalEmail } from '../../lib/queues.js';
import { AppError } from '../../lib/app-error.js';

const REPORTS_FROM =
  process.env.REPORTS_FROM_EMAIL ?? process.env.DOI_FROM_EMAIL ?? 'reports@forgemsg.com';

export type ReportFrequency = 'daily' | 'weekly' | 'monthly';
export type ReportType =
  | 'org_overview'
  | 'campaign_summary'
  | 'list_growth'
  | 'rfm_distribution'
  | 'custom';

export function computeNextRun(frequency: ReportFrequency, from: Date = new Date()): Date {
  const next = new Date(from);
  if (frequency === 'daily') next.setUTCDate(next.getUTCDate() + 1);
  else if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCHours(8, 0, 0, 0);
  return next;
}

export async function createScheduledReport(
  orgId: string,
  input: {
    name: string;
    reportType: ReportType;
    frequency: ReportFrequency;
    recipients: string[];
    params?: Record<string, unknown>;
  },
): Promise<ScheduledReport> {
  if (input.recipients.length === 0) throw AppError.badRequest('At least one recipient required');
  const [row] = await db
    .insert(scheduledReports)
    .values({
      orgId,
      name: input.name,
      reportType: input.reportType,
      frequency: input.frequency,
      recipients: input.recipients,
      params: input.params ?? {},
      nextRunAt: computeNextRun(input.frequency),
    })
    .returning();
  return row!;
}

export async function listScheduledReports(orgId: string): Promise<ScheduledReport[]> {
  return db.select().from(scheduledReports).where(eq(scheduledReports.orgId, orgId));
}

export async function deleteScheduledReport(orgId: string, id: string): Promise<void> {
  await db
    .delete(scheduledReports)
    .where(and(eq(scheduledReports.id, id), eq(scheduledReports.orgId, orgId)));
}

export interface DispatchResult {
  reportId: string;
  reportType: string;
  recipients: number;
  rendered: string;
}

async function renderReport(report: ScheduledReport): Promise<string> {
  if (report.reportType === 'org_overview') {
    const days = Number((report.params as { days?: number }).days ?? 7);
    const stats = await getOrgDailyStats(report.orgId, days);
    return `<h1>${report.name}</h1><pre>${JSON.stringify(stats, null, 2)}</pre>`;
  }
  // Custom report builder: params.reportId points at a saved custom_reports row.
  if (report.reportType === 'custom') {
    const reportId = String((report.params as { reportId?: string }).reportId ?? '');
    if (!reportId) {
      return `<h1>${report.name}</h1><p>Custom report is missing params.reportId.</p>`;
    }
    const result = await runSavedReport(report.orgId, reportId).catch(() => null);
    if (!result) {
      return `<h1>${report.name}</h1><p>Custom report ${reportId} could not be run.</p>`;
    }
    return renderCustomReportHtml(report.name, result);
  }
  return `<h1>${report.name}</h1><p>Report type ${report.reportType} not yet implemented.</p>`;
}

/** Render a ReportResult as a simple HTML table (group rows + a totals row). */
function renderCustomReportHtml(name: string, result: ReportResult): string {
  const metrics = Object.keys(result.totals);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const head = ['group', ...metrics].map((h) => `<th>${esc(h)}</th>`).join('');
  const bodyRows = result.rows
    .map((r) => {
      const cells = [esc(r.group), ...metrics.map((m) => String(r.values[m] ?? 0))]
        .map((c) => `<td>${c}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  const totalCells = [
    '<strong>Total</strong>',
    ...metrics.map((m) => String(result.totals[m] ?? 0)),
  ]
    .map((c) => `<td>${c}</td>`)
    .join('');
  return (
    `<h1>${esc(name)}</h1>` +
    `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">` +
    `<thead><tr>${head}</tr></thead>` +
    `<tbody>${bodyRows}<tr>${totalCells}</tr></tbody></table>`
  );
}

/** Cron entrypoint: dispatch every report whose nextRunAt is in the past. */
export async function runDueReports(now: Date = new Date()): Promise<DispatchResult[]> {
  const due = await db
    .select()
    .from(scheduledReports)
    .where(and(eq(scheduledReports.enabled, true), lte(scheduledReports.nextRunAt, now)));

  const results: DispatchResult[] = [];
  for (const report of due) {
    const html = await renderReport(report);
    // Actually email the rendered report to each configured recipient.
    for (const to of report.recipients) {
      await sendTransactionalEmail({
        to,
        from: REPORTS_FROM,
        fromName: 'ForgeMsg Reports',
        subject: report.name,
        html,
        orgId: report.orgId,
      }).catch(() => {});
    }
    results.push({
      reportId: report.id,
      reportType: report.reportType,
      recipients: report.recipients.length,
      rendered: html,
    });
    await db
      .update(scheduledReports)
      .set({
        lastRunAt: now,
        nextRunAt: computeNextRun(report.frequency as ReportFrequency, now),
      })
      .where(eq(scheduledReports.id, report.id));
  }
  return results;
}
