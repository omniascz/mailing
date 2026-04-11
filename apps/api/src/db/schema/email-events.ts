import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { campaigns } from './campaigns.js';
import { contacts } from './contacts.js';
import { emailEventTypeEnum, bounceTypeEnum } from './enums.js';

/**
 * Email events — stored in PostgreSQL for the small/recent slice and replicated to
 * ClickHouse via Kafka for analytics. The PG copy backs near-real-time campaign UI;
 * ClickHouse handles aggregation queries.
 */
export const emailEvents = pgTable(
  'email_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),

    eventType: emailEventTypeEnum('event_type').notNull(),
    bounceType: bounceTypeEnum('bounce_type'),

    messageId: varchar('message_id', { length: 255 }),
    linkUrl: varchar('link_url', { length: 2048 }),
    userAgent: varchar('user_agent', { length: 1024 }),
    ipAddress: varchar('ip_address', { length: 45 }),
    deviceType: varchar('device_type', { length: 50 }),
    emailClient: varchar('email_client', { length: 100 }),

    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('email_events_org_id_idx').on(t.orgId),
    index('email_events_campaign_id_idx').on(t.campaignId),
    index('email_events_contact_id_idx').on(t.contactId),
    index('email_events_type_idx').on(t.eventType),
    index('email_events_created_at_idx').on(t.createdAt),
  ],
);

export type EmailEvent = typeof emailEvents.$inferSelect;
export type NewEmailEvent = typeof emailEvents.$inferInsert;
