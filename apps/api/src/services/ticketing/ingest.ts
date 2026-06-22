/**
 * Ticketing ingestion / sync — the seam between a ticketing app (Tixly) and
 * ForgeMsg. The app emits domain events here; ForgeMsg upserts the contact +
 * event + attendance, records revenue, and fires the matching workflow trigger
 * (`ticketing.<type>`) so existing automations react. ForgeMsg owns all the
 * marketing logic; the app only supplies data + triggers.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts } from '../../db/schema/contacts.js';
import { revenueEvents } from '../../db/schema/revenue.js';
import {
  externalEvents,
  eventAttendance,
  type AttendanceStatus,
} from '../../db/schema/ticketing.js';
import { onApiEvent } from '../workflows/triggers.js';

export type TicketingEventType =
  | 'contact_sync'
  | 'order_paid'
  | 'order_refunded'
  | 'event_attended'
  | 'cart_abandoned'
  | 'event_upsert' // event-level: title/seats/status (drives yield + day-of)
  | 'event_changed' // cancel / reschedule / venue change
  | 'subscription_past_due'
  | 'waitlist_freed'
  | 'lottery_won';

export interface TicketingContactInput {
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  locale?: string;
}

export interface TicketingEventInput {
  externalId: string;
  title?: string;
  category?: string;
  subcategory?: string;
  venueName?: string;
  venueCity?: string;
  currency?: string;
  startsAt?: string;
  status?: string;
  unsoldSeats?: number;
  unsoldByTier?: Record<string, number>;
  tags?: string[];
}

export interface TicketingOrderInput {
  orderId?: string;
  amount?: number; // minor units
  currency?: string;
  seats?: number;
}

export interface TicketingEvent {
  type: TicketingEventType;
  contact?: TicketingContactInput;
  event?: TicketingEventInput;
  order?: TicketingOrderInput;
  occurredAt?: string;
  payload?: Record<string, unknown>;
}

export interface IngestResult {
  contactId?: string;
  externalEventId?: string;
  attendanceRecorded: boolean;
  revenueRecorded: boolean;
  triggerFired: string | null;
}

/** Which ingest types record which attendance status (null = no attendance row). */
export const ATTENDANCE_FOR_TYPE: Partial<Record<TicketingEventType, AttendanceStatus>> = {
  order_paid: 'purchased',
  order_refunded: 'refunded',
  event_attended: 'attended',
  cart_abandoned: 'cart_abandoned',
  waitlist_freed: 'waitlisted',
  lottery_won: 'lottery_won',
};

/** Find-or-create a contact by email (org-scoped); refresh light profile fields. */
export async function upsertContactByEmail(
  orgId: string,
  c: TicketingContactInput,
): Promise<string> {
  const email = c.email.toLowerCase().trim();
  const [existing] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), sql`lower(${contacts.email}) = ${email}`))
    .limit(1);

  if (existing) {
    await db
      .update(contacts)
      .set({
        ...(c.phone ? { phone: c.phone } : {}),
        ...(c.firstName ? { firstName: c.firstName } : {}),
        ...(c.lastName ? { lastName: c.lastName } : {}),
        ...(c.locale ? { preferredLocale: c.locale } : {}),
        // Merge city into custom_fields (no dedicated column on contacts).
        ...(c.city
          ? { customFields: sql`coalesce(${contacts.customFields}, '{}'::jsonb) || ${JSON.stringify({ city: c.city })}::jsonb` }
          : {}),
        updatedAt: new Date(),
      } as never)
      .where(eq(contacts.id, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(contacts)
    .values({
      orgId,
      email,
      phone: c.phone,
      firstName: c.firstName,
      lastName: c.lastName,
      preferredLocale: c.locale,
      customFields: c.city ? { city: c.city } : undefined,
      source: 'ticketing',
    })
    .returning({ id: contacts.id });
  return created!.id;
}

/** Find-or-create+update an external (ticketed) event by externalId. */
export async function upsertExternalEvent(
  orgId: string,
  e: TicketingEventInput,
): Promise<string> {
  const patch = {
    title: e.title ?? '(untitled)',
    category: e.category,
    subcategory: e.subcategory,
    venueName: e.venueName,
    venueCity: e.venueCity,
    currency: e.currency,
    startsAt: e.startsAt ? new Date(e.startsAt) : undefined,
    status: e.status,
    unsoldSeats: e.unsoldSeats,
    unsoldByTier: e.unsoldByTier,
    tags: e.tags,
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select({ id: externalEvents.id })
    .from(externalEvents)
    .where(and(eq(externalEvents.orgId, orgId), eq(externalEvents.externalId, e.externalId)))
    .limit(1);

  if (existing) {
    // Only overwrite provided fields.
    const set: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) set[k] = v;
    await db.update(externalEvents).set(set as never).where(eq(externalEvents.id, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(externalEvents)
    .values({ orgId, externalId: e.externalId, ...patch, title: patch.title } as never)
    .returning({ id: externalEvents.id });
  return created!.id;
}

/** Process one ticketing event end-to-end. */
export async function ingestTicketingEvent(
  orgId: string,
  evt: TicketingEvent,
): Promise<IngestResult> {
  const result: IngestResult = {
    attendanceRecorded: false,
    revenueRecorded: false,
    triggerFired: null,
  };
  const occurredAt = evt.occurredAt ? new Date(evt.occurredAt) : new Date();

  // Event-level upsert (yield + day-of source of truth) — may have no contact.
  if (evt.event) {
    result.externalEventId = await upsertExternalEvent(orgId, evt.event);
  }

  // Contact-level handling.
  if (evt.contact?.email) {
    result.contactId = await upsertContactByEmail(orgId, evt.contact);

    // Attendance row.
    const status = ATTENDANCE_FOR_TYPE[evt.type];
    if (status && result.externalEventId) {
      await db
        .insert(eventAttendance)
        .values({
          orgId,
          contactId: result.contactId,
          externalEventId: result.externalEventId,
          status,
          orderId: evt.order?.orderId,
          amount: evt.order?.amount,
          currency: evt.order?.currency,
          seats: evt.order?.seats ?? 1,
          occurredAt,
          attendedAt: status === 'attended' ? occurredAt : undefined,
        })
        .onConflictDoNothing();
      result.attendanceRecorded = true;
    }

    // Revenue (paid orders only).
    if (evt.type === 'order_paid' && evt.order?.amount && evt.order.amount > 0) {
      await db.insert(revenueEvents).values({
        orgId,
        contactId: result.contactId,
        orderId: evt.order.orderId,
        amount: String(evt.order.amount / 100), // minor → major units
        currency: evt.order.currency ?? evt.event?.currency ?? 'CZK',
        occurredAt,
      });
      result.revenueRecorded = true;
    }

    // Fire the workflow trigger so existing automations react. Best-effort.
    const triggerName = `ticketing.${evt.type}`;
    await onApiEvent(orgId, result.contactId, triggerName, {
      ...(evt.event ? { event: evt.event } : {}),
      ...(evt.order ? { order: evt.order } : {}),
      ...(evt.payload ?? {}),
      externalEventId: result.externalEventId,
    }).catch(() => {});
    result.triggerFired = triggerName;
  }

  return result;
}
