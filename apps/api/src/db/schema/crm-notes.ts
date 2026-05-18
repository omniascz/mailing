import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';

export const crmNotes = pgTable('crm_notes', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),

  // Note body (plaintext / markdown)
  body: text('body').notNull(),

  // Optional entity associations
  contactId: uuid('contact_id'),
  dealId: uuid('deal_id'),
  accountId: uuid('account_id'),

  // Author
  authorUserId: uuid('author_user_id'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('crm_notes_org_idx').on(t.orgId),
  index('crm_notes_contact_idx').on(t.contactId),
  index('crm_notes_deal_idx').on(t.dealId),
  index('crm_notes_account_idx').on(t.accountId),
]);

export type CrmNote = typeof crmNotes.$inferSelect;
export type NewCrmNote = typeof crmNotes.$inferInsert;
