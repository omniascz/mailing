import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  boolean,
  text,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { users } from './users.js';

// ─── Per-user calendar integrations ──────────────────────────────────────────

export const calendarIntegrations = pgTable(
  'calendar_integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 32 }).notNull(), // 'google' | 'microsoft' | 'caldav'
    externalAccountId: varchar('external_account_id', { length: 255 }).notNull(),
    externalAccountEmail: varchar('external_account_email', { length: 255 }),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    // Selected primary calendar for booking
    primaryCalendarId: varchar('primary_calendar_id', { length: 255 }),
    // Sync bookkeeping
    syncToken: text('sync_token'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    // CalDAV-only fields
    caldavUrl: varchar('caldav_url', { length: 512 }),
    caldavUsername: varchar('caldav_username', { length: 255 }),
    status: varchar('status', { length: 32 }).notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cal_int_user_provider_acct_uq').on(t.userId, t.provider, t.externalAccountId),
    index('cal_int_org_idx').on(t.orgId),
  ],
);

// ─── Synced events (for free/busy lookup) ────────────────────────────────────

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => calendarIntegrations.id, { onDelete: 'cascade' }),
    externalEventId: varchar('external_event_id', { length: 255 }).notNull(),
    calendarId: varchar('calendar_id', { length: 255 }),
    title: varchar('title', { length: 1024 }),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    allDay: boolean('all_day').notNull().default(false),
    status: varchar('status', { length: 32 }).notNull().default('confirmed'),
    busy: boolean('busy').notNull().default(true),
    attendees: jsonb('attendees')
      .$type<Array<{ email: string; responseStatus?: string }>>()
      .notNull()
      .default([]),
    // Link back to an internal booking record if the event was created by us
    internalBookingId: uuid('internal_booking_id'),
    rawMetadata: jsonb('raw_metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cal_events_integration_ext_uq').on(t.integrationId, t.externalEventId),
    index('cal_events_integration_start_idx').on(t.integrationId, t.startAt),
    index('cal_events_org_start_idx').on(t.orgId, t.startAt),
  ],
);

// ─── Internal bookings (meetings scheduled via ForgeMsg) ─────────────────────

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    hostUserId: uuid('host_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    inviteeEmail: varchar('invitee_email', { length: 255 }).notNull(),
    inviteeName: varchar('invitee_name', { length: 255 }),
    title: varchar('title', { length: 1024 }).notNull(),
    description: text('description'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    timezone: varchar('timezone', { length: 64 }),
    location: varchar('location', { length: 512 }),
    meetingUrl: varchar('meeting_url', { length: 1024 }),
    status: varchar('status', { length: 32 }).notNull().default('confirmed'),
    // External id assigned by the provider after push
    externalEventId: varchar('external_event_id', { length: 255 }),
    integrationId: uuid('integration_id').references(() => calendarIntegrations.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bookings_org_host_idx').on(t.orgId, t.hostUserId),
    index('bookings_org_start_idx').on(t.orgId, t.startAt),
  ],
);

export type CalendarIntegration = typeof calendarIntegrations.$inferSelect;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
