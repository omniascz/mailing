/**
 * What each sending address is doing to its own reputation.
 *
 * `dedicated_ips.reputation_score`, `bounce_rate` and `complaint_rate` have
 * stood at zero since the day they were added. Their only writer,
 * `updateReputation`, is a setter — it stores numbers a caller hands it — and
 * it had no caller, because nobody could compute the numbers: `email_events`
 * carried no sending address at all. `ip_address` on that table is the
 * RECIPIENT's, filled from the tracking pixel's `X-Forwarded-For`, and `isp` is
 * the RECEIVING provider. A bounce could not be attributed to the address that
 * caused it.
 *
 * The worker now stamps `metadata.sendingIp` on every event it records for a
 * message the API routed to a dedicated address, and this is what reads it.
 *
 * ─── The window, and why 30 days rather than the 24 hours the column says ────
 *
 * The column comments say "rolling 24h". That was written before anything
 * computed them, and 24 hours cannot carry this measurement: a warming address
 * sends 50 messages on day one, so one hard bounce is a 2% rate and two are 4%
 * — a number that swings between "fine" and "shut it down" on single events.
 * Thirty days is the window ISPs themselves reason over and the one
 * `computeOrgHealth` already defaults to, so the per-IP figure and the org-wide
 * figure are comparable rather than two different questions wearing one name.
 *
 * Nothing is done about older events. They age out of the window by being
 * older than it, and the nightly archive job moves them to object storage on
 * its own schedule; this query simply stops seeing them.
 *
 * ─── An address that has sent nothing is not an address with no problems ─────
 *
 * This is the part that decides whether the numbers are worth having.
 *
 * `reputation_score` is `NOT NULL DEFAULT '0'`, so a fresh row already reads as
 * the worst possible score. `computeEmailHealthScore` has the opposite bias: it
 * returns 100 and grade A when `sends === 0`, deliberately, "so empty domains
 * don't show red dashboards before they've sent anything". Either one applied
 * to an address with no history is a confident answer to a question nobody can
 * answer yet — #122's shape.
 *
 * So an address with no attributable events in the window is SKIPPED: no score,
 * no rates, no timestamp. `reputation_updated_at IS NULL` is then the honest
 * reading — "never scored" — and it is distinguishable from a real 0, which
 * only ever arrives with a timestamp beside it.
 *
 * ─── Events that do not name an address are excluded, not counted as clean ───
 *
 * A message the engine routed for itself (SENDING_IPS + warmup claim) or one
 * that went out on the shared pool carries no `sendingIp`, because nothing in
 * this process knows which address the engine or the kernel chose. Those events
 * match no address here and are left out of every denominator. They are not
 * silently folded into "an address with no bounces", which would dilute a real
 * rate towards zero — the direction that hides a problem.
 */

import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { computeEmailHealthScore } from './pure.js';
import { updateReputation } from '../dedicated-ips/index.js';

/** The window every rate here is measured over. See the note above. */
export const REPUTATION_WINDOW_DAYS = 30;

export interface IpReputation {
  ipId: string;
  ipAddress: string;
  sends: number;
  bounceRatePct: number;
  complaintRatePct: number;
  score: number;
}

export interface ReputationSweepSummary {
  /** Addresses considered. */
  examined: number;
  /** Addresses that had attributable events and were scored. */
  scored: number;
  /**
   * Addresses left untouched because nothing in the window names them. Their
   * `reputation_updated_at` stays NULL, which is what "never scored" looks
   * like — see the note above on why that is not the same as a zero.
   */
  skippedNoHistory: number;
  details: IpReputation[];
}

interface CountRow extends Record<string, unknown> {
  ip_id: string;
  ip_address: string;
  sends: number;
  delivered: number;
  bounces: number;
  hard_bounces: number;
  complaints: number;
  blocks: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
}

/**
 * Count each dedicated address's events in the window, joined on the value the
 * worker stamped.
 *
 * The join is `metadata->>'sendingIp'`, not a column: a column on
 * `email_events` is a field on the hottest table in the schema, and it earns
 * its place only once something reports over months rather than over thirty
 * days. Until then the JSONB the row already carries is enough, and it costs no
 * migration.
 */
async function countByIp(): Promise<CountRow[]> {
  const rows = await db.execute<CountRow>(sql`
    SELECT
      d.id   AS ip_id,
      d.ip_address,
      COUNT(*) FILTER (WHERE e.event_type = 'send')::int      AS sends,
      COUNT(*) FILTER (WHERE e.event_type = 'deliver')::int   AS delivered,
      COUNT(*) FILTER (WHERE e.event_type = 'bounce')::int    AS bounces,
      COUNT(*) FILTER (WHERE e.event_type = 'bounce' AND e.bounce_type = 'hard')::int  AS hard_bounces,
      COUNT(*) FILTER (WHERE e.event_type = 'bounce' AND e.bounce_type = 'block')::int AS blocks,
      COUNT(*) FILTER (WHERE e.event_type = 'complaint')::int AS complaints,
      COUNT(*) FILTER (WHERE e.event_type = 'open')::int      AS opens,
      COUNT(*) FILTER (WHERE e.event_type = 'click')::int     AS clicks,
      COUNT(*) FILTER (WHERE e.event_type = 'unsubscribe')::int AS unsubscribes
    FROM dedicated_ips d
    LEFT JOIN email_events e
      ON e.metadata->>'sendingIp' = d.ip_address
     AND e.created_at >= now() - (${REPUTATION_WINDOW_DAYS} * INTERVAL '1 day')
    GROUP BY d.id, d.ip_address
  `);
  return rows as unknown as CountRow[];
}

/**
 * Score every dedicated address from the events attributable to it, and store
 * the result.
 *
 * Runs from the daily-run orchestrator alongside the six aggregates already
 * there, rather than from its own queue or from the event write path. The
 * figure moves slowly and recomputing it per event would mean an aggregate
 * query on every send.
 */
export async function refreshAllIpReputations(): Promise<ReputationSweepSummary> {
  const rows = await countByIp();

  const summary: ReputationSweepSummary = {
    examined: rows.length,
    scored: 0,
    skippedNoHistory: 0,
    details: [],
  };

  for (const r of rows) {
    if (r.sends === 0) {
      // Nothing in the window names this address. Writing anything here would
      // be inventing an answer; leaving reputation_updated_at NULL says so.
      summary.skippedNoHistory++;
      continue;
    }

    // The org-wide scorer, not a second one written for this file. Its
    // thresholds — bounce over 2%, hard bounce over 0.5%, complaint over 0.1%,
    // blocks over 1% — are the calibration this product already reasons with,
    // and two formulas answering "how healthy is this sender" would disagree
    // the first time somebody compared a per-IP score with the org score.
    //
    // Its `sends === 0` branch returns 100/A on purpose, for dashboards. That
    // branch is unreachable from here: the guard above returns first, so an
    // address with no history is never handed to it.
    const health = computeEmailHealthScore({
      sends: r.sends,
      delivered: r.delivered,
      bounces: r.bounces,
      hardBounces: r.hard_bounces,
      softBounces: Math.max(0, r.bounces - r.hard_bounces - r.blocks),
      complaints: r.complaints,
      opens: r.opens,
      clicks: r.clicks,
      unsubscribes: r.unsubscribes,
      blocks: r.blocks,
    });

    // Stored as percentages, matching the column comments and what an operator
    // reads on the screen. decimal(5,2) holds 0.00–999.99, so a rate is capped
    // at two decimals — 0.1% complaint arrives as 0.10, not as 0.001.
    const bounceRatePct = Math.round((r.bounces / r.sends) * 10000) / 100;
    const complaintDenominator = r.delivered > 0 ? r.delivered : r.sends;
    const complaintRatePct = Math.round((r.complaints / complaintDenominator) * 10000) / 100;

    await updateReputation(r.ip_id, {
      reputationScore: health.score,
      bounceRate: bounceRatePct,
      complaintRate: complaintRatePct,
    });

    summary.scored++;
    summary.details.push({
      ipId: r.ip_id,
      ipAddress: r.ip_address,
      sends: r.sends,
      bounceRatePct,
      complaintRatePct,
      score: health.score,
    });
  }

  return summary;
}
