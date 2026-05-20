import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

export const smartSendingRules = pgTable(
  'smart_sending_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 32 }).notNull(),
    maxPerDay: integer('max_per_day').notNull().default(2),
    maxPerWeek: integer('max_per_week').notNull().default(7),
    cooldownHours: integer('cooldown_hours').notNull().default(16),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('smart_sending_rules_org_ch_uq').on(t.orgId, t.channel)],
);

export const contactSendLog = pgTable(
  'contact_send_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 32 }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('contact_send_log_recent_idx').on(t.orgId, t.contactId, t.channel, t.sentAt)],
);

export type SmartSendingRule = typeof smartSendingRules.$inferSelect;
export type ContactSendLog = typeof contactSendLog.$inferSelect;
