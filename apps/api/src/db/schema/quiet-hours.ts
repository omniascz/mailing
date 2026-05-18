import { pgTable, uuid, varchar, integer, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const quietHours = pgTable(
  'quiet_hours',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 32 }).notNull().default('all'),
    startHour: integer('start_hour').notNull().default(21),
    endHour: integer('end_hour').notNull().default(8),
    timezone: varchar('timezone', { length: 100 }).notNull().default('UTC'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('quiet_hours_org_ch_uq').on(t.orgId, t.channel)],
);

export type QuietHours = typeof quietHours.$inferSelect;
