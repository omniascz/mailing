import { pgTable, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

export const channelFallbackRules = pgTable('channel_fallback_rules', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),
  primaryChannel: text('primary_channel').notNull().default('email'),
  trigger: text('trigger').notNull(), // hard_bounce | soft_bounce | no_open_days | undelivered
  triggerParam: integer('trigger_param'), // e.g. 7 days for no_open_days
  fallbackChannel: text('fallback_channel').notNull(), // sms | whatsapp | push
  fallbackTemplateId: text('fallback_template_id'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const channelFallbackLog = pgTable('channel_fallback_log', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text('org_id').notNull(),
  ruleId: text('rule_id').notNull(),
  contactId: text('contact_id').notNull(),
  primaryChannel: text('primary_channel').notNull(),
  fallbackChannel: text('fallback_channel').notNull(),
  triggerReason: text('trigger_reason').notNull(),
  status: text('status').notNull().default('queued'), // queued | sent | failed
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ChannelFallbackRule = typeof channelFallbackRules.$inferSelect;
