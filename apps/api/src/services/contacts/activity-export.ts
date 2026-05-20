/**
 * Activity export (#126) — per-contact timeline export to CSV.
 *
 * Aggregates email events, revenue events, CDP events, and helpdesk tickets
 * into a single unified activity feed, exported as CSV.
 *
 * For large exports (>10k rows), delegates to async job that uploads to S3.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  contacts,
  emailEvents,
  revenueEvents,
  cdpEvents,
  helpdeskTickets,
  type Contact,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export interface ActivityRow {
  timestamp: Date;
  type: 'email' | 'order' | 'event' | 'ticket';
  summary: string;
  details: Record<string, unknown>;
}

export async function getContactActivity(
  orgId: string,
  contactId: string,
  limit = 5000,
): Promise<ActivityRow[]> {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)))
    .limit(1);
  if (!contact) throw AppError.notFound('Contact');

  const activities: ActivityRow[] = [];

  // Email events
  const emails = await db
    .select({
      createdAt: emailEvents.createdAt,
      eventType: emailEvents.eventType,
      campaignId: emailEvents.campaignId,
      linkUrl: emailEvents.linkUrl,
    })
    .from(emailEvents)
    .where(and(eq(emailEvents.orgId, orgId), eq(emailEvents.contactId, contactId)))
    .orderBy(sql`${emailEvents.createdAt} DESC`)
    .limit(limit);

  for (const e of emails) {
    const typeLabel =
      {
        send: 'Email sent',
        deliver: 'Email delivered',
        open: 'Email opened',
        click: 'Link clicked',
        bounce: 'Email bounced',
        complaint: 'Email complaint',
        unsubscribe: 'Unsubscribed',
      }[e.eventType] || e.eventType;

    activities.push({
      timestamp: e.createdAt,
      type: 'email',
      summary: typeLabel,
      details: {
        campaignId: e.campaignId,
        linkUrl: e.linkUrl,
        eventType: e.eventType,
      },
    });
  }

  // Revenue events
  const orders = await db
    .select({
      occurredAt: revenueEvents.occurredAt,
      orderId: revenueEvents.orderId,
      amount: revenueEvents.amount,
      currency: revenueEvents.currency,
      attributedCampaignId: revenueEvents.attributedCampaignId,
    })
    .from(revenueEvents)
    .where(and(eq(revenueEvents.orgId, orgId), eq(revenueEvents.contactId, contactId)))
    .orderBy(sql`${revenueEvents.occurredAt} DESC`)
    .limit(limit);

  for (const o of orders) {
    activities.push({
      timestamp: o.occurredAt,
      type: 'order',
      summary: `Order: ${o.currency} ${Number(o.amount).toFixed(2)}`,
      details: {
        orderId: o.orderId,
        amount: o.amount,
        currency: o.currency,
        attributedCampaignId: o.attributedCampaignId,
      },
    });
  }

  // CDP events
  const events = await db
    .select({
      occurredAt: cdpEvents.occurredAt,
      name: cdpEvents.name,
      source: cdpEvents.source,
      properties: cdpEvents.properties,
    })
    .from(cdpEvents)
    .where(and(eq(cdpEvents.orgId, orgId), eq(cdpEvents.contactId, contactId)))
    .orderBy(sql`${cdpEvents.occurredAt} DESC`)
    .limit(limit);

  for (const ev of events) {
    activities.push({
      timestamp: ev.occurredAt,
      type: 'event',
      summary: `Event: ${ev.name}`,
      details: {
        name: ev.name,
        source: ev.source,
        properties: ev.properties,
      },
    });
  }

  // Helpdesk tickets
  const tickets = await db
    .select({
      updatedAt: helpdeskTickets.updatedAt,
      subject: helpdeskTickets.subject,
      status: helpdeskTickets.status,
      channel: helpdeskTickets.channel,
      priority: helpdeskTickets.priority,
    })
    .from(helpdeskTickets)
    .where(and(eq(helpdeskTickets.orgId, orgId), eq(helpdeskTickets.contactId, contactId)))
    .orderBy(sql`${helpdeskTickets.updatedAt} DESC`)
    .limit(limit);

  for (const t of tickets) {
    activities.push({
      timestamp: t.updatedAt,
      type: 'ticket',
      summary: `Ticket [${t.status}]: ${t.subject || '(no subject)'}`,
      details: {
        subject: t.subject,
        status: t.status,
        channel: t.channel,
        priority: t.priority,
      },
    });
  }

  // Sort by timestamp descending
  activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return activities.slice(0, limit);
}

/**
 * Format activity rows as CSV. Headers: Timestamp, Type, Summary, Details (JSON).
 */
export function formatActivityCsv(_contact: Contact, activities: ActivityRow[]): string {
  const header = ['Timestamp', 'Type', 'Summary', 'Details'].map(escapecsvField).join(',');
  const rows = activities.map((a) =>
    [a.timestamp.toISOString(), a.type, a.summary, JSON.stringify(a.details)]
      .map(escapecsvField)
      .join(','),
  );
  return [header, ...rows].join('\n');
}

function escapecsvField(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateFilename(contact: Contact): string {
  const email = contact.email?.replace(/[^a-z0-9]/gi, '_') || 'contact';
  const date = new Date().toISOString().split('T')[0];
  return `activity_${email}_${date}.csv`;
}
