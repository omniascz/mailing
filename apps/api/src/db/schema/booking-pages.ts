/**
 * Booking pages & event types schema (#256, #257).
 *
 * event_types      — meeting templates (duration, buffer, availability rules)
 * booking_pages    — public page config per user/team
 * booking_availability — per-user weekly schedule windows
 * bookings already lives in calendar.ts
 */

import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, varchar, boolean, integer, jsonb,
  timestamp, text, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { users } from './users.js';

// ─── Event types (#257) ───────────────────────────────────────────────────────

export const eventTypes = pgTable(
  'event_types',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

    /** URL slug: /meetings/{bookingPageSlug}/{slug} */
    slug: varchar('slug', { length: 128 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),

    /** Duration in minutes: 15 | 30 | 45 | 60 | 90 | 120 */
    durationMinutes: integer('duration_minutes').notNull().default(30),

    /** Buffer before/after in minutes (block out calendar on both sides) */
    bufferBeforeMinutes: integer('buffer_before_minutes').notNull().default(0),
    bufferAfterMinutes: integer('buffer_after_minutes').notNull().default(0),

    /** Earliest notice required before a slot can be booked (minutes) */
    minNoticeMinutes: integer('min_notice_minutes').notNull().default(60),

    /** Maximum bookings per calendar day (0 = unlimited) */
    maxPerDay: integer('max_per_day').notNull().default(0),

    /** Furthest-out day that can be booked (days from today, 0 = unlimited) */
    bookingWindowDays: integer('booking_window_days').notNull().default(60),

    /** Location / meeting platform: physical | zoom | google_meet | teams | custom */
    locationType: varchar('location_type', { length: 32 }).notNull().default('google_meet'),
    /** Static location string or override URL */
    locationValue: varchar('location_value', { length: 512 }),

    /** Default timezone for display when invitee has no preference */
    timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),

    /** Custom questions to show on booking form [{id, label, type, required}] */
    questions: jsonb('questions').$type<Array<{
      id: string; label: string;
      type: 'text' | 'textarea' | 'select' | 'checkbox';
      required: boolean; options?: string[];
    }>>().notNull().default([]),

    /** For round-robin: list of user UUIDs in pool */
    teamMemberIds: jsonb('team_member_ids').$type<string[]>().notNull().default([]),
    /** single | round-robin | collective */
    schedulingType: varchar('scheduling_type', { length: 32 }).notNull().default('single'),

    color: varchar('color', { length: 16 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('event_types_owner_slug_uq').on(t.ownerUserId, t.slug),
    index('event_types_org_idx').on(t.orgId),
  ],
);

// ─── Booking pages (#256) ─────────────────────────────────────────────────────

export const bookingPages = pgTable(
  'booking_pages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

    /** Public slug: /meetings/{slug} */
    slug: varchar('slug', { length: 128 }).notNull(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    bio: text('bio'),
    avatarUrl: varchar('avatar_url', { length: 1024 }),
    timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('booking_pages_slug_uq').on(t.orgId, t.slug),
    index('booking_pages_user_idx').on(t.ownerUserId),
  ],
);

// ─── Per-user weekly availability (#256) ─────────────────────────────────────

export const bookingAvailability = pgTable(
  'booking_availability',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

    /**
     * Weekly schedule as an array of windows:
     * [{dayOfWeek: 0-6, startHour: 9, startMin: 0, endHour: 17, endMin: 0}]
     */
    schedule: jsonb('schedule').$type<Array<{
      dayOfWeek: number; startHour: number; startMin: number;
      endHour: number; endMin: number;
    }>>().notNull().default([]),

    /** IANA timezone the schedule is expressed in */
    timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),

    /** Date overrides: specific dates fully unavailable or custom hours */
    dateOverrides: jsonb('date_overrides').$type<Array<{
      date: string; unavailable?: boolean;
      startHour?: number; startMin?: number;
      endHour?: number; endMin?: number;
    }>>().notNull().default([]),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('booking_availability_user_uq').on(t.orgId, t.userId),
  ],
);

// ─── Round-robin assignment state (#261) ─────────────────────────────────────

export const roundRobinState = pgTable(
  'round_robin_state',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    eventTypeId: uuid('event_type_id').notNull(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** Number of bookings assigned so far in this rotation */
    assignmentCount: integer('assignment_count').notNull().default(0),
    lastAssignedAt: timestamp('last_assigned_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('round_robin_state_event_user_uq').on(t.eventTypeId, t.userId),
    index('round_robin_state_org_idx').on(t.orgId, t.eventTypeId),
  ],
);

export type EventType = typeof eventTypes.$inferSelect;
export type NewEventType = typeof eventTypes.$inferInsert;
export type BookingPage = typeof bookingPages.$inferSelect;
export type BookingAvailability = typeof bookingAvailability.$inferSelect;
export type RoundRobinState = typeof roundRobinState.$inferSelect;
