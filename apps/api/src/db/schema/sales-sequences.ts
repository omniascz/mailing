import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const sequenceStepTypeEnum = pgEnum('sequence_step_type', [
  'email', // send an email (personal or template)
  'personal_email', // 1:1 plain-text personal email
  'wait', // wait N days/hours
  'task', // create a CRM task (call/meeting/todo)
  'sms', // send an SMS
  'linkedin', // LinkedIn touch reminder task
]);

export const sequenceEnrollmentStatusEnum = pgEnum('sequence_enrollment_status', [
  'active',
  'paused',
  'completed',
  'replied', // contact replied → auto-exit
  'unsubscribed', // contact unsubscribed → auto-exit
  'bounced',
  'cancelled',
]);

// ─── Sequence definition ──────────────────────────────────────────────────────

export interface SequenceStep {
  id: string;
  type: 'email' | 'personal_email' | 'wait' | 'task' | 'sms' | 'linkedin';
  order: number;
  /** Wait N days after previous step before executing this one */
  delayDays: number;
  /** Step-specific config */
  config: Record<string, unknown>;
}

export const salesSequences = pgTable(
  'sales_sequences',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    steps: jsonb('steps').$type<SequenceStep[]>().notNull().default([]),
    /** When enabled, auto-exit if contact replies to any step email */
    exitOnReply: boolean('exit_on_reply').notNull().default(true),
    /** When enabled, auto-exit if contact unsubscribes */
    exitOnUnsubscribe: boolean('exit_on_unsubscribe').notNull().default(true),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('sales_sequences_org_idx').on(t.orgId)],
);

// ─── Enrollment — contact/deal enrolled in a sequence ────────────────────────

export const sequenceEnrollments = pgTable(
  'sequence_enrollments',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull(),
    sequenceId: uuid('sequence_id')
      .notNull()
      .references(() => salesSequences.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').notNull(),
    dealId: uuid('deal_id'),
    /** Who enrolled this contact (user or null=automation) */
    enrolledByUserId: uuid('enrolled_by_user_id'),
    /** The rep from whom personal emails will be sent */
    senderEmail: varchar('sender_email', { length: 255 }),
    senderName: varchar('sender_name', { length: 255 }),
    status: sequenceEnrollmentStatusEnum('status').notNull().default('active'),
    /** Index of the next step to execute (0 = first step) */
    currentStepIndex: integer('current_step_index').notNull().default(0),
    /** When to execute the next step */
    nextStepAt: timestamp('next_step_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('seq_enrollments_org_idx').on(t.orgId),
    index('seq_enrollments_contact_idx').on(t.contactId),
    index('seq_enrollments_next_step_idx').on(t.nextStepAt),
    index('seq_enrollments_sequence_idx').on(t.sequenceId),
    uniqueIndex('seq_enrollments_unique_active_idx').on(t.sequenceId, t.contactId),
  ],
);

// ─── Step execution log ───────────────────────────────────────────────────────

export const sequenceStepLogs = pgTable(
  'sequence_step_logs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull(),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => sequenceEnrollments.id, { onDelete: 'cascade' }),
    sequenceId: uuid('sequence_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    stepIndex: integer('step_index').notNull(),
    stepType: sequenceStepTypeEnum('step_type').notNull(),
    executedAt: timestamp('executed_at', { withTimezone: true }).notNull().defaultNow(),
    result: jsonb('result').$type<Record<string, unknown>>(),
  },
  (t) => [
    index('seq_step_logs_enrollment_idx').on(t.enrollmentId),
    index('seq_step_logs_contact_idx').on(t.contactId),
  ],
);

export type SalesSequence = typeof salesSequences.$inferSelect;
export type SequenceEnrollment = typeof sequenceEnrollments.$inferSelect;
export type SequenceStepLog = typeof sequenceStepLogs.$inferSelect;
