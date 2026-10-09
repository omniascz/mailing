import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { suppressionReasonEnum } from './enums.js';

export const suppressions = pgTable(
  'suppressions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 32 }),
    reason: suppressionReasonEnum('reason').notNull(),
    notes: varchar('notes', { length: 1000 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('suppressions_org_id_idx').on(t.orgId),
    // One row per reason, not per address: an address can be unsubscribed AND
    // hard-bounced at once, and each consumer reads the reason it cares about
    // (the #225 gate lets 'unsubscribe' through for transactional mail;
    // resubscribeContact lifts only that one). (org, email) used to be unique,
    // so a later reason could not be written next to an earlier one.
    uniqueIndex('suppressions_org_email_reason_idx').on(t.orgId, t.email, t.reason),
    uniqueIndex('suppressions_org_phone_idx').on(t.orgId, t.phone),
    index('suppressions_email_idx').on(t.email),
  ],
);

export type Suppression = typeof suppressions.$inferSelect;
export type NewSuppression = typeof suppressions.$inferInsert;
