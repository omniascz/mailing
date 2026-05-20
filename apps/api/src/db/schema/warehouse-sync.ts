import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const warehouseSyncs = pgTable(
  'warehouse_syncs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    destination: varchar('destination', { length: 64 }).notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    entities: jsonb('entities').$type<string[]>().notNull().default([]),
    frequency: varchar('frequency', { length: 16 }).notNull().default('daily'),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastStatus: varchar('last_status', { length: 32 }),
    lastError: text('last_error'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('warehouse_syncs_org_idx').on(t.orgId)],
);

export type WarehouseSync = typeof warehouseSyncs.$inferSelect;
