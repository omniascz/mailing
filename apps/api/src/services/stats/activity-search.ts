/**
 * Activity search (SendGrid Activity Feed parity). Search the email_events feed
 * by recipient, event type, message id, campaign, category, ISP and date range,
 * with cursor pagination (created_at desc).
 */

import { and, desc, eq, gte, lte, lt, or, sql, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/email-events.js';
import { contacts } from '../../db/schema/contacts.js';

export interface ActivitySearchFilter {
  /** Recipient email — matches the transactional metadata `to` or a contact. */
  email?: string;
  eventType?: 'send' | 'deliver' | 'open' | 'click' | 'bounce' | 'unsubscribe' | 'complaint';
  messageId?: string;
  campaignId?: string;
  category?: string;
  isp?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  /** ISO createdAt of the last row from the previous page. */
  cursor?: string;
}

export interface ActivityRow {
  id: string;
  eventType: string;
  messageId: string | null;
  campaignId: string | null;
  contactId: string | null;
  category: string | null;
  isp: string | null;
  linkUrl: string | null;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
}

export async function searchActivity(
  orgId: string,
  f: ActivitySearchFilter,
): Promise<{ data: ActivityRow[]; hasMore: boolean; cursor: string | null }> {
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const conds = [eq(emailEvents.orgId, orgId)];

  if (f.eventType) conds.push(eq(emailEvents.eventType, f.eventType));
  if (f.messageId) conds.push(eq(emailEvents.messageId, f.messageId));
  if (f.campaignId) conds.push(eq(emailEvents.campaignId, f.campaignId));
  if (f.category) conds.push(eq(emailEvents.category, f.category));
  if (f.isp) conds.push(eq(emailEvents.isp, f.isp));
  if (f.from) conds.push(gte(emailEvents.createdAt, f.from));
  if (f.to) conds.push(lte(emailEvents.createdAt, f.to));
  if (f.cursor) conds.push(lt(emailEvents.createdAt, new Date(f.cursor)));

  if (f.email) {
    const like = `%${f.email.toLowerCase()}%`;
    // Recipient lives in transactional metadata (`to`) or is referenced by
    // contact_id for campaign sends — match either.
    const contactIds = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), sql`lower(${contacts.email}) LIKE ${like}`))
      .limit(1000);
    const ids = contactIds.map((c) => c.id);
    const byContact = ids.length ? inArray(emailEvents.contactId, ids) : undefined;
    const byMeta = sql`lower(${emailEvents.metadata}->>'to') LIKE ${like}`;
    conds.push(byContact ? or(byMeta, byContact)! : byMeta);
  }

  const rows = await db
    .select({
      id: emailEvents.id,
      eventType: emailEvents.eventType,
      messageId: emailEvents.messageId,
      campaignId: emailEvents.campaignId,
      contactId: emailEvents.contactId,
      category: emailEvents.category,
      isp: emailEvents.isp,
      linkUrl: emailEvents.linkUrl,
      createdAt: emailEvents.createdAt,
      metadata: emailEvents.metadata,
    })
    .from(emailEvents)
    .where(and(...conds))
    .orderBy(desc(emailEvents.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = (hasMore ? rows.slice(0, limit) : rows) as ActivityRow[];
  const cursor = hasMore ? data[data.length - 1]!.createdAt.toISOString() : null;
  return { data, hasMore, cursor };
}
