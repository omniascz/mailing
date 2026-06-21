import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';
import { deals } from './deals.js';
import { users } from './users.js';

export const playbookStepTypeEnum = pgEnum('playbook_step_type', [
  'call', // make a phone call
  'email', // send an email
  'linkedin', // LinkedIn touch
  'meeting', // schedule a meeting
  'task', // generic task
  'question', // discovery question to ask
  'note', // note/tip for the rep
]);

export interface PlaybookStep {
  id: string;
  type: 'call' | 'email' | 'linkedin' | 'meeting' | 'task' | 'question' | 'note';
  order: number;
  title: string;
  description?: string;
  /** For question steps: the question text */
  question?: string;
  /** Suggested talk track or script */
  script?: string;
  required: boolean;
}

export const playbooks = pgTable(
  'playbooks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    /** Which entity types this playbook applies to */
    entityTypes: jsonb('entity_types')
      .$type<Array<'contact' | 'deal' | 'account'>>()
      .notNull()
      .default(['deal']),
    steps: jsonb('steps').$type<PlaybookStep[]>().notNull().default([]),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('playbooks_org_idx').on(t.orgId)],
);

export const playbookRunStatusEnum = pgEnum('playbook_run_status', [
  'in_progress',
  'completed',
  'abandoned',
]);

export interface PlaybookStepLog {
  stepId: string;
  completedAt?: string;
  skipped?: boolean;
  notes?: string;
  outcome?: string;
}

export const playbookRuns = pgTable(
  'playbook_runs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    playbookId: uuid('playbook_id')
      .notNull()
      .references(() => playbooks.id, { onDelete: 'cascade' }),
    /** The entity being run through this playbook */
    entityType: varchar('entity_type', { length: 32 }).notNull(),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
    assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
    status: playbookRunStatusEnum('status').notNull().default('in_progress'),
    /** Completion logs per step */
    stepLogs: jsonb('step_logs').$type<PlaybookStepLog[]>().notNull().default([]),
    currentStepIndex: varchar('current_step_index', { length: 8 }).notNull().default('0'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('playbook_runs_org_idx').on(t.orgId),
    index('playbook_runs_playbook_idx').on(t.playbookId),
    index('playbook_runs_contact_idx').on(t.contactId),
    index('playbook_runs_deal_idx').on(t.dealId),
  ],
);

export type Playbook = typeof playbooks.$inferSelect;
export type NewPlaybook = typeof playbooks.$inferInsert;
export type PlaybookRun = typeof playbookRuns.$inferSelect;
export type NewPlaybookRun = typeof playbookRuns.$inferInsert;
