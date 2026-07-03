/**
 * Subscription topics (SES v2 Contact List Topics). Named subscription
 * categories a contact can opt in/out of independently (e.g. "Product updates",
 * "Promotions"). Each topic has a default subscription status; per-contact
 * overrides live in contact_topic_subscriptions.
 */
import { pgTable, uuid, varchar, boolean, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

export const subscriptionTopics = pgTable(
  'subscription_topics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }).notNull(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    description: varchar('description', { length: 500 }),
    /** 'opt_in' → subscribed unless the contact opts out; 'opt_out' → the reverse. */
    defaultStatus: varchar('default_status', { length: 16 }).notNull().default('opt_in'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('subscription_topics_org_idx').on(t.orgId),
    unique('subscription_topics_org_name_uq').on(t.orgId, t.name),
  ],
);

export const contactTopicSubscriptions = pgTable(
  'contact_topic_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => subscriptionTopics.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 16 }).notNull(), // subscribed | unsubscribed
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('contact_topic_subs_contact_idx').on(t.contactId),
    unique('contact_topic_subs_uq').on(t.contactId, t.topicId),
  ],
);

export type SubscriptionTopic = typeof subscriptionTopics.$inferSelect;
export type ContactTopicSubscription = typeof contactTopicSubscriptions.$inferSelect;
