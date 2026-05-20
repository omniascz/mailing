import { sql } from 'drizzle-orm';
import { pgTable, pgEnum, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';

export const crmTaskTypeEnum = pgEnum('crm_task_type', ['call', 'email', 'meeting', 'todo']);
export const crmTaskStatusEnum = pgEnum('crm_task_status', ['open', 'completed', 'cancelled']);
export const crmTaskPriorityEnum = pgEnum('crm_task_priority', ['low', 'medium', 'high', 'urgent']);

export const crmTasks = pgTable(
  'crm_tasks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull(),

    // What the task is about
    type: crmTaskTypeEnum('type').notNull().default('todo'),
    status: crmTaskStatusEnum('status').notNull().default('open'),
    priority: crmTaskPriorityEnum('priority').notNull().default('medium'),

    title: text('title').notNull(),
    description: text('description'),

    // Optional links (at least one should normally be set)
    contactId: uuid('contact_id'),
    dealId: uuid('deal_id'),
    accountId: uuid('account_id'),

    // Ownership
    assignedUserId: uuid('assigned_user_id'),
    createdByUserId: uuid('created_by_user_id'),

    // Scheduling
    dueAt: timestamp('due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('crm_tasks_org_idx').on(t.orgId),
    index('crm_tasks_contact_idx').on(t.contactId),
    index('crm_tasks_deal_idx').on(t.dealId),
    index('crm_tasks_assigned_idx').on(t.assignedUserId),
    index('crm_tasks_due_idx').on(t.dueAt),
    index('crm_tasks_status_idx').on(t.orgId, t.status),
  ],
);

export type CrmTask = typeof crmTasks.$inferSelect;
export type NewCrmTask = typeof crmTasks.$inferInsert;
