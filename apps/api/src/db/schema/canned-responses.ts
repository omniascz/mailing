import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const cannedResponses = pgTable(
  'canned_responses',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull(),
    /** Short name shown in picker UI */
    name: varchar('name', { length: 255 }).notNull(),
    /** Searchable shortcut: "/welcome" → type "/" to trigger */
    shortcut: varchar('shortcut', { length: 80 }),
    category: varchar('category', { length: 80 }),
    /** Rich-text body; supports {{first_name}} merge tags */
    body: text('body').notNull(),
    /** Make visible to all agents in org (false = creator only) */
    shared: boolean('shared').notNull().default(true),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('canned_responses_org_idx').on(t.orgId),
    index('canned_responses_shortcut_idx').on(t.orgId, t.shortcut),
  ],
);

export type CannedResponse = typeof cannedResponses.$inferSelect;
export type NewCannedResponse = typeof cannedResponses.$inferInsert;
