import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { lists } from './lists.js';
import { templates } from './templates.js';
import { campaignTypeEnum, campaignStatusEnum } from './enums.js';

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 255 }).notNull(),
    type: campaignTypeEnum('type').notNull().default('email'),
    status: campaignStatusEnum('status').notNull().default('draft'),

    // Email-specific
    subject: varchar('subject', { length: 255 }),
    preheader: varchar('preheader', { length: 255 }),
    fromName: varchar('from_name', { length: 100 }),
    fromEmail: varchar('from_email', { length: 255 }),
    replyTo: varchar('reply_to', { length: 255 }),

    // Content (block JSON or template reference)
    templateId: uuid('template_id').references(() => templates.id),
    content: jsonb('content').$type<Record<string, unknown>>().notNull().default({}),

    // Audience
    listId: uuid('list_id').references(() => lists.id),
    segmentId: uuid('segment_id'),
    excludeSegmentId: uuid('exclude_segment_id'),
    estimatedRecipients: integer('estimated_recipients').default(0),

    // A/B testing
    abConfig: jsonb('ab_config').$type<Record<string, unknown>>(),

    // Scheduling
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    timezone: varchar('timezone', { length: 100 }).notNull().default('UTC'),

    // Stats (denormalized for fast list views; full data in ClickHouse)
    totalSent: integer('total_sent').notNull().default(0),
    totalDelivered: integer('total_delivered').notNull().default(0),
    totalOpens: integer('total_opens').notNull().default(0),
    totalClicks: integer('total_clicks').notNull().default(0),
    totalBounces: integer('total_bounces').notNull().default(0),
    totalUnsubscribes: integer('total_unsubscribes').notNull().default(0),
    totalComplaints: integer('total_complaints').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('campaigns_org_id_idx').on(t.orgId),
    index('campaigns_status_idx').on(t.status),
    index('campaigns_scheduled_at_idx').on(t.scheduledAt),
    index('campaigns_org_status_idx').on(t.orgId, t.status),
  ],
);

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
