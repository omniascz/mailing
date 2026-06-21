/**
 * Digital asset delivery tables (#648, #649).
 *
 * Supports:
 *  - digital_assets: files stored in S3/MinIO (e-books, PDFs, software)
 *  - digital_asset_deliveries: per-contact delivery records (secure signed URL log)
 *  - license_keys: generated product license keys
 */

import {
  pgTable, uuid, varchar, integer, boolean, timestamp, jsonb, index, unique,
} from 'drizzle-orm/pg-core';

// ─── Digital assets ───────────────────────────────────────────────────────────

export const digitalAssets = pgTable(
  'digital_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: varchar('description', { length: 1000 }),
    /** S3/MinIO object key */
    storageKey: varchar('storage_key', { length: 1024 }),
    /** Pre-set external URL (alternative to S3 storage) */
    externalUrl: varchar('external_url', { length: 2048 }),
    /** MIME type */
    contentType: varchar('content_type', { length: 100 }),
    /** File size in bytes */
    fileSizeBytes: integer('file_size_bytes'),
    /** Max downloads per contact (null = unlimited) */
    maxDownloads: integer('max_downloads'),
    /** Signed URL expiry in seconds (default 1 hour) */
    urlExpirySeconds: integer('url_expiry_seconds').default(3600),
    /** Whether a license key should be generated on delivery */
    requiresLicenseKey: boolean('requires_license_key').notNull().default(false),
    active: boolean('active').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('digital_assets_org_id_idx').on(t.orgId),
  ],
);

// ─── Delivery records ─────────────────────────────────────────────────────────

export const digitalAssetDeliveries = pgTable(
  'digital_asset_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    assetId: uuid('asset_id').notNull(),
    contactId: uuid('contact_id'),
    /** Signed URL token (hashed) for dedup + expiry tracking */
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    /** License key if one was generated */
    licenseKeyId: uuid('license_key_id'),
    downloadCount: integer('download_count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    firstDownloadAt: timestamp('first_download_at', { withTimezone: true }),
    lastDownloadAt: timestamp('last_download_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('digital_asset_deliveries_token_hash_uniq').on(t.tokenHash),
    index('digital_asset_deliveries_asset_contact_idx').on(t.assetId, t.contactId),
    index('digital_asset_deliveries_org_idx').on(t.orgId),
  ],
);

// ─── License keys ─────────────────────────────────────────────────────────────

export type LicenseKeyStatus = 'active' | 'revoked' | 'expired';

export const licenseKeys = pgTable(
  'license_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    assetId: uuid('asset_id').notNull(),
    contactId: uuid('contact_id'),
    key: varchar('key', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 })
      .notNull()
      .$type<LicenseKeyStatus>()
      .default('active'),
    /** Max activations allowed (null = unlimited) */
    maxActivations: integer('max_activations'),
    activationCount: integer('activation_count').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    unique('license_keys_key_uniq').on(t.orgId, t.key),
    index('license_keys_asset_contact_idx').on(t.assetId, t.contactId),
    index('license_keys_org_idx').on(t.orgId),
  ],
);

export type DigitalAsset = typeof digitalAssets.$inferSelect;
export type DigitalAssetDelivery = typeof digitalAssetDeliveries.$inferSelect;
export type LicenseKey = typeof licenseKeys.$inferSelect;
