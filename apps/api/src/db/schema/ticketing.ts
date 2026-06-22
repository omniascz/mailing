/**
 * Ticketing vertical — a light domain layer that lets ForgeMsg target live
 * events (attendees of event X, "people who attended music in Brno", yield on
 * unsold seats, day-of timing). Populated by the ingestion/sync layer from a
 * ticketing app (e.g. Tixly); ForgeMsg owns the marketing on top.
 */
import { pgTable, uuid, varchar, integer, jsonb, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

/** Mirror of a ticketed event (one row per show/performance instance). */
export const externalEvents = pgTable(
  'external_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** The ticketing app's event id (stable external key). */
    externalId: varchar('external_id', { length: 128 }).notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    category: varchar('category', { length: 80 }), // music | theatre | sport | …
    subcategory: varchar('subcategory', { length: 80 }),
    venueName: varchar('venue_name', { length: 255 }),
    venueCity: varchar('venue_city', { length: 120 }),
    currency: varchar('currency', { length: 3 }).default('CZK'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    status: varchar('status', { length: 32 }).notNull().default('on_sale'), // on_sale | sold_out | cancelled | past
    /** Total unsold seats (for yield / fill-the-house). */
    unsoldSeats: integer('unsold_seats'),
    /** Unsold by tier: { "VIP": 12, "Standard": 80 }. */
    unsoldByTier: jsonb('unsold_by_tier').$type<Record<string, number>>(),
    /** Free-form tags / genres (best-effort affinity). */
    tags: jsonb('tags').$type<string[]>().default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('external_events_org_ext_uq').on(t.orgId, t.externalId),
    index('external_events_org_starts_idx').on(t.orgId, t.startsAt),
    index('external_events_org_cat_idx').on(t.orgId, t.category),
  ],
);

export type ExternalEvent = typeof externalEvents.$inferSelect;

export type AttendanceStatus =
  | 'purchased'
  | 'attended'
  | 'waitlisted'
  | 'lottery_won'
  | 'refunded'
  | 'cart_abandoned';

/** A contact's relationship to a ticketed event (purchase / attendance / waitlist). */
export const eventAttendance = pgTable(
  'event_attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    externalEventId: uuid('external_event_id')
      .notNull()
      .references(() => externalEvents.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 24 }).notNull().$type<AttendanceStatus>(),
    orderId: varchar('order_id', { length: 128 }),
    amount: integer('amount'), // minor units (haléře/cents)
    currency: varchar('currency', { length: 3 }).default('CZK'),
    seats: integer('seats').default(1),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    attendedAt: timestamp('attended_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (t) => [
    index('event_attendance_org_contact_idx').on(t.orgId, t.contactId),
    index('event_attendance_org_event_idx').on(t.orgId, t.externalEventId),
    index('event_attendance_org_status_idx').on(t.orgId, t.status),
    unique('event_attendance_uq').on(t.orgId, t.contactId, t.externalEventId, t.status),
  ],
);

export type EventAttendance = typeof eventAttendance.$inferSelect;
