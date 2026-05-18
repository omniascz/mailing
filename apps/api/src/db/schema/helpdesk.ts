import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';
import { users } from './users.js';

export const helpdeskTickets = pgTable(
  'helpdesk_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    subject: varchar('subject', { length: 512 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('open'),
    priority: varchar('priority', { length: 16 }).notNull().default('normal'),
    channel: varchar('channel', { length: 32 }).notNull().default('email'),
    // External thread identifier from the source channel (Gmail threadId, WhatsApp
    // conversation id, Twitter DM id, Messenger thread_id, SMS short-code bucket, etc.)
    externalThreadId: varchar('external_thread_id', { length: 255 }),
    // The handle the customer reached us through (email, E.164 phone, @handle, social_id)
    externalIdentity: varchar('external_identity', { length: 255 }),
    // Per-channel opaque metadata (e.g., WhatsApp wa_id, Twilio conversation SID)
    channelMetadata: jsonb('channel_metadata').$type<Record<string, unknown>>().notNull().default({}),
    assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    teamId: uuid('team_id'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('helpdesk_tickets_org_status_idx').on(t.orgId, t.status),
    index('helpdesk_tickets_contact_idx').on(t.contactId),
    // Fast lookup of an existing thread when an inbound message arrives
    uniqueIndex('helpdesk_tickets_org_channel_thread_uq')
      .on(t.orgId, t.channel, t.externalThreadId)
      .where(sql`external_thread_id IS NOT NULL`),
    index('helpdesk_tickets_org_channel_identity_idx').on(t.orgId, t.channel, t.externalIdentity),
  ],
);

export const ticketMessages = pgTable(
  'ticket_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id').notNull().references(() => helpdeskTickets.id, { onDelete: 'cascade' }),
    sender: varchar('sender', { length: 32 }).notNull(),
    // Message direction: inbound | outbound | internal (private agent note)
    direction: varchar('direction', { length: 16 }).notNull().default('inbound'),
    // External message id from the source channel (idempotency key for webhooks)
    externalMessageId: varchar('external_message_id', { length: 255 }),
    body: text('body').notNull(),
    attachments: jsonb('attachments').$type<Array<{ url: string; name: string }>>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ticket_messages_ticket_idx').on(t.ticketId),
    uniqueIndex('ticket_messages_ext_uq')
      .on(t.ticketId, t.externalMessageId)
      .where(sql`external_message_id IS NOT NULL`),
  ],
);

export type HelpdeskTicket = typeof helpdeskTickets.$inferSelect;
export type TicketMessage = typeof ticketMessages.$inferSelect;
