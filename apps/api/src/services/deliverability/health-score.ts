/**
 * Email health-score service (#352/#397).
 *
 * Aggregates raw email events into a composite domain/IP health score by
 * delegating to `computeEmailHealthScore` in pure.ts.
 */

import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { computeEmailHealthScore, type EmailHealthScore } from './pure.js';

export interface HealthScoreWindowOptions {
  orgId: string;
  /** Window in days (default 30). */
  days?: number;
  /** Restrict to a specific sending domain (e.g. "mail.forgemsg.cz"). */
  domain?: string;
  /** Restrict to a specific sending IP. */
  ip?: string;
}

/**
 * Pull aggregate email-event counters for the window and compute the health
 * score. The underlying `email_events` table holds one row per event (sent /
 * delivered / bounced / complained / opened / clicked / unsubscribed).
 */
export async function computeOrgHealth(
  opts: HealthScoreWindowOptions,
): Promise<EmailHealthScore & { windowDays: number; scope: string }> {
  const days = opts.days ?? 30;
  const since = sql`now() - (${days} * INTERVAL '1 day')`;

  const whereClauses: ReturnType<typeof sql>[] = [sql`org_id = ${opts.orgId}`];
  if (opts.domain) whereClauses.push(sql`sending_domain = ${opts.domain}`);
  if (opts.ip) whereClauses.push(sql`sending_ip = ${opts.ip}`);
  const whereSql = whereClauses.reduce((acc, cur, i) => (i === 0 ? cur : sql`${acc} AND ${cur}`));

  const result = await db.execute<{
    sends: number;
    delivered: number;
    bounces: number;
    hard_bounces: number;
    soft_bounces: number;
    complaints: number;
    opens: number;
    clicks: number;
    unsubscribes: number;
    blocks: number;
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'sent')::int AS sends,
      COUNT(*) FILTER (WHERE event_type = 'delivered')::int AS delivered,
      COUNT(*) FILTER (WHERE event_type = 'bounced')::int AS bounces,
      COUNT(*) FILTER (WHERE event_type = 'bounced' AND bounce_type = 'hard')::int AS hard_bounces,
      COUNT(*) FILTER (WHERE event_type = 'bounced' AND bounce_type = 'soft')::int AS soft_bounces,
      COUNT(*) FILTER (WHERE event_type = 'complained')::int AS complaints,
      COUNT(*) FILTER (WHERE event_type = 'opened')::int AS opens,
      COUNT(*) FILTER (WHERE event_type = 'clicked')::int AS clicks,
      COUNT(*) FILTER (WHERE event_type = 'unsubscribed')::int AS unsubscribes,
      COUNT(*) FILTER (WHERE event_type = 'blocked')::int AS blocks
    FROM email_events
    WHERE ${whereSql}
      AND created_at >= ${since}
  `);

  const row =
    result[0] ??
    ({
      sends: 0,
      delivered: 0,
      bounces: 0,
      hard_bounces: 0,
      soft_bounces: 0,
      complaints: 0,
      opens: 0,
      clicks: 0,
      unsubscribes: 0,
      blocks: 0,
    } as const);

  const score = computeEmailHealthScore({
    sends: row.sends,
    delivered: row.delivered,
    bounces: row.bounces,
    hardBounces: row.hard_bounces,
    softBounces: row.soft_bounces,
    complaints: row.complaints,
    opens: row.opens,
    clicks: row.clicks,
    unsubscribes: row.unsubscribes,
    blocks: row.blocks,
  });

  const scopeParts: string[] = [];
  if (opts.domain) scopeParts.push(`domain=${opts.domain}`);
  if (opts.ip) scopeParts.push(`ip=${opts.ip}`);
  const scope = scopeParts.length > 0 ? scopeParts.join(', ') : 'org';

  return { ...score, windowDays: days, scope };
}
