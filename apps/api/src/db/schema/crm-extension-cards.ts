import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { appStudioApps } from './app-studio.js';

/**
 * CRM Extension Cards SDK (#348).
 *
 * An app installed via App Studio can register "extension cards" — panels that
 * appear on CRM record pages (contacts, deals, accounts). Each card has an
 * iframe URL that receives the entity context and can render arbitrary data
 * from the third-party app (e.g. Stripe MRR on a contact, GitHub PRs on a
 * deal, Jira tickets linked to an account).
 *
 * The platform calls the card's `dataUrl` at page load time to fetch a JSON
 * payload that the card renderer displays. Cards can optionally expose
 * "actions" (buttons) that POST to `actionUrl` on click.
 */
export const crmExtensionCards = pgTable(
  'crm_extension_cards',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    appId: uuid('app_id')
      .notNull()
      .references(() => appStudioApps.id, { onDelete: 'cascade' }),
    /** Stable key within the app, e.g. "stripe-mrr" */
    key: varchar('key', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    iconUrl: varchar('icon_url', { length: 2048 }),
    /** Which CRM entity pages this card appears on */
    entityTypes: jsonb('entity_types')
      .$type<Array<'contact' | 'deal' | 'account' | 'ticket'>>()
      .notNull()
      .default(['contact']),
    /** Where on the page the card appears */
    position: varchar('position', { length: 32 }).notNull().default('sidebar'),
    /**
     * GET endpoint the platform calls to fetch card data.
     * Receives: entity_type, entity_id, org_id as query params.
     * Must return: { title, items: [{label, value, type?}], actions?: [{label, actionKey}] }
     */
    dataUrl: varchar('data_url', { length: 2048 }).notNull(),
    /**
     * Optional POST endpoint for card button actions.
     * Receives: { action_key, entity_type, entity_id, org_id }
     */
    actionUrl: varchar('action_url', { length: 2048 }),
    /** Whether the card iframe is sandboxed */
    iframeSandbox: boolean('iframe_sandbox').notNull().default(true),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('crm_ext_cards_app_key_uq').on(t.appId, t.key),
    index('crm_ext_cards_org_idx').on(t.orgId),
    index('crm_ext_cards_app_idx').on(t.appId),
  ],
);

export type CrmExtensionCard = typeof crmExtensionCards.$inferSelect;
export type NewCrmExtensionCard = typeof crmExtensionCards.$inferInsert;
