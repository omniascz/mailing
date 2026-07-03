/**
 * Inbound receipt rules (SES Mail Manager / receipt rule sets). Per-tenant,
 * ordered rules that match received mail (recipient / sender / subject) and run
 * actions (route to helpdesk, POST to a webhook, fire a workflow event, store,
 * drop, or stop). Replaces the previously hardcoded routing.
 */
import { pgTable, uuid, varchar, integer, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export interface InboundRuleMatch {
  /** Regex (string) tested against the recipient address. Empty = any. */
  recipientPattern?: string;
  fromPattern?: string;
  subjectPattern?: string;
}

export type InboundActionType =
  | 'helpdesk'
  | 'webhook'
  | 'workflow_event'
  | 'store'
  | 'drop'
  | 'stop';

export interface InboundAction {
  type: InboundActionType;
  /** For 'webhook'/'store': destination URL. */
  url?: string;
  /** For 'workflow_event': the event name fired. */
  eventName?: string;
  /** For 'helpdesk': ticket subject prefix. */
  ticketSubjectPrefix?: string;
}

export const inboundRules = pgTable(
  'inbound_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }).notNull(),
    priority: integer('priority').notNull().default(100),
    active: boolean('active').notNull().default(true),
    match: jsonb('match').$type<InboundRuleMatch>().notNull().default({}),
    actions: jsonb('actions').$type<InboundAction[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('inbound_rules_org_idx').on(t.orgId)],
);

export type InboundRule = typeof inboundRules.$inferSelect;
