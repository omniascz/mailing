/**
 * Configuration sets — Amazon SES's core grouping abstraction. A named sending
 * profile that bundles: event destinations (which webhooks fire), an IP pool,
 * a TLS policy, open/click tracking, suppression behaviour, a reputation-
 * tracking flag, and a per-set sending on/off switch. A send references a set
 * by name and inherits its options.
 */
import {
  pgTable,
  uuid,
  varchar,
  boolean,
  jsonb,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

/** A single event destination bound to a configuration set. */
export interface EventDestination {
  name: string;
  /** Where matched events go. 'webhook' posts to a URL; others are stored intents. */
  type: 'webhook' | 'sns' | 'sqs' | 'eventbridge' | 'cloudwatch';
  enabled: boolean;
  /** Event types this destination receives. */
  matchingEventTypes: Array<
    | 'send'
    | 'delivery'
    | 'bounce'
    | 'complaint'
    | 'reject'
    | 'open'
    | 'click'
    | 'rendering_failure'
    | 'delivery_delay'
  >;
  /** For type='webhook': destination URL. */
  url?: string;
}

export interface ConfigurationSetOptions {
  /** Open + click tracking on/off. */
  trackingEnabled: boolean;
  /** 'optional' (opportunistic STARTTLS) or 'require' (fail if no TLS). */
  tlsPolicy: 'optional' | 'require';
  /** Apply the account suppression list before sending. */
  suppressionEnabled: boolean;
  /** Track reputation (bounce/complaint) metrics for this set. */
  reputationTracking: boolean;
  /** Dedicated IP pool id to send from (null = default/shared). */
  ipPoolId: string | null;
  /** Event destinations (webhooks etc.). */
  eventDestinations: EventDestination[];
}

export const configurationSets = pgTable(
  'configuration_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }).notNull(),
    /** Per-set sending switch (SES can pause sending for a config set). */
    sendingEnabled: boolean('sending_enabled').notNull().default(true),
    options: jsonb('options').$type<ConfigurationSetOptions>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('configuration_sets_org_idx').on(t.orgId),
    unique('configuration_sets_org_name_uq').on(t.orgId, t.name),
  ],
);

export type ConfigurationSet = typeof configurationSets.$inferSelect;

export const DEFAULT_CONFIG_SET_OPTIONS: ConfigurationSetOptions = {
  trackingEnabled: true,
  tlsPolicy: 'optional',
  suppressionEnabled: true,
  reputationTracking: true,
  ipPoolId: null,
  eventDestinations: [],
};
