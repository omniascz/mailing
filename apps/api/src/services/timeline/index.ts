/**
 * Customer Timeline — chronological view of every interaction recorded
 * for a contact: email events, revenue events, support tickets, workflow runs.
 *
 * Each branch of the UNION carries its own timestamp column — email_events and
 * helpdesk_tickets use `created_at`, revenue_events uses `occurred_at`,
 * workflow_runs uses `started_at` — so the `before` cursor has to be built per
 * branch rather than shared. A single shared fragment is what previously
 * pushed `created_at` onto revenue_events, where no such column exists.
 */

import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';

export interface TimelineEntry {
  at: Date;
  source: 'email' | 'revenue' | 'ticket' | 'workflow' | 'sms' | 'call';
  type: string;
  data: Record<string, unknown>;
}

export async function getTimeline(
  orgId: string,
  contactId: string,
  opts?: {
    limit?: number;
    before?: Date;
  },
): Promise<TimelineEntry[]> {
  const limit = Math.min(500, opts?.limit ?? 100);
  /** `before` cursor for one branch, encoded against that branch's own column. */
  const before = (column: 'created_at' | 'occurred_at' | 'started_at') =>
    opts?.before
      ? sql`AND ${sql.raw(column)} < ${opts.before.toISOString()}::timestamptz`
      : sql``;

  const rs = await db.execute<{
    at: Date;
    source: string;
    type: string;
    data: Record<string, unknown>;
  }>(sql`
    SELECT created_at AS at, 'email' AS source, event_type::text AS type,
      jsonb_build_object('campaignId', campaign_id) AS data
    FROM email_events
    WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid ${before('created_at')}
    UNION ALL
    SELECT occurred_at, 'revenue', 'purchase',
      jsonb_build_object('orderId', order_id, 'value', amount, 'currency', currency)
    FROM revenue_events
    WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid ${before('occurred_at')}
    UNION ALL
    SELECT created_at, 'ticket', status,
      jsonb_build_object('ticketId', id, 'subject', subject, 'priority', priority)
    FROM helpdesk_tickets
    WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid ${before('created_at')}
    UNION ALL
    SELECT started_at, 'workflow', status::text,
      jsonb_build_object('runId', id, 'workflowId', workflow_id)
    FROM workflow_runs
    WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid ${before('started_at')}
    ORDER BY at DESC
    LIMIT ${limit}
  `);

  return (
    rs as unknown as Array<{
      at: Date;
      source: string;
      type: string;
      data: Record<string, unknown>;
    }>
  ).map((r) => ({
    at: new Date(r.at),
    source: r.source as TimelineEntry['source'],
    type: r.type,
    data: r.data ?? {},
  }));
}
