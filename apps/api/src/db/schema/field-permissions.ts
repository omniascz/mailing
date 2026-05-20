import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

/**
 * Field-level permissions (#344) — per (role, entity) rules that narrow which
 * fields a request can read or write. A rule is:
 *   - `readable`: whitelist of fields visible in responses. `['*']` = all.
 *   - `hidden`:   blacklist applied on top of readable.
 *   - `writable`: whitelist of fields the role may include in POST/PATCH.
 *
 * Rows apply per org + role + entity; if no row exists the default is full
 * access. `role` matches UserRole ('owner'|'admin'|'editor'|'viewer') OR a
 * custom role name (future). `entity` is the Drizzle table name, e.g.
 * `contacts`, `deals`.
 */
export const fieldPermissions = pgTable(
  'field_permissions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 64 }).notNull(),
    entity: varchar('entity', { length: 64 }).notNull(),
    readable: jsonb('readable').$type<string[]>().notNull().default(['*']),
    hidden: jsonb('hidden').$type<string[]>().notNull().default([]),
    writable: jsonb('writable').$type<string[]>().notNull().default(['*']),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('field_permissions_org_role_entity_uq').on(t.orgId, t.role, t.entity),
    index('field_permissions_org_idx').on(t.orgId),
  ],
);

export type FieldPermission = typeof fieldPermissions.$inferSelect;
