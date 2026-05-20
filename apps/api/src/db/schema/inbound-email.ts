import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

export const inboundEmails = pgTable(
  'inbound_emails',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    fromAddress: varchar('from_address', { length: 512 }).notNull(),
    toAddress: varchar('to_address', { length: 512 }).notNull(),
    subject: varchar('subject', { length: 1024 }),
    textBody: text('text_body'),
    htmlBody: text('html_body'),
    messageId: varchar('message_id', { length: 512 }),
    inReplyTo: varchar('in_reply_to', { length: 512 }),
    headers: jsonb('headers').$type<Record<string, string>>().notNull().default({}),
    attachments: jsonb('attachments')
      .$type<Array<{ filename: string; contentType: string; size: number; url?: string }>>()
      .notNull()
      .default([]),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processed: boolean('processed').notNull().default(false),
  },
  (t) => [
    index('inbound_emails_org_idx').on(t.orgId, t.receivedAt),
    index('inbound_emails_contact_idx').on(t.contactId),
    index('inbound_emails_msg_id_idx').on(t.messageId),
  ],
);

export type InboundEmail = typeof inboundEmails.$inferSelect;
export type NewInboundEmail = typeof inboundEmails.$inferInsert;
