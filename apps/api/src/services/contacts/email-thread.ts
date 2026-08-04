/**
 * Per-contact email thread view — chronological history of all emails
 * sent to a contact with subjects, open/click status, and summaries.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/email-events.js';
import { campaigns } from '../../db/schema/campaigns.js';

export interface ThreadMessage {
  campaignId: string | null;
  campaignName: string | null;
  subject: string | null;
  sentAt: Date;
  opened: boolean;
  clicked: boolean;
  bounced: boolean;
  unsubscribed: boolean;
  complained: boolean;
}

/** Return chronological email history for a contact (newest first). */
export async function getContactEmailThread(
  orgId: string,
  contactId: string,
  limit = 50,
  cursor?: string,
): Promise<{ messages: ThreadMessage[]; nextCursor: string | null }> {
  const conds = [
    eq(emailEvents.orgId, orgId),
    eq(emailEvents.contactId, contactId),
    sql`event_type = 'deliver'`,
  ];
  if (cursor) {
    conds.push(sql`created_at < ${cursor}`);
  }

  const deliveries = await db
    .select({
      campaignId: emailEvents.campaignId,
      messageId: emailEvents.messageId,
      sentAt: emailEvents.createdAt,
    })
    .from(emailEvents)
    .where(and(...conds))
    .orderBy(desc(emailEvents.createdAt))
    .limit(limit + 1);

  const hasMore = deliveries.length > limit;
  const page = deliveries.slice(0, limit);

  const messageIds = page.map((d) => d.messageId).filter(Boolean) as string[];
  const campaignIds = [...new Set(page.map((d) => d.campaignId).filter(Boolean) as string[])];

  // Batch-fetch campaign names
  const campaignMap: Record<string, string> = {};
  if (campaignIds.length > 0) {
    const camps = await db
      .select({ id: campaigns.id, name: campaigns.name })
      .from(campaigns)
      .where(and(eq(campaigns.orgId, orgId), sql`id = any(${campaignIds})`));
    for (const c of camps) campaignMap[c.id] = c.name;
  }

  // Batch-fetch all events for those messageIds
  const eventMap: Record<string, Set<string>> = {};
  if (messageIds.length > 0) {
    const events = await db
      .select({ messageId: emailEvents.messageId, eventType: emailEvents.eventType })
      .from(emailEvents)
      .where(
        and(
          eq(emailEvents.orgId, orgId),
          sql`message_id = any(${messageIds})`,
          sql`event_type in ('open','click','bounce','unsubscribe','complaint')`,
        ),
      );
    for (const e of events) {
      if (!e.messageId) continue;
      if (!eventMap[e.messageId]) eventMap[e.messageId] = new Set();
      eventMap[e.messageId]!.add(e.eventType ?? '');
    }
  }

  const messages: ThreadMessage[] = page.map((d) => {
    const evts = d.messageId ? (eventMap[d.messageId] ?? new Set()) : new Set<string>();
    return {
      campaignId: d.campaignId,
      campaignName: d.campaignId ? (campaignMap[d.campaignId] ?? null) : null,
      subject: null, // populated from campaign template if needed
      sentAt: d.sentAt,
      opened: evts.has('open'),
      clicked: evts.has('click'),
      bounced: evts.has('bounce'),
      unsubscribed: evts.has('unsubscribe'),
      complained: evts.has('complaint'),
    };
  });

  const lastPage = page[page.length - 1];
  const nextCursor = hasMore && lastPage ? lastPage.sentAt.toISOString() : null;

  return { messages, nextCursor };
}

/** Aggregated engagement summary for a contact across all time. */
export async function getContactEngagementSummary(orgId: string, contactId: string) {
  const [row] = await db
    .select({
      totalSent: sql<number>`count(*) filter (where event_type = 'deliver')::int`,
      totalOpens: sql<number>`count(*) filter (where event_type = 'open')::int`,
      totalClicks: sql<number>`count(*) filter (where event_type = 'click')::int`,
      totalBounces: sql<number>`count(*) filter (where event_type = 'bounce')::int`,
      totalComplaints: sql<number>`count(*) filter (where event_type = 'complaint')::int`,
      firstEmail: sql<string | null>`min(created_at) filter (where event_type = 'deliver')`,
      lastEmail: sql<string | null>`max(created_at) filter (where event_type = 'deliver')`,
      lastOpen: sql<string | null>`max(created_at) filter (where event_type = 'open')`,
    })
    .from(emailEvents)
    .where(and(eq(emailEvents.orgId, orgId), eq(emailEvents.contactId, contactId)));

  const sent = Number(row?.totalSent ?? 0);
  const opens = Number(row?.totalOpens ?? 0);
  const clicks = Number(row?.totalClicks ?? 0);

  return {
    totalSent: sent,
    totalOpens: opens,
    totalClicks: clicks,
    totalBounces: Number(row?.totalBounces ?? 0),
    totalComplaints: Number(row?.totalComplaints ?? 0),
    openRate: sent > 0 ? opens / sent : 0,
    clickToOpenRate: opens > 0 ? clicks / opens : 0,
    firstEmailAt: row?.firstEmail ?? null,
    lastEmailAt: row?.lastEmail ?? null,
    lastOpenAt: row?.lastOpen ?? null,
    daysSinceLastOpen: row?.lastOpen
      ? Math.floor((Date.now() - new Date(row.lastOpen).getTime()) / 86400_000)
      : null,
  };
}
