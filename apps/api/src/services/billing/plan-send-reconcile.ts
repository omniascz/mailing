/**
 * Reconciliation of the plan send counter (Z136): does each organisation's
 * counter row for its current period say what email_events says?
 *
 * The counter (plan_send_counters, filled by the trigger of migration 0029) is
 * what the plan limit is checked against. The truth it must equal is
 * plan_send_truth(org, period start): the messages with a `send` row in the
 * period, each message once. This asks both for every organisation that has a
 * row or a send in its current period, and names each one where they differ.
 *
 * Run on demand, not as a job: `pnpm --filter @forgemsg/api reconcile:plan-sends`
 * (scripts/reconcile-plan-send-counters.ts). The truth is the full count the
 * counter exists to keep off the send path, so running it on a timer would put
 * that scan back; and the nightly archive (archive-email-events) deletes
 * `send` rows older than 30 days while a billing period can be 31, so near the
 * end of such a period the truth drops below the counter and a job would page
 * someone about events that were archived, not lost. `mayBeArchived` marks
 * those rows; a difference there is expected to be counter > truth.
 */
import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';

export interface PlanSendDrift {
  orgId: string;
  slug: string;
  periodStart: Date;
  /** What the counter row says; 0 when the period has sends but no row. */
  counter: number;
  /** What email_events says. */
  truth: number;
  /** counter − truth. */
  diff: number;
  /** The period reaches past the archive cutoff, so sends may have been archived. */
  mayBeArchived: boolean;
}

export interface PlanSendReconciliation {
  checked: number;
  drift: PlanSendDrift[];
}

export async function reconcilePlanSendCounters(
  opts: { orgId?: string; archiveCutoffDays?: number } = {},
): Promise<PlanSendReconciliation> {
  const cutoffDays = opts.archiveCutoffDays ?? Number(process.env.ARCHIVE_CUTOFF_DAYS ?? '30');
  const orgFilter = opts.orgId ? sql`AND o.id = ${opts.orgId}::uuid` : sql``;
  const rows = (await db.execute(sql`
    SELECT o.id AS org_id, o.slug, p.ps AS period_start,
           coalesce(c.sends, 0) AS counter,
           plan_send_truth(o.id, p.ps) AS truth
    FROM organizations o
    CROSS JOIN LATERAL (SELECT plan_period_start(o.id) AS ps) p
    LEFT JOIN plan_send_counters c ON c.org_id = o.id AND c.period_start = p.ps
    WHERE (
      c.org_id IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM email_events e
        WHERE e.org_id = o.id AND e.event_type = 'send' AND e.created_at >= p.ps
      )
    ) ${orgFilter}
    ORDER BY o.slug
  `)) as unknown as Array<{
    org_id: string;
    slug: string;
    period_start: Date | string;
    counter: number;
    truth: number;
  }>;

  const cutoff = Date.now() - cutoffDays * 86_400_000;
  const drift: PlanSendDrift[] = [];
  for (const r of rows) {
    const counter = Number(r.counter);
    const truth = Number(r.truth);
    if (counter === truth) continue;
    const periodStart = new Date(r.period_start);
    drift.push({
      orgId: r.org_id,
      slug: r.slug,
      periodStart,
      counter,
      truth,
      diff: counter - truth,
      mayBeArchived: periodStart.getTime() < cutoff,
    });
  }
  return { checked: rows.length, drift };
}
