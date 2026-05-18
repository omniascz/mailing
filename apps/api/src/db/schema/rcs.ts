import { pgTable, uuid, varchar, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

export interface RcsCarouselCard {
  title: string;
  description?: string;
  imageUrl?: string;
  buttons?: Array<{ label: string; url?: string; postback?: string }>;
}

export interface RcsPayload {
  text?: string;
  carousel?: RcsCarouselCard[];
  suggestedReplies?: string[];
  mediaUrl?: string;
}

export const rcsMessages = pgTable(
  'rcs_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    phone: varchar('phone', { length: 32 }).notNull(),
    messageType: varchar('message_type', { length: 32 }).notNull().default('text'),
    payload: jsonb('payload').$type<RcsPayload>().notNull().default({}),
    status: varchar('status', { length: 32 }).notNull().default('queued'),
    provider: varchar('provider', { length: 32 }),
    providerId: varchar('provider_id', { length: 128 }),
    error: text('error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('rcs_messages_org_idx').on(t.orgId, t.createdAt)],
);

export type RcsMessage = typeof rcsMessages.$inferSelect;
