import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, integer, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { users } from './users.js';

export const complianceControls = pgTable(
  'compliance_controls',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    controlId: varchar('control_id', { length: 50 }).notNull(),
    category: varchar('category', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    implemented: boolean('implemented').notNull().default(false),
    evidenceUrl: varchar('evidence_url', { length: 1024 }),
    evidenceNotes: text('evidence_notes'),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    nextReviewAt: timestamp('next_review_at', { withTimezone: true }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('compliance_controls_org_control_idx').on(t.orgId, t.controlId)],
);

export const accessReviews = pgTable(
  'access_reviews',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    reviewerUserId: uuid('reviewer_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    usersReviewed: integer('users_reviewed').notNull().default(0),
    usersRevoked: integer('users_revoked').notNull().default(0),
    findings: text('findings'),
    report: jsonb('report').$type<Record<string, unknown>>().notNull().default({}),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('access_reviews_org_idx').on(t.orgId, t.reviewedAt)],
);

export const dataRetentionPolicies = pgTable(
  'data_retention_policies',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    resource: varchar('resource', { length: 64 }).notNull(),
    retentionDays: integer('retention_days').notNull(),
    lastEnforcedAt: timestamp('last_enforced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('retention_policies_org_resource_idx').on(t.orgId, t.resource)],
);

export type ComplianceControl = typeof complianceControls.$inferSelect;
export type AccessReview = typeof accessReviews.$inferSelect;
export type DataRetentionPolicy = typeof dataRetentionPolicies.$inferSelect;
