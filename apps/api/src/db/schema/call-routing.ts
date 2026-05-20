import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { users } from './users.js';

// ─── Hunt groups ─────────────────────────────────────────────────────────────

export const huntGroups = pgTable(
  'hunt_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    strategy: varchar('strategy', { length: 32 }).notNull().default('ring-all'),
    memberUserIds: jsonb('member_user_ids').$type<string[]>().notNull().default([]),
    ringTimeoutSeconds: integer('ring_timeout_seconds').notNull().default(30),
    overflowTarget: varchar('overflow_target', { length: 32 }).notNull().default('voicemail'),
    overflowTargetId: uuid('overflow_target_id'),
    // round-robin pointer — index into memberUserIds of next-to-ring agent
    rrIndex: integer('rr_index').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('hunt_groups_org_idx').on(t.orgId)],
);

// ─── IVR menus ───────────────────────────────────────────────────────────────

export interface IvrOption {
  digit: string; // 0-9, *, #
  label: string;
  action: 'hunt-group' | 'ivr-menu' | 'voicemail' | 'voicebot' | 'hangup' | 'external';
  targetId?: string;
  externalNumber?: string;
}

export const ivrMenus = pgTable(
  'ivr_menus',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    greeting: varchar('greeting', { length: 2000 }).notNull(),
    // If set, this IVR is the entry point for the given DID (inbound number)
    didNumber: varchar('did_number', { length: 64 }),
    options: jsonb('options').$type<IvrOption[]>().notNull().default([]),
    timeoutSeconds: integer('timeout_seconds').notNull().default(10),
    invalidTarget: varchar('invalid_target', { length: 32 }).notNull().default('repeat'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ivr_menus_org_idx').on(t.orgId),
    uniqueIndex('ivr_menus_org_did_uq').on(t.orgId, t.didNumber),
  ],
);

// ─── Business hours ──────────────────────────────────────────────────────────

export interface BusinessHoursScheduleEntry {
  day: number; // 0 = Sun, 6 = Sat
  openMinutes: number;
  closeMinutes: number;
}

export interface BusinessHoursHoliday {
  date: string; // YYYY-MM-DD
  name?: string;
}

export const businessHours = pgTable(
  'business_hours',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
    schedule: jsonb('schedule').$type<BusinessHoursScheduleEntry[]>().notNull().default([]),
    holidays: jsonb('holidays').$type<BusinessHoursHoliday[]>().notNull().default([]),
    afterHoursTarget: varchar('after_hours_target', { length: 32 }).notNull().default('voicemail'),
    afterHoursTargetId: uuid('after_hours_target_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('business_hours_org_uq').on(t.orgId)],
);

// ─── Agent presence ──────────────────────────────────────────────────────────

export const agentPresence = pgTable(
  'agent_presence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 32 }).notNull().default('offline'),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('agent_presence_user_uq').on(t.orgId, t.userId)],
);

export type HuntGroup = typeof huntGroups.$inferSelect;
export type IvrMenu = typeof ivrMenus.$inferSelect;
export type BusinessHours = typeof businessHours.$inferSelect;
export type AgentPresence = typeof agentPresence.$inferSelect;
