import {
  pgTable,
  uuid,
  varchar,
  boolean,
  text,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const calendlyConnections = pgTable(
  'calendly_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userUri: varchar('user_uri', { length: 512 }),
    organizationUri: varchar('organization_uri', { length: 512 }),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    webhookSigningKey: text('webhook_signing_key'),
    createDeal: boolean('create_deal').notNull().default(false),
    workflowTrigger: varchar('workflow_trigger', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('calendly_connections_org_uq').on(t.orgId),
    index('calendly_connections_org_id_idx').on(t.orgId),
  ],
);

export type CalendlyConnection = typeof calendlyConnections.$inferSelect;
