/**
 * Chat / helpdesk analytics (#247).
 *
 * Metrics computed from the helpdesk_tickets + ticket_messages tables:
 *   - Volume: tickets opened per period, per channel
 *   - Response time: seconds from ticket open → first agent reply
 *   - Resolution time: seconds from ticket open → close
 *   - CSAT: average satisfaction score (collected via separate API call)
 *   - Agent performance: per-agent volume, avg response time, avg resolution
 *   - Backlog: open tickets by age bucket
 */

import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { helpdeskTickets, ticketMessages } from '../../db/schema/helpdesk.js';

export interface HelpdeskAnalyticsInput {
  orgId: string;
  from: Date;
  to: Date;
  channel?: string;
  agentId?: string;
}

export interface ChannelVolume {
  channel: string;
  total: number;
  open: number;
  closed: number;
}

export interface HelpdeskAnalytics {
  period: { from: string; to: string };
  totalTickets: number;
  openTickets: number;
  closedTickets: number;
  avgFirstResponseSeconds: number | null;
  avgResolutionSeconds: number | null;
  avgCsat: number | null;
  byChannel: ChannelVolume[];
  byAgent: Array<{
    agentId: string;
    assigned: number;
    closed: number;
    avgResponseSeconds: number | null;
  }>;
  backlog: Array<{ bucket: string; count: number }>;
}

export async function getHelpdeskAnalytics(input: HelpdeskAnalyticsInput): Promise<HelpdeskAnalytics> {
  const { orgId, from, to, channel, agentId } = input;

  const baseConds = [
    eq(helpdeskTickets.orgId, orgId),
    gte(helpdeskTickets.createdAt, from),
    lte(helpdeskTickets.createdAt, to),
    ...(channel ? [eq(helpdeskTickets.channel, channel)] : []),
    ...(agentId ? [eq(helpdeskTickets.assignedTo, agentId)] : []),
  ];

  // Total tickets in period
  const [totals] = await db
    .select({
      total: count(),
      open: sql<number>`COUNT(*) FILTER (WHERE status != 'closed')`,
      closed: sql<number>`COUNT(*) FILTER (WHERE status = 'closed')`,
    })
    .from(helpdeskTickets)
    .where(and(...baseConds));

  // Avg resolution time (seconds) from created_at → closed_at
  const [resolutionRow] = await db
    .select({
      avgSeconds: sql<number>`AVG(EXTRACT(EPOCH FROM (closed_at - created_at)))`,
    })
    .from(helpdeskTickets)
    .where(and(...baseConds, sql`closed_at IS NOT NULL`));

  // Avg first response time — first agent/system message after ticket open
  const [responseRow] = await db
    .select({
      avgSeconds: sql<number>`
        AVG(first_reply.seconds)
      `,
    })
    .from(
      db
        .select({
          seconds: sql<number>`EXTRACT(EPOCH FROM (MIN(tm.created_at) - ht.created_at))`.as('seconds'),
        })
        .from((helpdeskTickets as unknown as { as(a: string): typeof helpdeskTickets }).as('ht'))
        .innerJoin(
          (ticketMessages as unknown as { as(a: string): typeof ticketMessages }).as('tm'),
          and(
            eq(sql`tm.ticket_id`, sql`ht.id`),
            eq(sql`tm.direction`, sql`'outbound'`),
          ),
        )
        .where(and(...baseConds.map(c => sql`${c}`)))
        .groupBy(sql`ht.id`, sql`ht.created_at`)
        .as('first_reply'),
    );

  // Volume by channel
  const channelRows = await db
    .select({
      channel: helpdeskTickets.channel,
      total: count(),
      open: sql<number>`COUNT(*) FILTER (WHERE status != 'closed')`,
      closed: sql<number>`COUNT(*) FILTER (WHERE status = 'closed')`,
    })
    .from(helpdeskTickets)
    .where(and(...baseConds))
    .groupBy(helpdeskTickets.channel)
    .orderBy(desc(count()));

  // Per-agent stats
  const agentRows = await db
    .select({
      agentId: helpdeskTickets.assignedTo,
      assigned: count(),
      closed: sql<number>`COUNT(*) FILTER (WHERE status = 'closed')`,
      avgResponseSeconds: sql<number>`
        AVG(EXTRACT(EPOCH FROM (
          (SELECT MIN(tm2.created_at) FROM ticket_messages tm2
           WHERE tm2.ticket_id = helpdesk_tickets.id AND tm2.direction = 'outbound')
          - helpdesk_tickets.created_at
        )))
      `,
    })
    .from(helpdeskTickets)
    .where(and(...baseConds, sql`assigned_to IS NOT NULL`))
    .groupBy(helpdeskTickets.assignedTo)
    .orderBy(desc(count()));

  // Backlog by age
  const backlogBuckets = await db
    .select({
      bucket: sql<string>`
        CASE
          WHEN EXTRACT(EPOCH FROM (NOW() - created_at)) < 3600 THEN '<1h'
          WHEN EXTRACT(EPOCH FROM (NOW() - created_at)) < 86400 THEN '1-24h'
          WHEN EXTRACT(EPOCH FROM (NOW() - created_at)) < 259200 THEN '1-3d'
          ELSE '>3d'
        END
      `,
      count: count(),
    })
    .from(helpdeskTickets)
    .where(and(eq(helpdeskTickets.orgId, orgId), sql`status != 'closed'`))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    totalTickets: totals?.total ?? 0,
    openTickets: totals?.open ?? 0,
    closedTickets: totals?.closed ?? 0,
    avgFirstResponseSeconds: responseRow?.avgSeconds ?? null,
    avgResolutionSeconds: resolutionRow?.avgSeconds ?? null,
    avgCsat: null, // CSAT collected via separate survey flow
    byChannel: channelRows.map(r => ({ channel: r.channel, total: r.total, open: r.open, closed: r.closed })),
    byAgent: agentRows
      .filter(r => r.agentId != null)
      .map(r => ({
        agentId: r.agentId!,
        assigned: r.assigned,
        closed: r.closed,
        avgResponseSeconds: r.avgResponseSeconds ?? null,
      })),
    backlog: backlogBuckets.map(r => ({ bucket: r.bucket, count: r.count })),
  };
}

// ─── CSAT ──────────────────────────────────────────────────────────────────

export async function recordCsat(orgId: string, ticketId: string, score: number): Promise<void> {
  if (score < 1 || score > 5) throw new Error('CSAT score must be 1-5');
  // Store in ticket channelMetadata.csat_score (avoids new table)
  await db
    .update(helpdeskTickets)
    .set({
      channelMetadata: sql`jsonb_set(COALESCE(channel_metadata, '{}'), '{csat_score}', ${JSON.stringify(score)}::jsonb)`,
      updatedAt: new Date(),
    })
    .where(and(eq(helpdeskTickets.id, ticketId), eq(helpdeskTickets.orgId, orgId)));
}
