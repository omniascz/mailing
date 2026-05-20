/**
 * Viber Business Messages template schema.
 *
 * Templates must be pre-approved by the Viber provider before use
 * in business-initiated messages.
 */

import { pgTable, uuid, varchar, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const viberTemplates = pgTable(
  'viber_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Template name registered with the provider */
    name: varchar('name', { length: 100 }).notNull(),
    /** Viber message type */
    type: varchar('type', { length: 20 }).notNull().default('text'),
    body: text('body').notNull(),
    mediaUrl: varchar('media_url', { length: 2048 }),
    actionUrl: varchar('action_url', { length: 2048 }),
    actionText: varchar('action_text', { length: 255 }),
    /** Template approval status */
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    /** Provider this template is registered with */
    provider: varchar('provider', { length: 20 }),
    /** Provider's own template identifier */
    providerTemplateId: varchar('provider_template_id', { length: 255 }),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('viber_templates_org_name_idx').on(t.orgId, t.name),
    index('viber_templates_org_status_idx').on(t.orgId, t.status),
  ],
);

export type ViberTemplate = typeof viberTemplates.$inferSelect;
export type NewViberTemplate = typeof viberTemplates.$inferInsert;
