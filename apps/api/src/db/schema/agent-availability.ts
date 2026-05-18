/**
 * Agent availability & chat routing schema (#245).
 *
 * agent_availability  — per-agent status + skills (replaces agentPresence for chat)
 * routing_rules       — org-level rules: which queue/channel → which assignment strategy
 * ticket_assignments  — audit log of every assignment action
 */

import { pgTable, uuid, varchar, boolean, integer, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { users } from './users.js';

// ─── Agent availability ───────────────────────────────────────────────────────

export const agentAvailability = pgTable(
  'agent_availability',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** online | away | busy | offline */
    status: varchar('status', { length: 32 }).notNull().default('offline'),
    /** Max concurrent chats this agent will accept (0 = unlimited). */
    maxConcurrent: integer('max_concurrent').notNull().default(5),
    /** Current open ticket count assigned to this agent. */
    activeCount: integer('active_count').notNull().default(0),
    /** Skill tags: e.g. ['billing', 'technical', 'spanish'] */
    skills: jsonb('skills').$type<string[]>().notNull().default([]),
    /** Accept chats on these channels only; empty = accept all. */
    channels: jsonb('channels').$type<string[]>().notNull().default([]),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('agent_availability_user_uq').on(t.orgId, t.userId),
    index('agent_availability_org_status_idx').on(t.orgId, t.status),
  ],
);

// ─── Routing rules ────────────────────────────────────────────────────────────

export const chatRoutingRules = pgTable(
  'chat_routing_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    /** Channel this rule applies to; null = all channels. */
    channel: varchar('channel', { length: 64 }),
    /** round-robin | skill-based | manual | least-loaded */
    strategy: varchar('strategy', { length: 32 }).notNull().default('round-robin'),
    /** Required skill tag for skill-based routing (optional). */
    requiredSkill: varchar('required_skill', { length: 128 }),
    /** Specific agent IDs to include; empty = all available agents. */
    agentIds: jsonb('agent_ids').$type<string[]>().notNull().default([]),
    /** Priority 1 (highest) … 10 (lowest); first matching rule wins. */
    priority: integer('priority').notNull().default(5),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('chat_routing_rules_org_idx').on(t.orgId, t.priority),
  ],
);

// ─── Ticket assignment log ────────────────────────────────────────────────────

export const ticketAssignments = pgTable(
  'ticket_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    ticketId: uuid('ticket_id').notNull(),
    assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
    /** auto-round-robin | auto-skill | manual | unassigned */
    reason: varchar('reason', { length: 64 }).notNull().default('manual'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ticket_assignments_ticket_idx').on(t.ticketId),
    index('ticket_assignments_org_agent_idx').on(t.orgId, t.assignedTo),
  ],
);

export type AgentAvailability = typeof agentAvailability.$inferSelect;
export type ChatRoutingRule = typeof chatRoutingRules.$inferSelect;
export type TicketAssignment = typeof ticketAssignments.$inferSelect;
