/**
 * Custom report builder — persistence + data pull.
 *
 * Saved report definitions (metrics × dimension + optional filters) are stored
 * in custom_reports; runReport pulls the matching email events and feeds the
 * pure aggregation engine (pure.ts).
 */

import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/index.js';
import { customReports, type CustomReport } from '../../db/schema/custom-reports.js';
import type { CustomReportDefinition } from '../../db/schema/custom-reports.js';
import { AppError } from '../../lib/app-error.js';
import {
  computeReport,
  REPORT_METRICS,
  REPORT_DIMENSIONS,
  type ReportDefinition,
  type ReportEvent,
  type ReportResult,
} from './pure.js';

export { REPORT_METRICS, REPORT_DIMENSIONS };
export type { CustomReportDefinition };

// ─── CRUD ──────────────────────────────────────────────────────────────────

export async function listReports(orgId: string): Promise<CustomReport[]> {
  return db.select().from(customReports).where(eq(customReports.orgId, orgId));
}

export async function getReport(orgId: string, id: string): Promise<CustomReport> {
  const [row] = await db
    .select()
    .from(customReports)
    .where(and(eq(customReports.id, id), eq(customReports.orgId, orgId)))
    .limit(1);
  if (!row) throw AppError.notFound('CustomReport');
  return row;
}

export async function createReport(
  orgId: string,
  name: string,
  definition: CustomReportDefinition,
): Promise<CustomReport> {
  const [row] = await db
    .insert(customReports)
    .values({ orgId, name, definition })
    .returning();
  return row!;
}

export async function updateReport(
  orgId: string,
  id: string,
  patch: { name?: string; definition?: CustomReportDefinition },
): Promise<CustomReport> {
  const [row] = await db
    .update(customReports)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(customReports.id, id), eq(customReports.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('CustomReport');
  return row;
}

export async function deleteReport(orgId: string, id: string): Promise<void> {
  const [row] = await db
    .delete(customReports)
    .where(and(eq(customReports.id, id), eq(customReports.orgId, orgId)))
    .returning({ id: customReports.id });
  if (!row) throw AppError.notFound('CustomReport');
}

// ─── Execution ─────────────────────────────────────────────────────────────

export interface RunOptions {
  /** Override / supply the date window. */
  from?: Date;
  to?: Date;
  /** Restrict to a single campaign. */
  campaignId?: string;
}

/**
 * Pull the events matching a definition's filters and aggregate them. `from`/`to`
 * override the definition's `rangeDays`; a campaign filter narrows the pull.
 */
export async function runReport(
  orgId: string,
  definition: CustomReportDefinition,
  opts: RunOptions = {},
): Promise<ReportResult & { from: string | null; to: string | null }> {
  const to = opts.to ?? new Date();
  const from =
    opts.from ??
    (definition.rangeDays
      ? new Date(to.getTime() - definition.rangeDays * 86_400_000)
      : undefined);
  const campaignId = opts.campaignId ?? definition.campaignId;

  const conds = [eq(emailEvents.orgId, orgId)];
  if (from) conds.push(gte(emailEvents.createdAt, from));
  if (to) conds.push(lte(emailEvents.createdAt, to));
  if (campaignId) conds.push(eq(emailEvents.campaignId, campaignId));

  const rows = await db
    .select({
      eventType: emailEvents.eventType,
      createdAt: emailEvents.createdAt,
      campaignId: emailEvents.campaignId,
      contactId: emailEvents.contactId,
    })
    .from(emailEvents)
    .where(and(...conds));

  const events: ReportEvent[] = rows.map((r) => ({
    eventType: r.eventType,
    createdAt: r.createdAt,
    campaignId: r.campaignId,
    contactId: r.contactId,
  }));

  const def: ReportDefinition = {
    metrics: definition.metrics,
    dimension: definition.dimension,
  };
  const result = computeReport(events, def);
  return {
    ...result,
    from: from ? from.toISOString() : null,
    to: to.toISOString(),
  };
}

/** Run a saved report by id. */
export async function runSavedReport(
  orgId: string,
  id: string,
  opts: RunOptions = {},
): Promise<ReportResult & { from: string | null; to: string | null; name: string }> {
  const report = await getReport(orgId, id);
  const result = await runReport(orgId, report.definition, opts);
  return { ...result, name: report.name };
}
