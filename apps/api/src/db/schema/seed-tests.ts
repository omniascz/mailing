import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { campaigns } from './campaigns.js';

/** Where a seed message actually landed (recorded from a real inbox check). */
export const seedPlacementEnum = pgEnum('seed_placement', [
  'inbox',
  'spam',
  'promotions',
  'updates',
  'social',
  'missing',
]);

/**
 * Seed mailboxes an org sends test content to. Real placement is collected by a
 * checker (IMAP poller / provider API / manual report) posting back to the
 * results ingestion endpoint — this is ground truth, not the heuristic sim.
 */
export const seedAddresses = pgTable(
  'seed_addresses',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Mailbox provider label (gmail / outlook / yahoo / seznam / …). */
    provider: varchar('provider', { length: 40 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('seed_addresses_org_idx').on(t.orgId, t.active)],
);

/** One seed test run for a piece of content (campaign or ad-hoc subject/body). */
export const seedTests = pgTable(
  'seed_tests',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    subject: varchar('subject', { length: 255 }),
    status: varchar('status', { length: 20 }).notNull().default('sent'), // sent | complete
    sentCount: integer('sent_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('seed_tests_org_idx').on(t.orgId, t.createdAt)],
);

/** Per-seed result for a test — one row per seed address the content was sent to. */
export const seedResults = pgTable(
  'seed_results',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    testId: uuid('test_id')
      .notNull()
      .references(() => seedTests.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 40 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    messageId: varchar('message_id', { length: 255 }),
    /** null until a real inbox check reports placement. */
    placement: seedPlacementEnum('placement'),
    arrived: boolean('arrived'),
    reportedAt: timestamp('reported_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('seed_results_test_idx').on(t.testId), index('seed_results_org_idx').on(t.orgId)],
);

export type SeedAddress = typeof seedAddresses.$inferSelect;
export type SeedTest = typeof seedTests.$inferSelect;
export type SeedResult = typeof seedResults.$inferSelect;
