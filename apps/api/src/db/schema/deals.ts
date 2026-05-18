import { sql } from 'drizzle-orm';
import { pgTable, pgEnum, uuid, text, timestamp, jsonb, numeric, integer, index } from 'drizzle-orm/pg-core';

export const dealStatusEnum = pgEnum('deal_status', ['open', 'won', 'lost']);

export const deals = pgTable('deals', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  pipelineId: uuid('pipeline_id').notNull(),
  stageId: text('stage_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  contactId: uuid('contact_id'),
  accountId: uuid('account_id'),
  value: numeric('value', { precision: 18, scale: 2 }).notNull().default('0'),
  currency: text('currency').notNull().default('USD'),
  expectedCloseDate: timestamp('expected_close_date', { withTimezone: true }),
  actualCloseDate: timestamp('actual_close_date', { withTimezone: true }),
  ownerUserId: uuid('owner_user_id'),
  teamId: uuid('team_id'),
  status: dealStatusEnum('status').notNull().default('open'),
  lostReason: text('lost_reason'),
  source: text('source'),
  customFields: jsonb('custom_fields').$type<Record<string, unknown>>(),
  stageChangedAt: timestamp('stage_changed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('deals_org_idx').on(t.orgId),
  index('deals_pipeline_idx').on(t.pipelineId),
  index('deals_contact_idx').on(t.contactId),
  index('deals_account_idx').on(t.accountId),
  index('deals_owner_idx').on(t.ownerUserId),
  index('deals_team_idx').on(t.teamId),
  index('deals_org_status_idx').on(t.orgId, t.status),
  index('deals_stage_idx').on(t.pipelineId, t.stageId),
]);

// Stage transition audit trail for velocity/conversion reports.
export const dealStageHistory = pgTable('deal_stage_history', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  dealId: uuid('deal_id').notNull(),
  fromStageId: text('from_stage_id'),
  toStageId: text('to_stage_id').notNull(),
  durationSeconds: integer('duration_seconds'), // time spent in previous stage
  changedByUserId: uuid('changed_by_user_id'),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('deal_stage_history_deal_idx').on(t.dealId),
  index('deal_stage_history_org_idx').on(t.orgId),
]);
