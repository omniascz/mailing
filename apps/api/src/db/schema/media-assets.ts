import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, integer, index, jsonb } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    folder: varchar('folder', { length: 255 }).notNull().default('/'),
    filename: varchar('filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    width: integer('width'),
    height: integer('height'),
    storageUrl: varchar('storage_url', { length: 1024 }).notNull(),
    thumbnailUrl: varchar('thumbnail_url', { length: 1024 }),
    altText: varchar('alt_text', { length: 512 }),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('media_assets_org_idx').on(t.orgId),
    index('media_assets_folder_idx').on(t.orgId, t.folder),
  ],
);

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;
