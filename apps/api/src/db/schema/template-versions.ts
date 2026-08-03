import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { templates } from './templates.js';

/**
 * Immutable version history for org-owned templates (SendGrid dynamic-template
 * versions parity). A snapshot is written before each update, so any prior
 * revision can be listed and restored.
 */
export const templateVersions = pgTable(
  'template_versions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id')
      .notNull()
      .references(() => templates.id, { onDelete: 'cascade' }),
    /** Monotonic per-template version number (1, 2, 3 …). */
    version: integer('version').notNull(),
    name: varchar('name', { length: 255 }),
    subject: varchar('subject', { length: 255 }),
    preheader: varchar('preheader', { length: 255 }),
    blocks: jsonb('blocks').$type<unknown[]>().notNull().default([]),
    globalStyles: jsonb('global_styles').$type<Record<string, unknown>>().notNull().default({}),
    /** User who triggered the change that produced this snapshot. */
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('template_versions_org_idx').on(t.orgId),
    index('template_versions_template_idx').on(t.templateId, t.version),
    uniqueIndex('template_versions_template_version_uq').on(t.templateId, t.version),
  ],
);

export type TemplateVersion = typeof templateVersions.$inferSelect;
export type NewTemplateVersion = typeof templateVersions.$inferInsert;
