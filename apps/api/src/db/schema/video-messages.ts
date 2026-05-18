/**
 * 1:1 video messages (#325).
 *
 * Sales rep records a short video in-browser → uploaded to S3/MinIO → worker
 * transcodes to HLS → shareable link goes in an outgoing email.
 *
 * Play tracking logs every watch start / completion so the rep sees
 * whether the recipient actually engaged.
 */

import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, varchar, text, timestamp, integer, jsonb, index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { users } from './users.js';
import { contacts } from './contacts.js';

// ─── Video messages ───────────────────────────────────────────────────────────

export const videoMessages = pgTable(
  'video_messages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),

    title: varchar('title', { length: 255 }),
    /** Public share token used in email links */
    shareToken: varchar('share_token', { length: 64 }).notNull().unique(),

    /** Storage paths */
    originalObjectKey: text('original_object_key').notNull(), // MinIO/S3 key for uploaded mp4/webm
    hlsManifestKey: text('hls_manifest_key'),                 // master.m3u8 once transcode finishes
    thumbnailKey: text('thumbnail_key'),                      // jpg preview frame

    /** Video metadata */
    durationSeconds: integer('duration_seconds'),
    sizeBytes: integer('size_bytes'),
    mimeType: varchar('mime_type', { length: 64 }),

    /** pending_upload | uploaded | transcoding | ready | failed */
    status: varchar('status', { length: 32 }).notNull().default('pending_upload'),
    transcodeError: text('transcode_error'),

    /** Denormalised play metrics */
    playCount: integer('play_count').notNull().default(0),
    completionCount: integer('completion_count').notNull().default(0),
    lastPlayedAt: timestamp('last_played_at', { withTimezone: true }),

    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('video_messages_org_idx').on(t.orgId),
    index('video_messages_user_idx').on(t.userId),
    index('video_messages_contact_idx').on(t.contactId),
    index('video_messages_token_idx').on(t.shareToken),
    index('video_messages_status_idx').on(t.status),
  ],
);

// ─── Play events (one row per viewer session) ─────────────────────────────────

export const videoPlayEvents = pgTable(
  'video_play_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    videoId: uuid('video_id')
      .notNull()
      .references(() => videoMessages.id, { onDelete: 'cascade' }),

    /** 'play' | 'pause' | 'progress' | 'completed' */
    eventType: varchar('event_type', { length: 16 }).notNull(),
    positionSeconds: integer('position_seconds').notNull().default(0),

    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    referer: text('referer'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('video_play_events_video_idx').on(t.videoId),
    index('video_play_events_org_idx').on(t.orgId),
    index('video_play_events_created_idx').on(t.createdAt),
  ],
);

export type VideoMessage = typeof videoMessages.$inferSelect;
export type NewVideoMessage = typeof videoMessages.$inferInsert;
export type VideoPlayEvent = typeof videoPlayEvents.$inferSelect;
export type NewVideoPlayEvent = typeof videoPlayEvents.$inferInsert;
