/**
 * Universal Inbox — unified inbound message table.
 *
 * All inbound social messages (Instagram DM, Facebook Messenger, future channels)
 * land in this single table. The helpdesk routing engine then assigns them to
 * agents via the existing helpdesk_conversations/helpdesk_messages tables.
 *
 * Design intent:
 *  - One row per inbound message (not conversation)
 *  - conversation_id groups messages into threads
 *  - External IDs (sender_id, thread_id) are provider-specific
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

export const INBOX_CHANNELS = ['instagram', 'messenger', 'whatsapp', 'sms', 'email'] as const;
export type InboxChannel = (typeof INBOX_CHANNELS)[number];

export const inboxMessages = pgTable(
  'inbox_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Matched contact (may be null if we can't resolve the sender) */
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    /** Which social channel sent this */
    channel: varchar('channel', { length: 30 }).notNull(),
    /** Provider-level thread / conversation ID */
    threadId: varchar('thread_id', { length: 255 }).notNull(),
    /** Provider-level message ID (for dedup) */
    providerMessageId: varchar('provider_message_id', { length: 255 }).notNull(),
    /** Platform user ID of the sender (IGSID, PSID, phone, etc.) */
    senderId: varchar('sender_id', { length: 255 }).notNull(),
    /** Display name of sender (best-effort, may be empty) */
    senderName: varchar('sender_name', { length: 255 }),
    /** Plain-text content of the message */
    content: text('content').notNull().default(''),
    /** Attachment URLs, sticker IDs, etc. (provider-specific) */
    attachments: jsonb('attachments').$type<Record<string, unknown>[]>().default([]),
    /** Whether this is a message WE sent (outbound) vs received (inbound) */
    isOutbound: boolean('is_outbound').notNull().default(false),
    /** Whether the contact has been replied to */
    replied: boolean('replied').notNull().default(false),
    /** Agent who handled / is assigned to this message */
    assignedAgentId: uuid('assigned_agent_id'),
    /** ISO 8601 — when the message was sent by the contact */
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    /** When we received and stored it */
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    /** Full provider webhook payload for audit / reprocessing */
    rawPayload: jsonb('raw_payload'),
  },
  (t) => [
    index('inbox_messages_org_channel_idx').on(t.orgId, t.channel),
    index('inbox_messages_thread_idx').on(t.threadId),
    index('inbox_messages_provider_msg_idx').on(t.providerMessageId),
    index('inbox_messages_contact_idx').on(t.contactId),
    index('inbox_messages_org_received_idx').on(t.orgId, t.receivedAt),
  ],
);

export type InboxMessage = typeof inboxMessages.$inferSelect;
export type NewInboxMessage = typeof inboxMessages.$inferInsert;
