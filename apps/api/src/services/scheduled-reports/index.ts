/**
 * Scheduled reports — generate periodic analytics digests and email them
 * to a configurable recipient list. Designed to be triggered by a cron worker.
 */

import { and, eq, lte } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { scheduledReports, type ScheduledReport } from '../../db/schema/index.js';
import { getOrgDailyStats } from '../analytics/index.js';
import { AppError } from '../../lib/app-error.js';

export type ReportFrequency = 'daily' | 'weekly' | 'monthly';
export type ReportType = 'org_overview' | 'campaign_summary' | 'list_growth' | 'rfm_distribution';

export function computeNextRun(frequency: ReportFrequency, from: Date = new Date()): Date {
  const next = new Date(from);
  if (frequency === 'daily') next.setUTCDate(next.getUTCDate() + 1);
  else if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCHours(8, 0, 0, 0);
  return next;
}

export async function createScheduledReport(orgId: string, input: {
  name: string; reportType: ReportType; frequency: ReportFrequency;
  recipients: string[]; params?: Record<string, unknown>;
}): Promise<ScheduledReport> {
  if (input.recipients.length === 0) throw AppError.badRequest('At least one recipient required');
  const [row] = await db.insert(scheduledReports).values({
    orgId, name: input.name, reportType: input.reportType,
    frequency: input.frequency, recipients: input.recipients,
    params: input.params ?? {},
    nextRunAt: computeNextRun(input.frequency),
  }).returning();
  return row!;
}

export async function listScheduledReports(orgId: string): Promise<ScheduledReport[]> {
  return db.select().from(scheduledReports).where(eq(scheduledReports.orgId, orgId));
}

export async function deleteScheduledReport(orgId: string, id: string): Promise<void> {
  await db.delete(scheduledReports)
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
  return `<h1>${report.name}</h1><p>Report type ${report.reportType} not yet implemented.</p>`;
}

/** Cron entrypoint: dispatch every report whose nextRunAt is in the past. */
export async function runDueReports(now: Date = new Date()): Promise<DispatchResult[]> {
  const due = await db.select().from(scheduledReports).where(
    and(eq(scheduledReports.enabled, true), lte(scheduledReports.nextRunAt, now)),
  );

  const results: DispatchResult[] = [];
  for (const report of due) {
    const html = await renderReport(report);
    // Defer actual email delivery to the workers queue. Here we just record dispatch.
    results.push({
      reportId: report.id, reportType: report.reportType,
      recipients: report.recipients.length, rendered: html,
    });
    await db.update(scheduledReports).set({
      lastRunAt: now,
      nextRunAt: computeNextRun(report.frequency as ReportFrequency, now),
    }).where(eq(scheduledReports.id, report.id));
  }
  return results;
}
