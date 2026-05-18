import { pgTable, uuid, varchar, boolean, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations.js';
import { lists } from './lists.js';

export const smsKeywords = pgTable(
  'sms_keywords',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    keyword: varchar('keyword', { length: 32 }).notNull(),
    action: varchar('action', { length: 32 }).notNull(),
    listId: uuid('list_id').references(() => lists.id, { onDelete: 'set null' }),
    reply: varchar('reply', { length: 1024 }),
    enabled: boolean('enabled').notNull().default(true),
    hitCount: integer('hit_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('sms_keywords_org_kw_uq').on(t.orgId, sql`LOWER(${t.keyword})`)],
);

export type SmsKeyword = typeof smsKeywords.$inferSelect;
