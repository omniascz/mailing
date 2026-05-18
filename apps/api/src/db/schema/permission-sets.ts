/**
 * Custom permission sets (#345, §17-I).
 *
 * Roles (owner/admin/editor/viewer) are coarse. Permission sets let an org
 * admin assemble fine-grained capabilities — "Campaign manager", "Read-only
 * analyst", etc. — and assign them to users on top of (or instead of) the
 * baseline role permissions.
 *
 * A permission is an opaque string, e.g. `campaigns:write`, `analytics:read`,
 * `webhooks:manage`. The set carries an array of those plus a name and an
 * optional description. Resolution (role + sets → effective permission set)
 * is the job of `services/auth/permission-sets.ts` (pure helpers + DB lookup).
 */

import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, varchar, text, jsonb, timestamp, boolean, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { users } from './users.js';

export const permissionSets = pgTable(
  'permission_sets',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 128 }).notNull(),
    description: text('description'),

    /** Array of permission strings. Stored as jsonb for flexible querying. */
    permissions: jsonb('permissions').$type<string[]>().notNull().default([]),

    /** Built-in sets (e.g. seeded "Campaign Manager") cannot be edited. */
    isSystem: boolean('is_system').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('permission_sets_org_name_uq').on(t.orgId, t.name),
    index('permission_sets_org_idx').on(t.orgId),
  ],
);

export const userPermissionSets = pgTable(
  'user_permission_sets',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    permissionSetId: uuid('permission_set_id').notNull()
      .references(() => permissionSets.id, { onDelete: 'cascade' }),

    /** Audit trail. */
    grantedByUserId: uuid('granted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('user_permission_sets_user_set_uq').on(t.userId, t.permissionSetId),
    index('user_permission_sets_org_user_idx').on(t.orgId, t.userId),
  ],
);

export type PermissionSet = typeof permissionSets.$inferSelect;
export type NewPermissionSet = typeof permissionSets.$inferInsert;
export type UserPermissionSet = typeof userPermissionSets.$inferSelect;
