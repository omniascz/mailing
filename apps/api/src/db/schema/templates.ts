import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { templateCategoryEnum } from './enums.js';

export const templates = pgTable(
  'templates',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: varchar('description', { length: 1000 }),
    category: templateCategoryEnum('category').notNull().default('custom'),
    thumbnailUrl: varchar('thumbnail_url', { length: 1024 }),

    // Email block schema
    subject: varchar('subject', { length: 255 }),
    preheader: varchar('preheader', { length: 255 }),
    blocks: jsonb('blocks').$type<unknown[]>().notNull().default([]),
    globalStyles: jsonb('global_styles').$type<Record<string, unknown>>().notNull().default({}),

    // Rendered HTML cache (regenerated on save)
    renderedHtml: jsonb('rendered_html'),

    isPublic: varchar('is_public', { length: 5 }).notNull().default('false'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),

    locale: varchar('locale', { length: 8 }).notNull().default('en'),
    translationGroupId: uuid('translation_group_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('templates_org_id_idx').on(t.orgId),
    index('templates_category_idx').on(t.category),
    index('templates_locale_idx').on(t.orgId, t.locale),
    index('templates_tgroup_idx').on(t.translationGroupId),
  ],
);

export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
