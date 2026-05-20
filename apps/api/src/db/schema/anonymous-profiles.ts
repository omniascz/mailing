import { pgTable, uuid, varchar, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

export const anonymousProfiles = pgTable(
  'anonymous_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    visitorId: varchar('visitor_id', { length: 128 }).notNull(),
    deviceId: varchar('device_id', { length: 128 }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    mergedInto: uuid('merged_into').references(() => contacts.id, { onDelete: 'set null' }),
    mergedAt: timestamp('merged_at', { withTimezone: true }),
    properties: jsonb('properties').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    uniqueIndex('anon_profiles_org_visitor_uq').on(t.orgId, t.visitorId),
    index('anon_profiles_merged_idx').on(t.mergedInto),
  ],
);

export type AnonymousProfile = typeof anonymousProfiles.$inferSelect;
