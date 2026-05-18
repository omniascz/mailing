import { pgTable, uuid, varchar, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations.js';

export const ipRestrictions = pgTable('ip_restrictions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  cidr: varchar('cidr', { length: 50 }).notNull(), // e.g. "192.168.1.0/24" or "10.0.0.1/32"
  label: varchar('label', { length: 100 }),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
},
(t) => [
  index('ip_restrictions_org_idx').on(t.orgId),
  index('ip_restrictions_org_enabled_idx').on(t.orgId, t.enabled),
]);

export type IpRestriction = typeof ipRestrictions.$inferSelect;
export type NewIpRestriction = typeof ipRestrictions.$inferInsert;
