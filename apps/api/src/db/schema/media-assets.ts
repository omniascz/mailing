import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  index,
  jsonb,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

/** What the editor did to the parent to produce this asset. */
export interface AssetTransform {
  crop?: { left: number; top: number; width: number; height: number };
  resize?: { width?: number; height?: number };
  rotate?: number;
  format?: string;
  quality?: number;
}

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
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

    /**
     * The asset this one was cropped or resized from, if any.
     *
     * A derivative is a NEW row rather than an overwrite of the old one. The
     * URL of an asset is quoted in places nobody can edit afterwards: block
     * JSON in campaigns that have already been delivered, saved templates, and
     * the view-in-browser page, which re-renders from campaign content on every
     * request. Replacing the bytes behind a URL would silently change what a
     * mail sent last month shows today.
     *
     * SET NULL rather than cascade: deleting the original must not delete the
     * crop someone is using.
     */
    derivedFromId: uuid('derived_from_id').references((): AnyPgColumn => mediaAssets.id, {
      onDelete: 'set null',
    }),
    /** The operations that produced this asset from its parent. */
    transform: jsonb('transform').$type<AssetTransform>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('media_assets_org_idx').on(t.orgId),
    index('media_assets_folder_idx').on(t.orgId, t.folder),
    index('media_assets_derived_from_idx').on(t.derivedFromId),
  ],
);

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;
