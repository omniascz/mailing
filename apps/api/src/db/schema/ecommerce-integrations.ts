/**
 * E-commerce integration schema — #79, #80, #81
 *
 * Supports: Shopify, WooCommerce, BigCommerce, Magento, PrestaShop
 */

import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  jsonb,
  index,
  pgEnum,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const ecommercePlatformEnum = pgEnum('ecommerce_platform', [
  'shopify',
  'woocommerce',
  'bigcommerce',
  'magento',
  'prestashop',
  'shoptet', // #366/#386 — CZ market launch
  'upgates', // #367/#390 — CZ market
  'fastcentrik', // #368/#392 — CZ market
]);

export const ecommerceConnectionStatusEnum = pgEnum('ecommerce_connection_status', [
  'pending', // OAuth not completed / not yet tested
  'active', // Connection healthy
  'paused', // Manually paused
  'error', // Last sync failed
  'revoked', // OAuth token revoked / API key deleted
]);

// ─── Connections ──────────────────────────────────────────────────────────────

export interface ShopifyCredentials {
  shopDomain: string; // e.g. my-store.myshopify.com
  accessToken: string;
  webhookSecret?: string;
  scopes?: string[];
}

export interface WooCommerceCredentials {
  storeUrl: string; // e.g. https://store.example.com
  consumerKey: string;
  consumerSecret: string;
  webhookSecret?: string;
}

export interface BigCommerceCredentials {
  storeHash: string; // e.g. abc123
  accessToken: string;
  clientId: string;
  clientSecret: string;
  webhookSecret?: string;
}

export interface MagentoCredentials {
  baseUrl: string; // e.g. https://store.example.com
  accessToken: string; // integration token
  webhookSecret?: string;
}

export interface PrestaShopCredentials {
  baseUrl: string; // e.g. https://store.example.com
  apiKey: string;
  webhookSecret?: string;
}

/**
 * Upgates credentials (#367/#390).
 * Upgates is a CZ e-shop platform using API-key Basic-Auth. Each eshop has
 * an admin subdomain like `{slug}.admin.upgates.com` against which REST
 * endpoints (`/api/v2/orders`, `/api/v2/customers`, etc.) are served.
 */
export interface UpgatesCredentials {
  /** Admin URL, e.g. `https://shop.admin.upgates.com` */
  adminUrl: string;
  /** API login (user identifier for Basic auth) */
  apiLogin: string;
  /** API key (password for Basic auth) */
  apiKey: string;
  /** Webhook HMAC secret shared with Upgates at webhook registration */
  webhookSecret?: string;
}

/**
 * FastCentrik credentials (#368/#392). FastCentrik publishes orders via an
 * XML feed; product catalogue is exported as XML at a known feed URL.
 */
export interface FastCentrikCredentials {
  /** Eshop base URL, e.g. `https://obchod.example.cz` */
  eshopUrl: string;
  /** Full URL of the orders feed / export endpoint */
  feedUrl: string;
  /** Optional Basic-auth for the feed */
  feedUsername?: string;
  feedPassword?: string;
  /** Webhook HMAC secret (if push webhooks are configured) */
  webhookSecret?: string;
}

/**
 * Shoptet credentials (#366/#386).
 * Shoptet is the dominant CZ e-shop platform (~40% CZ market share).
 * Each eshop has its own base URL; OAuth tokens are minted by Shoptet's
 * partner system and exchanged per-eshop.
 */
export interface ShoptetCredentials {
  /** Eshop base URL, e.g. `https://obchod.example.cz` or `https://example.myshoptet.com` */
  eshopUrl: string;
  /** Access token issued by Shoptet partner OAuth */
  accessToken: string;
  /** Long-lived refresh token — optional if short-lived access tokens aren't used */
  refreshToken?: string;
  /** Unix-seconds expiry of the access token */
  accessTokenExpiresAt?: number;
  /** Webhook HMAC secret shared with Shoptet at webhook registration */
  webhookSecret?: string;
  /** OAuth scopes granted */
  scopes?: string[];
}

export type EcommerceCredentials =
  | ShopifyCredentials
  | WooCommerceCredentials
  | BigCommerceCredentials
  | MagentoCredentials
  | PrestaShopCredentials
  | ShoptetCredentials
  | UpgatesCredentials
  | FastCentrikCredentials;

export interface EcommerceSyncState {
  lastOrderSyncAt?: string;
  lastCustomerSyncAt?: string;
  lastProductSyncAt?: string;
  totalOrdersSynced?: number;
  totalCustomersSynced?: number;
}

export const ecommerceConnections = pgTable(
  'ecommerce_connections',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    platform: ecommercePlatformEnum('platform').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    status: ecommerceConnectionStatusEnum('status').notNull().default('pending'),
    /** Encrypted credentials — decrypt with ORG_SECRET before use */
    credentials: jsonb('credentials').$type<EcommerceCredentials>().notNull(),
    syncState: jsonb('sync_state').$type<EcommerceSyncState>().notNull().default({}),
    /** Whether to auto-sync new orders as they arrive via webhook */
    webhooksEnabled: boolean('webhooks_enabled').notNull().default(true),
    /** Shopify-specific: OAuth state token used during install flow */
    oauthState: varchar('oauth_state', { length: 256 }),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    lastErrorMessage: varchar('last_error_message', { length: 1024 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ecommerce_connections_org_idx').on(t.orgId),
    index('ecommerce_connections_platform_idx').on(t.platform),
    index('ecommerce_connections_status_idx').on(t.status),
  ],
);

// ─── Synced orders (platform-agnostic) ───────────────────────────────────────

export interface EcommerceOrderItem {
  sku?: string;
  name: string;
  qty: number;
  price: number;
  productId?: string;
}

export const ecommerceOrders = pgTable(
  'ecommerce_orders',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => ecommerceConnections.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Platform's native order ID */
    externalOrderId: varchar('external_order_id', { length: 128 }).notNull(),
    /** Matched MailForge contact (null if email not in system) */
    contactId: uuid('contact_id'),
    customerEmail: varchar('customer_email', { length: 255 }),
    status: varchar('status', { length: 64 }),
    totalAmount: varchar('total_amount', { length: 32 }),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    items: jsonb('items').$type<EcommerceOrderItem[]>().notNull().default([]),
    orderedAt: timestamp('ordered_at', { withTimezone: true }),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ecommerce_orders_external_uq').on(t.connectionId, t.externalOrderId),
    index('ecommerce_orders_org_idx').on(t.orgId),
    index('ecommerce_orders_contact_idx').on(t.contactId),
    index('ecommerce_orders_ordered_at_idx').on(t.orderedAt),
  ],
);

// ─── Webhook event log ────────────────────────────────────────────────────────

export const ecommerceWebhookEvents = pgTable(
  'ecommerce_webhook_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => ecommerceConnections.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id').notNull(),
    topic: varchar('topic', { length: 128 }).notNull(), // e.g. orders/create
    externalId: varchar('external_id', { length: 128 }),
    processed: boolean('processed').notNull().default(false),
    error: varchar('error', { length: 1024 }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ecommerce_webhook_events_conn_idx').on(t.connectionId),
    index('ecommerce_webhook_events_processed_idx').on(t.processed),
  ],
);

export type EcommerceConnection = typeof ecommerceConnections.$inferSelect;
export type NewEcommerceConnection = typeof ecommerceConnections.$inferInsert;
export type EcommerceOrder = typeof ecommerceOrders.$inferSelect;
export type EcommerceWebhookEvent = typeof ecommerceWebhookEvents.$inferSelect;
