import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const webhookDeliveryStatusEnum = pgEnum('webhook_delivery_status', [
  'pending',
  'success',
  'failed',
  'retrying',
]);

// ─── Webhooks ─────────────────────────────────────────────────────────────────

/**
 * Supported event types. Passed as an array in the `events` column.
 */
export const WEBHOOK_EVENTS = [
  'contact.created',
  'contact.updated',
  'contact.deleted',
  'campaign.sent',
  'email.delivered',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.unsubscribed',
  'email.complained',
  'sms.delivered',
  'sms.failed',
  'workflow.completed',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    url: varchar('url', { length: 2048 }).notNull(),
    /** HMAC-SHA256 signing secret (stored hashed — never returned in API) */
    secret: varchar('secret', { length: 255 }).notNull(),
    /** Array of subscribed event types, e.g. ['email.opened', 'contact.created'] */
    events: text('events')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    description: varchar('description', { length: 255 }),
    active: boolean('active').notNull().default(true),

    /** Delivery priority 1 (highest) … 10 (lowest). Priority 1 is flushed immediately. */
    priority: integer('priority').notNull().default(5),

    /** Max events per HTTP call (1 = no batching, up to 100). Batch payload = array. */
    batchSize: integer('batch_size').notNull().default(1),

    /** Max seconds to hold a partial batch before flushing (only when batchSize > 1). */
    batchFlushSeconds: integer('batch_flush_seconds').notNull().default(30),

    /** Counts for monitoring */
    totalDeliveries: integer('total_deliveries').notNull().default(0),
    failedDeliveries: integer('failed_deliveries').notNull().default(0),
    lastDeliveredAt: timestamp('last_delivered_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('webhooks_org_id_idx').on(t.orgId), index('webhooks_active_idx').on(t.active)],
);

// ─── Webhook deliveries ───────────────────────────────────────────────────────

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    webhookId: uuid('webhook_id')
      .notNull()
      .references(() => webhooks.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    event: varchar('event', { length: 100 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),

    status: webhookDeliveryStatusEnum('status').notNull().default('pending'),
    statusCode: integer('status_code'),
    responseBody: text('response_body'),
    attempts: integer('attempts').notNull().default(0),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('webhook_deliveries_webhook_id_idx').on(t.webhookId),
    index('webhook_deliveries_org_id_idx').on(t.orgId),
    index('webhook_deliveries_status_idx').on(t.status),
    index('webhook_deliveries_next_retry_at_idx').on(t.nextRetryAt),
  ],
);

// ─── API keys ─────────────────────────────────────────────────────────────────

/**
 * Org-scoped API keys for machine-to-machine access (public REST API, Zapier).
 * The `keyHash` stores SHA-256(key). The actual key is only shown once at creation.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id'), // who created this key
    name: varchar('name', { length: 255 }).notNull(),
    keyHash: varchar('key_hash', { length: 255 }).notNull().unique(),
    keyPrefix: varchar('key_prefix', { length: 16 }).notNull(), // e.g. "fm_live_xxxx"
    scopes: text('scopes')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    active: boolean('active').notNull().default(true),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('api_keys_org_id_idx').on(t.orgId), index('api_keys_key_hash_idx').on(t.keyHash)],
);

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
