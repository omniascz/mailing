import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, varchar, text, jsonb, timestamp, boolean, integer, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

/**
 * App Studio — low-code integration builder.
 *
 * An "app" is a third-party integration that the org has installed (or built
 * themselves). It can:
 *   - subscribe to platform events (webhook subscribers — like our existing
 *     `webhooks` table, but scoped to an installed app rather than a freeform URL)
 *   - declare custom *actions* that workflows can call (HTTP request templates
 *     parameterised with merge tags + JSONata response shaping)
 *   - declare custom *triggers* — outbound webhooks the app posts to that
 *     start a workflow run.
 *
 * Compared to `oauth_apps`, this is the *consumer* side: an app installed by
 * an org, with an access token issued by the platform that lets the app call
 * back into the API on behalf of that org.
 */

export const appStudioApps = pgTable(
  'app_studio_apps',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    /** snake_case slug, unique per org, e.g. "stripe-checkout" */
    slug: varchar('slug', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    iconUrl: varchar('icon_url', { length: 1024 }),
    /** JSON schema describing user-configurable settings (API keys, base URLs…). */
    settingsSchema: jsonb('settings_schema').$type<Record<string, unknown>>(),
    /** Filled-in values for the schema above. */
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    /** Hash of the access token issued to this app installation. */
    accessTokenHash: varchar('access_token_hash', { length: 128 }),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('app_studio_apps_org_slug_idx').on(t.orgId, t.slug)],
);

/** Outbound: events platform fires that this app receives. */
export const appStudioWebhookSubscribers = pgTable(
  'app_studio_webhook_subscribers',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull(),
    appId: uuid('app_id').notNull().references(() => appStudioApps.id, { onDelete: 'cascade' }),
    /** Event name, e.g. "contact.created" */
    event: varchar('event', { length: 100 }).notNull(),
    /** Where to deliver — usually an HTTPS URL hosted by the app. */
    targetUrl: varchar('target_url', { length: 2048 }).notNull(),
    /** Per-subscriber HMAC secret. Distinct from the app's access token. */
    secret: varchar('secret', { length: 128 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    deliveryCount: integer('delivery_count').notNull().default(0),
    failureCount: integer('failure_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('app_studio_subs_app_idx').on(t.appId),
    index('app_studio_subs_event_idx').on(t.orgId, t.event),
  ],
);

/**
 * Inbound: re-usable HTTP "actions" the app exposes for use in workflows.
 *
 * Each action describes how to call out (URL template, headers, body), how
 * to interpret the response (JSONata expression for unwrapping), and what
 * inputs the workflow editor should expose (paramSchema).
 */
export const appStudioActions = pgTable(
  'app_studio_actions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull(),
    appId: uuid('app_id').notNull().references(() => appStudioApps.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    method: varchar('method', { length: 8 }).notNull().default('POST'),
    /** URL template, supports {{contact.email}}, {{params.foo}} etc. */
    urlTemplate: varchar('url_template', { length: 2048 }).notNull(),
    /** Header templates. Values support merge tags. */
    headers: jsonb('headers').$type<Record<string, string>>().notNull().default({}),
    /** JSON body template (string after merge-tag substitution). */
    bodyTemplate: text('body_template'),
    /** Zod-like JSON schema for workflow editor to render an input form. */
    paramSchema: jsonb('param_schema').$type<Record<string, unknown>>(),
    /** Optional JSONata for unwrapping the response (e.g. "data.id"). */
    responsePath: varchar('response_path', { length: 255 }),
    /** When the action is allowed to be called via the public API. */
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('app_studio_actions_app_key_idx').on(t.appId, t.key)],
);

/**
 * App-defined triggers — inbound URLs the app POSTs to in order to fire a
 * workflow. The platform validates the bearer token against
 * `appStudioApps.accessTokenHash`.
 */
export const appStudioTriggers = pgTable(
  'app_studio_triggers',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull(),
    appId: uuid('app_id').notNull().references(() => appStudioApps.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    /** Workflow event name fired when this trigger receives a payload. */
    eventName: varchar('event_name', { length: 100 }).notNull(),
    /** Optional Zod-like schema documenting the payload shape. */
    payloadSchema: jsonb('payload_schema').$type<Record<string, unknown>>(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('app_studio_triggers_app_key_idx').on(t.appId, t.key)],
);

export type AppStudioApp = typeof appStudioApps.$inferSelect;
export type AppStudioWebhookSubscriber = typeof appStudioWebhookSubscribers.$inferSelect;
export type AppStudioAction = typeof appStudioActions.$inferSelect;
export type AppStudioTrigger = typeof appStudioTriggers.$inferSelect;
