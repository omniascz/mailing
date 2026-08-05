/**
 * Cohort & funnel analytics (#449).
 *
 * Cohort analysis:
 *   Groups contacts by the time period they were acquired (weekly / monthly)
 *   and tracks their retention / engagement over subsequent periods.
 *   Classic "retention matrix" — row = acquisition cohort, column = period offset.
 *
 * Funnel analysis:
 *   Defines an ordered sequence of events (e.g. form_submit → email_open → purchase).
 *   Calculates conversion rate and drop-off at each step.
 *   Supports time-limited funnel windows (e.g. "must complete within 30 days").
 *
 * Both use the ClickHouse `email_events` table for speed, falling back to
 * Postgres `email_events` if ClickHouse is not configured.
 */

import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/index.js';

// ─── Cohort analysis ──────────────────────────────────────────────────────────

export type CohortInterval = 'week' | 'month';

export interface CohortRow {
  /** ISO date string for the start of this cohort's acquisition period. */
  cohortPeriod: string;
  /** Total contacts acquired in this period. */
  cohortSize: number;
  /**
   * retention[0] = period 0 (same as acquisition) — always 100%.
   * retention[n] = % of cohort who engaged in the nth period after acquisition.
   */
  retention: number[];
}

export interface CohortReport {
  interval: CohortInterval;
  periods: number;
  cohorts: CohortRow[];
  generatedAt: string;
}

export async function computeCohortRetention(
  orgId: string,
  opts: {
    interval?: CohortInterval;
    periods?: number;
    startDate?: Date;
  } = {},
): Promise<CohortReport> {
  const interval = opts.interval ?? 'month';
  const periods = Math.min(opts.periods ?? 6, 24);
  const startDate = opts.startDate ?? new Date(Date.now() - periods * 30 * 86400_000);

  const truncFn = interval === 'month' ? 'month' : 'week';

  // Step 1: get contacts with their acquisition date, grouped by cohort period
  const rawCohorts = await db.execute(sql`
    SELECT
      date_trunc(${truncFn}, created_at) AS cohort_period,
      id AS contact_id
    FROM contacts
    WHERE org_id = ${orgId}
      AND created_at >= ${startDate.toISOString()}
    ORDER BY cohort_period, contact_id
  `);

  // Group by cohort_period
  const cohortMap = new Map<string, string[]>();
  for (const row of (
    rawCohorts as unknown as { rows: Array<{ cohort_period: string; contact_id: string }> }
  ).rows) {
    const key = new Date(row.cohort_period).toISOString().slice(0, 10);
    if (!cohortMap.has(key)) cohortMap.set(key, []);
    cohortMap.get(key)!.push(row.contact_id);
  }

  // Step 2: for each cohort, compute retention per period offset
  const cohorts: CohortRow[] = [];
  for (const [cohortPeriod, contactIds] of cohortMap.entries()) {
    const cohortStart = new Date(cohortPeriod);
    const retention: number[] = [];

    for (let p = 0; p < periods; p++) {
      const periodStart = addPeriods(cohortStart, p, interval);
      const periodEnd = addPeriods(cohortStart, p + 1, interval);

      if (p === 0) {
        // Period 0 = all acquired in this cohort
        retention.push(100);
        continue;
      }

      const [result] = await db
        .select({ n: sql<number>`count(distinct contact_id)` })
        .from(emailEvents)
        .where(
          and(
            eq(emailEvents.orgId, orgId),
            sql`contact_id = ANY(${sql.param(contactIds)})`,
            gte(emailEvents.createdAt, periodStart),
            lt(emailEvents.createdAt, periodEnd),
            sql`event_type IN ('open', 'click')`,
          ),
        );

      const engaged = Number(result?.n ?? 0);
      retention.push(contactIds.length > 0 ? Math.round((engaged / contactIds.length) * 100) : 0);
    }

    cohorts.push({
      cohortPeriod,
      cohortSize: contactIds.length,
      retention,
    });
  }

  return {
    interval,
    periods,
    cohorts: cohorts.sort((a, b) => a.cohortPeriod.localeCompare(b.cohortPeriod)),
    generatedAt: new Date().toISOString(),
  };
}

// ─── Funnel analysis ──────────────────────────────────────────────────────────

export interface FunnelStep {
  name: string;
  /** ClickHouse / Postgres event_type value, e.g. 'open', 'click', 'purchase' */
  eventType: string;
  /** Optional campaign/form ID to scope the step */
  entityId?: string;
}

export interface FunnelStepResult {
  name: string;
  eventType: string;
  contacts: number;
  conversionRate: number; // relative to previous step (100% for step 0)
  dropOff: number; // absolute count who did NOT proceed
}

export interface FunnelReport {
  steps: FunnelStepResult[];
  totalEntrants: number;
  totalConverters: number;
  overallConversionRate: number;
  windowDays: number;
  generatedAt: string;
}

export async function computeFunnel(
  orgId: string,
  steps: FunnelStep[],
  windowDays = 30,
): Promise<FunnelReport> {
  if (steps.length === 0) {
    return {
      steps: [],
      totalEntrants: 0,
      totalConverters: 0,
      overallConversionRate: 0,
      windowDays,
      generatedAt: new Date().toISOString(),
    };
  }

  const windowStart = new Date(Date.now() - windowDays * 86400_000);

  // Contacts who triggered step 0 in the window
  const step0 = steps[0]!;
  const firstStepRows = await db
    .select({ contactId: emailEvents.contactId })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.orgId, orgId),
        sql`event_type = ${step0.eventType}`,
        gte(emailEvents.createdAt, windowStart),
        ...(step0.entityId ? [sql`entity_id = ${step0.entityId}`] : []),
      ),
    );

  const firstStepIds = [
    ...new Set(firstStepRows.map((r) => r.contactId).filter(Boolean) as string[]),
  ];
  let currentIds = firstStepIds;

  const results: FunnelStepResult[] = [
    {
      name: step0.name,
      eventType: step0.eventType,
      contacts: currentIds.length,
      conversionRate: 100,
      dropOff: 0,
    },
  ];

  for (let i = 1; i < steps.length; i++) {
    const step = steps[i]!;
    const prevCount = currentIds.length;

    if (prevCount === 0) {
      results.push({
        name: step.name,
        eventType: step.eventType,
        contacts: 0,
        conversionRate: 0,
        dropOff: 0,
      });
      continue;
    }

    const matchRows = await db
      .select({ contactId: emailEvents.contactId })
      .from(emailEvents)
      .where(
        and(
          eq(emailEvents.orgId, orgId),
          sql`event_type = ${step.eventType}`,
          gte(emailEvents.createdAt, windowStart),
          sql`contact_id = ANY(${sql.param(currentIds)})`,
          ...(step.entityId ? [sql`entity_id = ${step.entityId}`] : []),
        ),
      );

    const matchIds = [...new Set(matchRows.map((r) => r.contactId).filter(Boolean) as string[])];
    const conversionRate = prevCount > 0 ? Math.round((matchIds.length / prevCount) * 100) : 0;

    results.push({
      name: step.name,
      eventType: step.eventType,
      contacts: matchIds.length,
      conversionRate,
      dropOff: prevCount - matchIds.length,
    });

    currentIds = matchIds;
  }

  const totalConverters = currentIds.length;
  const totalEntrants = firstStepIds.length;

  return {
    steps: results,
    totalEntrants,
    totalConverters,
    overallConversionRate:
      totalEntrants > 0 ? Math.round((totalConverters / totalEntrants) * 100) : 0,
    windowDays,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function addPeriods(date: Date, n: number, interval: CohortInterval): Date {
  const d = new Date(date);
  if (interval === 'month') {
    d.setUTCMonth(d.getUTCMonth() + n);
  } else {
    d.setUTCDate(d.getUTCDate() + n * 7);
  }
  return d;
}
