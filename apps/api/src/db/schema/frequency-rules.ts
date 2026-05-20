import { sql } from 'drizzle-orm';
import { pgTable, uuid, timestamp, integer, index, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('org_frequency_rules_org_idx').on(t.orgId),
    uniqueIndex('org_frequency_rules_org_channel_idx').on(t.orgId, t.channel),
  ],
);

export type OrgFrequencyRule = typeof orgFrequencyRules.$inferSelect;
export type NewOrgFrequencyRule = typeof orgFrequencyRules.$inferInsert;
