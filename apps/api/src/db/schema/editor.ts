import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { users } from './users.js';

// ---------------------------------------------------------------------------
// Saved blocks — reusable email blocks stored per org
// ---------------------------------------------------------------------------

export const savedBlocks = pgTable(
  'saved_blocks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 255 }).notNull(),
    category: varchar('category', { length: 100 }).notNull().default('uncategorized'),
    /** Serialised Block JSON (matches @forgemsg/editor Block type) */
    blockData: jsonb('block_data').notNull(),
    thumbnailUrl: varchar('thumbnail_url', { length: 1024 }),
    locale: varchar('locale', { length: 8 }).notNull().default('en'),
    translationGroupId: uuid('translation_group_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('saved_blocks_org_idx').on(t.orgId),
    index('saved_blocks_org_category_idx').on(t.orgId, t.category),
    index('saved_blocks_tgroup_idx').on(t.translationGroupId),
  ],
);

export type SavedBlock = typeof savedBlocks.$inferSelect;
export type NewSavedBlock = typeof savedBlocks.$inferInsert;

// ---------------------------------------------------------------------------
// Brand kits — per-org visual identity for auto-applying to emails
// ---------------------------------------------------------------------------

export const brandKits = pgTable('brand_kits', {
  orgId: uuid('org_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  logoUrl: varchar('logo_url', { length: 1024 }),
  primaryColor: varchar('primary_color', { length: 7 }).default('#2563eb'),
  secondaryColor: varchar('secondary_color', { length: 7 }).default('#1e40af'),
  accentColor: varchar('accent_color', { length: 7 }).default('#f59e0b'),
  fontHeading: varchar('font_heading', { length: 100 }).default('Arial, Helvetica, sans-serif'),
  fontBody: varchar('font_body', { length: 100 }).default('Arial, Helvetica, sans-serif'),
  footerText: text('footer_text'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BrandKit = typeof brandKits.$inferSelect;
export type NewBrandKit = typeof brandKits.$inferInsert;
