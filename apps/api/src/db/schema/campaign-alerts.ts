import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  boolean,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { campaigns } from './campaigns.js';

export const alertSeverityEnum = pgEnum('alert_severity', ['info', 'warning', 'critical']);

export const alertTypeEnum = pgEnum('alert_type', [
  'bounce_rate_spike',
  'complaint_rate_spike',
  'open_rate_drop',
  'unsub_spike',
]);

export const campaignAlerts = pgTable(
  'campaign_alerts',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),

    alertType: alertTypeEnum('alert_type').notNull(),
    severity: alertSeverityEnum('severity').notNull().default('warning'),

    /** Human-readable message */
    message: varchar('message', { length: 1024 }).notNull(),
    /** Structured data: current value, threshold, baseline */
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),

    /** Whether the org admin has acknowledged this alert */
    acknowledged: boolean('acknowledged').notNull().default(false),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('campaign_alerts_org_id_idx').on(t.orgId),
    index('campaign_alerts_campaign_id_idx').on(t.campaignId),
    index('campaign_alerts_created_at_idx').on(t.createdAt),
    index('campaign_alerts_acknowledged_idx').on(t.acknowledged),
  ],
);

export type CampaignAlert = typeof campaignAlerts.$inferSelect;
export type NewCampaignAlert = typeof campaignAlerts.$inferInsert;
