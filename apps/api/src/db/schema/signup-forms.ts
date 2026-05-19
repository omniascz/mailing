import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const embedTypeEnum = pgEnum('embed_type', [
  'inline',
  'popup',
  'slide',
  'floating',
]);

// ─── Signup form definition ───────────────────────────────────────────────────

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'select' | 'checkbox' | 'hidden';
  required: boolean;
  options?: string[];          // for select fields
  placeholder?: string;
  defaultValue?: string;
}

export interface FormConfig {
  submitButtonText?: string;
  successMessage?: string;
  redirectUrl?: string;
  doubleOptIn?: boolean;
  tags?: string[];             // auto-apply these tags on submit
  workflowId?: string;         // trigger this workflow on submit
  styles?: Record<string, string>;
}

export const signupForms = pgTable(
  'signup_forms',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    listId: uuid('list_id'),  // optional: auto-add to this list
    name: varchar('name', { length: 255 }).notNull(),
    fields: jsonb('fields').$type<FormField[]>().notNull().default([]),
    embedType: embedTypeEnum('embed_type').notNull().default('inline'),
    config: jsonb('config').$type<FormConfig>().notNull().default({}),
    active: boolean('active').notNull().default(true),

    /** Analytics (denormalized for fast reads) */
    viewCount: integer('view_count').notNull().default(0),
    submitCount: integer('submit_count').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('signup_forms_org_id_idx').on(t.orgId),
    index('signup_forms_active_idx').on(t.active),
  ],
);

// ─── A/B Variants ─────────────────────────────────────────────────────────────

/**
 * A/B test variant for a signup form.
 * Each variant overrides fields and/or config of its parent form.
 * Traffic is split via trafficSplit (integer 0–100, sum across variants ≤ 100;
 * remaining traffic goes to the control / parent form).
 *
 * The embed script assigns visitors pseudo-randomly to a variant on first view
 * and persists the assignment in localStorage for consistency.
 */
export const signupFormVariants = pgTable(
  'signup_form_variants',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    formId: uuid('form_id')
      .notNull()
      .references(() => signupForms.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    /** 0–100 — percentage of visitors routed to this variant */
    trafficSplit: integer('traffic_split').notNull().default(50),
    /** Override the parent form's fields (null = use parent) */
    fields: jsonb('fields').$type<FormField[] | null>(),
    /** Override the parent form's config (null = use parent) */
    config: jsonb('config').$type<FormConfig | null>(),
    active: boolean('active').notNull().default(true),
    viewCount: integer('view_count').notNull().default(0),
    submitCount: integer('submit_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('signup_form_variants_form_id_idx').on(t.formId),
    index('signup_form_variants_org_id_idx').on(t.orgId),
  ],
);

export type SignupFormVariant = typeof signupFormVariants.$inferSelect;
export type NewSignupFormVariant = typeof signupFormVariants.$inferInsert;

// ─── Submissions ──────────────────────────────────────────────────────────────

export const signupFormSubmissions = pgTable(
  'signup_form_submissions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    formId: uuid('form_id')
      .notNull()
      .references(() => signupForms.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    data: jsonb('data').$type<Record<string, string>>().notNull().default({}),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: varchar('user_agent', { length: 512 }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('signup_form_submissions_form_id_idx').on(t.formId),
    index('signup_form_submissions_org_id_idx').on(t.orgId),
    index('signup_form_submissions_contact_id_idx').on(t.contactId),
  ],
);

// ─── Migration jobs ───────────────────────────────────────────────────────────

export const migrationJobStatusEnum = pgEnum('migration_job_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
  // Sprint C.9 — completed/failed job whose imported contacts have been
  // soft-deleted via /api/v1/migrations/:id/rollback. Keeps the job row
  // around (with progress + errorMessage) so the rollback decision is
  // audit-traceable.
  'rolled_back',
]);

export interface MigrationProgress {
  step: string;
  totalLists?: number;
  processedLists?: number;
  totalContacts?: number;
  processedContacts?: number;
  totalTemplates?: number;
  processedTemplates?: number;
  imported?: number;
  skipped?: number;
  errors?: string[];
}

export const migrationJobs = pgTable(
  'migration_jobs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),   // 'mailchimp' | future providers
    status: migrationJobStatusEnum('status').notNull().default('pending'),
    progress: jsonb('progress').$type<MigrationProgress>().notNull().default(sql`'{}'::jsonb`),
    errorMessage: varchar('error_message', { length: 2048 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('migration_jobs_org_id_idx').on(t.orgId),
    index('migration_jobs_status_idx').on(t.status),
  ],
);

export type SignupForm = typeof signupForms.$inferSelect;
export type NewSignupForm = typeof signupForms.$inferInsert;
export type SignupFormSubmission = typeof signupFormSubmissions.$inferSelect;
export type MigrationJob = typeof migrationJobs.$inferSelect;
