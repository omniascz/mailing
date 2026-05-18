import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

/**
 * Sandboxes (#342) — each row is a link between a "real" org and a sibling
 * org flagged as its sandbox. The sandbox org is a full tenant; this table
 * holds the lifecycle metadata (seed config, expiry, no-op mode, etc.).
 */
export const orgSandboxes = pgTable(
  'org_sandboxes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    sandboxOrgId: uuid('sandbox_org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }).notNull(),
    /** 'dev' | 'staging' | 'training' | 'demo' */
    purpose: varchar('purpose', { length: 32 }).notNull().default('dev'),
    /** 'provisioning' | 'ready' | 'failed' | 'archived' */
    status: varchar('status', { length: 16 }).notNull().default('provisioning'),
    seedConfig: jsonb('seed_config').$type<{
      seedContacts?: number;
      seedCampaigns?: number;
      copyTemplates?: boolean;
      copyWorkflows?: boolean;
      copyBrandKit?: boolean;
    }>().notNull().default({}),
    /** When true, outbound sends are silently swallowed (no external traffic). */
    noOpMode: boolean('no_op_mode').notNull().default(true),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('org_sandboxes_sandbox_uniq').on(t.sandboxOrgId),
    index('org_sandboxes_parent_idx').on(t.orgId),
  ],
);

export type OrgSandbox = typeof orgSandboxes.$inferSelect;
export type NewOrgSandbox = typeof orgSandboxes.$inferInsert;
