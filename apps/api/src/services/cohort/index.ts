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
  const interval = period === 'week' ? '7 days' : '1 month';

  const rs = await db.execute<{
    cohort: string;
    size: string;
    offset: number;
    active: string;
  }>(sql`
    WITH base AS (
      SELECT id, date_trunc(${trunc}, created_at) AS cohort
      FROM contacts WHERE org_id = ${orgId}::uuid AND deleted_at IS NULL
    ),
    engagement AS (
      SELECT contact_id, date_trunc(${trunc}, created_at) AS bucket
      FROM email_events WHERE org_id = ${orgId} AND event_type IN ('open','click')
      GROUP BY contact_id, bucket
    )
    SELECT
      to_char(b.cohort, 'YYYY-MM-DD') AS cohort,
      COUNT(DISTINCT b.id)::text AS size,
      EXTRACT(EPOCH FROM (e.bucket - b.cohort)) / EXTRACT(EPOCH FROM INTERVAL ${interval})::int AS offset,
      COUNT(DISTINCT e.contact_id)::text AS active
    FROM base b LEFT JOIN engagement e ON e.contact_id = b.id AND e.bucket >= b.cohort
    GROUP BY b.cohort, offset
    ORDER BY b.cohort DESC, offset
    LIMIT 1000
  `);

  const map = new Map<string, CohortRow>();
  for (const r of rs as unknown as Array<{
    cohort: string;
    size: string;
    offset: number;
    active: string;
  }>) {
    if (!map.has(r.cohort)) {
      map.set(r.cohort, {
        cohort: r.cohort,
        size: Number(r.size),
        retention: Array(periods).fill(0),
      });
    }
    const off = Math.floor(Number(r.offset ?? 0));
    if (off >= 0 && off < periods) {
      map.get(r.cohort)!.retention[off] = Number(r.active);
    }
  }
  return [...map.values()];
}
