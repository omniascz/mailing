import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

/**
 * Custom channels (#347) — user-defined messaging channels registered via the
 * Channel SDK. Each row describes a remote endpoint the dispatcher can POST
 * to. Messages the org sends on this channel are signed with a shared HMAC
 * secret, and the remote implementation is responsible for the actual
 * delivery (Telegram, Signal, Discord, a proprietary in-house system, ...).
 *
 * Two surfaces:
 *   - Outbound: dispatcher fetches the row, signs the payload, POSTs it to
 *     `outbound_url`.
 *   - Inbound: the remote calls our public webhook `/api/v1/channels/custom/:slug/inbound`
 *     which verifies the HMAC and fans the payload into the standard inbound
 *     message pipeline.
 */
export const customChannels = pgTable(
  'custom_channels',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 64 }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    description: text('description'),
    /** Remote HTTPS endpoint receiving signed POSTs for outbound sends. */
    outboundUrl: varchar('outbound_url', { length: 1024 }).notNull(),
    /** HMAC secret used for both outbound signatures and inbound verification. */
    sharedSecret: varchar('shared_secret', { length: 128 }).notNull(),
    /** Optional schema describing the message body the remote expects. */
    messageSchema: jsonb('message_schema').$type<Record<string, unknown>>().notNull().default({}),
    /** Rate limits (requests/sec, max payload bytes) enforced by the dispatcher. */
    rateLimits: jsonb('rate_limits')
      .$type<{ rps?: number; maxPayloadBytes?: number }>()
      .notNull()
      .default({}),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('custom_channels_org_slug_uq').on(t.orgId, t.slug),
    index('custom_channels_org_idx').on(t.orgId),
  ],
);

export type CustomChannel = typeof customChannels.$inferSelect;
export type NewCustomChannel = typeof customChannels.$inferInsert;
