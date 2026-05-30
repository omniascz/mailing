import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  timestamp,
  integer,
  index,
  uniqueIndex,
  pgEnum,
  smallint,
  varchar,
  jsonb,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

export const frequencyChannelEnum = pgEnum('frequency_channel', [
  'email',
  'sms',
  'push',
  'whatsapp',
  'voice',
  'all',
]);

export const orgFrequencyRules = pgTable(
  'org_frequency_rules',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    channel: frequencyChannelEnum('channel').notNull(),
    maxCount: integer('max_count').notNull(),
    periodHours: integer('period_hours').notNull(),
    // Quiet hours window (org-local). When start == end, no quiet window
    // applies. When start > end the window wraps across midnight.
    quietHoursStart: smallint('quiet_hours_start'),
    quietHoursEnd: smallint('quiet_hours_end'),
    timezone: varchar('timezone', { length: 64 }),
    // When set, rule only applies to contacts in this engagement band.
    engagementBand: varchar('engagement_band', { length: 20 }),
    // When set, sends with this priority or stricter still go through;
    // typically 'transactional' so receipts + password resets always send.
    priorityFloor: varchar('priority_floor', { length: 16 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('org_frequency_rules_org_idx').on(t.orgId),
    uniqueIndex('org_frequency_rules_org_channel_idx').on(t.orgId, t.channel),
  ],
);

export const frequencySuppressions = pgTable(
  'frequency_suppressions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 16 }).notNull(),
    reason: varchar('reason', { length: 32 }).notNull(),
    ruleId: uuid('rule_id'),
    priority: varchar('priority', { length: 16 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    suppressedAt: timestamp('suppressed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('frequency_suppressions_org_at_idx').on(t.orgId, t.suppressedAt),
    index('frequency_suppressions_contact_idx').on(t.contactId, t.suppressedAt),
    index('frequency_suppressions_reason_idx').on(t.orgId, t.reason),
  ],
);

export type OrgFrequencyRule = typeof orgFrequencyRules.$inferSelect;
export type NewOrgFrequencyRule = typeof orgFrequencyRules.$inferInsert;
export type FrequencySuppression = typeof frequencySuppressions.$inferSelect;
