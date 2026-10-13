/**
 * Reconciliation of the plan send counter (Z136): does each organisation's
 * counter row for its current period say what email_events says?
 *
 * The counter (plan_send_counters, filled by the trigger of migrations 0029
 * and 0030) is what the plan limit is checked against and, since Z137, what
 * email is invoiced from. The truth it must equal is plan_send_truth(org,
 * period start): the non-sandboxed `send` rows in the period — one row per
 * recipient, which a unique index keeps from being written twice. (Until Z137
 * it was each message once, counted at read time; the unit is now the
 * recipient, the same one the plan and the invoice count.) This asks both for
 * every organisation that has a row or a send in its current period, and names
 * each one where they differ.
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

// ─── Per-message invariants (Z138) ───────────────────────────────────────────

export interface EventInvariantBreach {
  orgId: string;
  slug: string;
  messageId: string;
  send: number;
  deliver: number;
  /** Bounces said in the SMTP session; a DSN bounce (metadata source 'verp') is not one. */
  bounce: number;
  failed: number;
  rule: 'deliver_exceeds_send' | 'outcomes_exceed_send';
}

/**
 * Two things that must hold for every message with an event in the
 * organisation's current billing period, counted over all of its rows:
 *
 *  1. deliver ≤ send. Every path writes the `send` row no later than the
 *     delivery: at acceptance (transactional, /emails, tests), or with it
 *     (campaign mail, which mta-sender records as `send` only when delivered).
 *  2. deliver + bounce + failed ≤ greatest(send, 1) — one ending per
 *     recipient. Two measured cases shape it (Z138 probe), and neither is a
 *     duplicate:
 *       - a campaign message that bounced or failed has no `send` row at all
 *         (send is written on delivery), so it may have one ending against
 *         zero sends — hence greatest(send, 1);
 *       - a DSN (inbound, VERP) arrives after the receiving server accepted
 *         the message, so it follows a `deliver`; those bounces are not
 *         counted here, the bounce said in the SMTP session is.
 *     What it does catch: a second ending for one recipient — a delivery or a
 *     bounce stored twice, or a job run again after a hard bounce, which
 *     finds the address suppressed and records `failed` beside the bounce.
 *
 * A breach is named by organisation and message id.
 */
export async function checkEventInvariants(
  opts: { orgId?: string } = {},
): Promise<{ messages: number; breaches: EventInvariantBreach[] }> {
  const orgFilter = opts.orgId ? sql`AND o.id = ${opts.orgId}::uuid` : sql``;
  const rows = (await db.execute(sql`
    WITH periods AS (
      SELECT o.id AS org_id, o.slug, plan_period_start(o.id) AS ps
      FROM organizations o WHERE true ${orgFilter}
    ),
    msgs AS (
      SELECT DISTINCT e.org_id, e.message_id
      FROM email_events e JOIN periods p ON p.org_id = e.org_id
      WHERE e.created_at >= p.ps AND e.message_id IS NOT NULL
        AND e.event_type IN ('send', 'deliver', 'bounce', 'failed')
    )
    SELECT m.org_id, p.slug, m.message_id,
           count(*) FILTER (WHERE e.event_type = 'send')::int AS send,
           count(*) FILTER (WHERE e.event_type = 'deliver')::int AS deliver,
           count(*) FILTER (WHERE e.event_type = 'bounce'
                             AND coalesce(e.metadata->>'source', '') <> 'verp')::int AS bounce,
           count(*) FILTER (WHERE e.event_type = 'failed')::int AS failed
    FROM msgs m
    JOIN periods p ON p.org_id = m.org_id
    JOIN email_events e ON e.org_id = m.org_id AND e.message_id = m.message_id
    WHERE e.event_type IN ('send', 'deliver', 'bounce', 'failed')
    GROUP BY m.org_id, p.slug, m.message_id
  `)) as unknown as Array<{
    org_id: string;
    slug: string;
    message_id: string;
    send: number;
    deliver: number;
    bounce: number;
    failed: number;
  }>;
  const breaches: EventInvariantBreach[] = [];
  for (const r of rows) {
    const counts = {
      send: Number(r.send),
      deliver: Number(r.deliver),
      bounce: Number(r.bounce),
      failed: Number(r.failed),
    };
    const base = { orgId: r.org_id, slug: r.slug, messageId: r.message_id, ...counts };
    if (counts.deliver > counts.send) breaches.push({ ...base, rule: 'deliver_exceeds_send' });
    else if (counts.deliver + counts.bounce + counts.failed > Math.max(counts.send, 1)) {
      breaches.push({ ...base, rule: 'outcomes_exceed_send' });
    }
  }
  return { messages: rows.length, breaches };
}
