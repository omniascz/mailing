import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  integer,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

/**
 * Identifier edge store for the CDP identity graph.
 *
 * Each row is (signal_type, signal_value) → contact_id. One contact may be
 * the target of many edges; new signals are stitched onto an existing contact
 * whenever any match is found.
 */
export const identitySignals = pgTable(
  'identity_signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    // signal_type: email | phone | cookie | device_id | hashed_id | account_id | user_id | social_id | visitor_id
    signalType: varchar('signal_type', { length: 32 }).notNull(),
    // Canonical value (lowercased email, E.164 phone, sha256 for hashed_id, etc.)
    signalValue: varchar('signal_value', { length: 512 }).notNull(),
    // Confidence weight 1-100 — higher means more authoritative (e.g. login-time user_id > cookie)
    confidence: integer('confidence').notNull().default(50),
    source: varchar('source', { length: 64 }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    uniqueIndex('identity_signals_org_type_value_uq').on(t.orgId, t.signalType, t.signalValue),
    index('identity_signals_contact_idx').on(t.contactId),
    index('identity_signals_last_seen_idx').on(t.lastSeenAt),
  ],
);

/**
 * Audit trail of contact merges — lets operators unwind a bad merge
 * (edges moved from loser → winner are recorded here).
 */
export const identityMerges = pgTable(
  'identity_merges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    winnerContactId: uuid('winner_contact_id').notNull(),
    loserContactId: uuid('loser_contact_id').notNull(),
    movedSignals: integer('moved_signals').notNull().default(0),
    reason: varchar('reason', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('identity_merges_org_idx').on(t.orgId),
    index('identity_merges_winner_idx').on(t.winnerContactId),
  ],
);

export type IdentitySignal = typeof identitySignals.$inferSelect;
export type IdentityMerge = typeof identityMerges.$inferSelect;

export type SignalType =
  | 'email'
  | 'phone'
  | 'cookie'
  | 'device_id'
  | 'hashed_id'
  | 'account_id'
  | 'user_id'
  | 'social_id'
  | 'visitor_id';
