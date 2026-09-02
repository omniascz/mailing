/**
 * Cohort analysis — group contacts by signup week/month and track engagement
 * over the following N periods. Output suitable for retention heatmaps.
 */

import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';

export type CohortPeriod = 'week' | 'month';

export interface CohortRow {
  cohort: string; // ISO date of cohort start
  size: number; // contacts in cohort
  retention: number[]; // engagement per offset period (count of contacts active)
}

/** Cohort by sign-up date, retention measured by any email engagement in each subsequent period. */
export async function signupCohorts(
  orgId: string,
  opts: {
    period?: CohortPeriod;
    periods?: number;
  } = {},
): Promise<CohortRow[]> {
  const period = opts.period ?? 'month';
  const periods = Math.min(24, Math.max(1, opts.periods ?? 6));
  const trunc = period === 'week' ? 'week' : 'month';

  /**
   * How many periods after its cohort a bucket falls.
   *
   * This replaces `EXTRACT(EPOCH FROM (e.bucket - b.cohort)) / EXTRACT(EPOCH
   * FROM INTERVAL ${interval})`, which had two problems.
   *
   * The first was fatal: `${interval}` is a bind parameter, and `INTERVAL $5`
   * is a syntax error — INTERVAL takes a literal, so the statement never
   * planned and the route answered 500 from the day it was written.
   *
   * The second would have survived the obvious repair. Dividing epochs treats a
   * month as the 30 days Postgres gives `EXTRACT(EPOCH FROM INTERVAL '1
   * month')`, so a contact engaging in the month after a 31-day month lands at
   * offset 1.03 and one after two of them at 2.07 — `Math.floor` then puts both
   * in the right bucket by luck, until a long enough run of long months walks a
   * row into the next column. Both sides are already `date_trunc`ed to the
   * period, so counting whole periods is exact:
   *
   *   month  years*12 + months of age(), which knows how long each month was
   *   week   whole days / 7, and a week is always 7 days
   *
   * Built by switch from a closed union rather than interpolated, so there is
   * no user input in the fragment and nothing to bind.
   */
  const offsetExpr =
    period === 'week'
      ? sql`(EXTRACT(DAY FROM (e.bucket - b.cohort)) / 7)::int`
      : sql`(EXTRACT(YEAR FROM age(e.bucket, b.cohort)) * 12
             + EXTRACT(MONTH FROM age(e.bucket, b.cohort)))::int`;

  const rs = await db.execute<{
    cohort: string;
    size: string;
    period_offset: number;
    active: string;
  }>(sql`
    WITH base AS (
      SELECT id, date_trunc(${trunc}, created_at) AS cohort
      FROM contacts WHERE org_id = ${orgId}::uuid AND deleted_at IS NULL
    ),
    engagement AS (
      SELECT contact_id, date_trunc(${trunc}, created_at) AS bucket
      FROM email_events WHERE org_id = ${orgId}::uuid AND event_type IN ('open','click')
      GROUP BY contact_id, bucket
    )
    SELECT
      to_char(b.cohort, 'YYYY-MM-DD') AS cohort,
      COUNT(DISTINCT b.id)::text AS size,
      ${offsetExpr} AS period_offset,
      COUNT(DISTINCT e.contact_id)::text AS active
    FROM base b LEFT JOIN engagement e ON e.contact_id = b.id AND e.bucket >= b.cohort
    GROUP BY b.cohort, period_offset
    ORDER BY b.cohort DESC, period_offset
    LIMIT 1000
  `);

  const map = new Map<string, CohortRow>();
  for (const r of rs as unknown as Array<{
    cohort: string;
    size: string;
    period_offset: number;
    active: string;
  }>) {
    if (!map.has(r.cohort)) {
      map.set(r.cohort, {
        cohort: r.cohort,
        size: Number(r.size),
        retention: Array(periods).fill(0),
      });
    }
    const off = Math.floor(Number(r.period_offset ?? 0));
    if (off >= 0 && off < periods) {
      map.get(r.cohort)!.retention[off] = Number(r.active);
    }
  }
  return [...map.values()];
}
