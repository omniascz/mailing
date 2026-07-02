/**
 * Push notification schema: subscriptions, VAPID keys, send log (task 7.10).
 */

import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  varchar,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';

// ─── VAPID key pairs (org-level) ──────────────────────────────────────────────

export const vapidKeys = pgTable(
  'vapid_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    /** Base64url-encoded uncompressed P-256 public key */
    publicKey: text('public_key').notNull(),
    /** Base64url-encoded private key (store encrypted in prod) */
    privateKey: text('private_key').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: uniqueIndex('vapid_keys_org_idx').on(t.orgId),
  }),
);

// ─── Push subscriptions ───────────────────────────────────────────────────────

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    contactId: uuid('contact_id'),
    /** Web Push endpoint URL */
    endpoint: text('endpoint').notNull(),
    /** ECDH p256dh public key from subscription */
    p256dh: text('p256dh').notNull(),
    /** Auth secret from subscription */
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    /** FCM registration token (for Firebase-backed subscriptions) */
    fcmToken: text('fcm_token'),
    active: boolean('active').notNull().default(true),
    /** Set when push returns 410 Gone (browser unsubscribed) */
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('push_subscriptions_org_idx').on(t.orgId),
    contactIdx: index('push_subscriptions_contact_idx').on(t.contactId),
    endpointIdx: uniqueIndex('push_subscriptions_endpoint_idx').on(t.endpoint),
  }),
);

// ─── Native mobile devices (APNs / FCM) ───────────────────────────────────────
//
// Distinct from web push_subscriptions (browser VAPID). A native iOS/Android app
// registers its device token via the SDK; sends go through APNs (iOS) or FCM
// (Android) using the platform-specific payloads built in mobile-pure.ts.

export const mobileDevices = pgTable(
  'mobile_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    contactId: uuid('contact_id'),
    /** 'ios' → APNs device token; 'android' → FCM registration token. */
    platform: varchar('platform', { length: 16 }).notNull(),
    /** The APNs/FCM token string. */
    token: text('token').notNull(),
    /** App bundle id / package name (routing to the right APNs topic). */
    appId: varchar('app_id', { length: 255 }),
    deviceModel: varchar('device_model', { length: 128 }),
    osVersion: varchar('os_version', { length: 64 }),
    active: boolean('active').notNull().default(true),
    /** Set when APNs/FCM reports the token is invalid/unregistered. */
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('mobile_devices_org_idx').on(t.orgId),
    contactIdx: index('mobile_devices_contact_idx').on(t.contactId),
    tokenIdx: uniqueIndex('mobile_devices_org_token_idx').on(t.orgId, t.token),
  }),
);

// ─── Push send log ────────────────────────────────────────────────────────────

export const pushSendLog = pgTable(
  'push_send_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    subscriptionId: uuid('subscription_id'),
    contactId: uuid('contact_id'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    url: text('url'),
    status: text('status').notNull().default('queued'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    campaignId: uuid('campaign_id'),
    /** Rich media image shown below notification text */
    imageUrl: text('image_url'),
    /** Small icon URL override */
    iconUrl: text('icon_url'),
    /** iOS badge count */
    badge: text('badge'),
    /** Action buttons e.g. [{action:'confirm',title:'Yes'},{action:'dismiss',title:'No'}] */
    actionButtons: jsonb('action_buttons').$type<Array<{ action: string; title: string; icon?: string }>>(),
    /** Which action button was clicked */
    actionClicked: text('action_clicked'),
    clickedAt: timestamp('clicked_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('push_send_log_org_idx').on(t.orgId),
    contactIdx: index('push_send_log_contact_idx').on(t.contactId),
  }),
);

// ─── Type exports ─────────────────────────────────────────────────────────────

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
export type VapidKey = typeof vapidKeys.$inferSelect;
export type MobileDevice = typeof mobileDevices.$inferSelect;
export type NewMobileDevice = typeof mobileDevices.$inferInsert;
