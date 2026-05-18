import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const ispEnum = pgEnum('isp_provider', [
  'gmail',
  'microsoft',
  'yahoo',
  'aol',
  'comcast',
  'other',
]);

/**
 * Tracks which ISP Feedback Loop programs an org is registered to.
 * Purely informational — the actual complaint processing is handled
 * by the fbl-processor service via the webhook endpoints.
 */
export const ispFblRegistrations = pgTable(
  'isp_fbl_registrations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    isp: ispEnum('isp').notNull(),
    /** Mailbox address where ISP sends ARF complaints (if email-based FBL) */
    fblEmail: varchar('fbl_email', { length: 255 }),
    /** Webhook URL for HTTP-based FBL callbacks */
    webhookUrl: varchar('webhook_url', { length: 2048 }),
    notes: varchar('notes', { length: 1024 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('isp_fbl_org_idx').on(t.orgId),
    index('isp_fbl_isp_idx').on(t.isp),
  ],
);

export type IspFblRegistration = typeof ispFblRegistrations.$inferSelect;
export type NewIspFblRegistration = typeof ispFblRegistrations.$inferInsert;
