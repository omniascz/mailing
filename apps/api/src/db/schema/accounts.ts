import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, bigint, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  name: text('name').notNull(),
  domain: text('domain'),
  industry: text('industry'),
  annualRevenueUsd: bigint('annual_revenue_usd', { mode: 'number' }),
  employeeCount: integer('employee_count'),
  parentAccountId: uuid('parent_account_id'),
  ownerUserId: uuid('owner_user_id'),
  customFields: jsonb('custom_fields').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('accounts_org_idx').on(t.orgId),
  index('accounts_parent_idx').on(t.parentAccountId),
  index('accounts_owner_idx').on(t.ownerUserId),
]);
