import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  userId: uuid('user_id'),
  action: text('action').notNull(),       // e.g. 'contact.created', 'user.login', 'campaign.deleted'
  resource: text('resource').notNull(),   // e.g. 'contact', 'campaign', 'user'
  resourceId: text('resource_id'),
  changes: jsonb('changes').$type<Record<string, unknown>>(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('audit_logs_org_idx').on(t.orgId),
  index('audit_logs_user_idx').on(t.userId),
  index('audit_logs_org_created_idx').on(t.orgId, t.createdAt),
  index('audit_logs_resource_idx').on(t.orgId, t.resource),
]);
