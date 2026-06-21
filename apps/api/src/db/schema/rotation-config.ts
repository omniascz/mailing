import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  boolean,
  jsonb,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { users } from './users.js';

export const rotationStrategyEnum = pgEnum('rotation_strategy', [
  'round_robin', // sequential rotation
  'load_balanced', // assign to user with fewest open records
  'random', // random assignment from pool
]);

export const rotationEntityTypeEnum = pgEnum('rotation_entity_type', [
  'deal',
  'contact',
  'ticket',
  'lead',
]);

/**
 * Rotation pool configuration — defines which users to rotate across for a
 * given entity type (deal/contact/ticket/lead) and optional pipeline.
 */
export const rotationConfigs = pgTable(
  'rotation_configs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    entityType: rotationEntityTypeEnum('entity_type').notNull(),
    /** Optional: scope this pool to a specific pipeline/stage */
    pipelineId: uuid('pipeline_id'),
    strategy: rotationStrategyEnum('strategy').notNull().default('round_robin'),
    /** Ordered list of user IDs in the pool */
    userIds: jsonb('user_ids').$type<string[]>().notNull().default([]),
    active: boolean('active').notNull().default(true),
    /** Index of last assigned user in userIds (for round-robin) */
    lastAssignedIndex: integer('last_assigned_index').notNull().default(-1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('rotation_configs_org_type_uq').on(t.orgId, t.entityType, t.pipelineId),
    index('rotation_configs_org_idx').on(t.orgId),
  ],
);

export const rotationAssignmentLogs = pgTable(
  'rotation_assignment_logs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull(),
    configId: uuid('config_id')
      .notNull()
      .references(() => rotationConfigs.id, { onDelete: 'cascade' }),
    entityType: varchar('entity_type', { length: 32 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    assignedUserId: uuid('assigned_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('rotation_logs_config_idx').on(t.configId),
    index('rotation_logs_entity_idx').on(t.orgId, t.entityType, t.entityId),
  ],
);

export type RotationConfig = typeof rotationConfigs.$inferSelect;
export type NewRotationConfig = typeof rotationConfigs.$inferInsert;
