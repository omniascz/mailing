/**
 * Customer Timeline — chronological view of every interaction recorded
 * for a contact: email events, revenue events, support tickets, workflow runs.
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
  const beforeClause = opts?.before ? sql`AND created_at < ${opts.before}` : sql``;

  const rs = await db.execute<{
    at: Date;
    source: string;
    type: string;
    data: Record<string, unknown>;
  }>(sql`
    SELECT created_at AS at, 'email' AS source, event_type AS type,
      jsonb_build_object('campaignId', campaign_id, 'workflowRunId', workflow_run_id) AS data
    FROM email_events
    WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid ${beforeClause}
    UNION ALL
    SELECT created_at, 'revenue', event_type,
      jsonb_build_object('orderId', order_id, 'value', value, 'currency', currency)
    FROM revenue_events
    WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid ${beforeClause}
    UNION ALL
    SELECT created_at, 'ticket', status,
      jsonb_build_object('ticketId', id, 'subject', subject, 'priority', priority)
    FROM helpdesk_tickets
    WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid ${beforeClause}
    UNION ALL
    SELECT started_at, 'workflow', status,
      jsonb_build_object('runId', id, 'workflowId', workflow_id)
    FROM workflow_runs
    WHERE contact_id = ${contactId}::uuid ${opts?.before ? sql`AND started_at < ${opts.before}` : sql``}
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
