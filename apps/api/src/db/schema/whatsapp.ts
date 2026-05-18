/**
 * WhatsApp-specific schema: templates, consents, quality ratings (tasks 7.7–7.9).
 */

import {
  pgTable,
  pgEnum,
  text,
  boolean,
  integer,
  timestamp,
  uuid,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ─── WhatsApp template management (7.7) ──────────────────────────────────────

export const waTemplateCategoryEnum = pgEnum('wa_template_category', [
  'marketing',
  'utility',
  'authentication',
]);

export const waTemplateStatusEnum = pgEnum('wa_template_status', [
  'draft',
  'pending',
  'approved',
  'rejected',
  'paused',
  'disabled',
]);

export interface WaTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  buttons?: WaTemplateButton[];
  example?: { header_handle?: string[]; body_text?: string[][] };
}

export interface WaTemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phone_number?: string;
}

export const whatsappTemplates = pgTable(
  'whatsapp_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    /** Template name (snake_case, used for API calls) */
    name: text('name').notNull(),
    category: waTemplateCategoryEnum('category').notNull().default('utility'),
    language: text('language').notNull().default('en_US'),
    status: waTemplateStatusEnum('status').notNull().default('draft'),
    /** Template components: HEADER, BODY, FOOTER, BUTTONS */
    components: jsonb('components').notNull().default([]),
    /** Meta's template ID after submission */
    metaTemplateId: text('meta_template_id'),
    /** Rejection reason from Meta */
    rejectionReason: text('rejection_reason'),
    /** Number of times this template was used in sends */
    usageCount: integer('usage_count').notNull().default(0),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('wa_templates_org_idx').on(t.orgId),
    orgNameLangIdx: uniqueIndex('wa_templates_org_name_lang_idx').on(t.orgId, t.name, t.language),
    statusIdx: index('wa_templates_status_idx').on(t.status),
  }),
);

// ─── WhatsApp consents (7.9) ──────────────────────────────────────────────────

export const whatsappConsents = pgTable(
  'whatsapp_consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    /** Normalized E.164 phone number / WA ID */
    phone: text('phone').notNull(),
    contactId: uuid('contact_id'),
    /** How opt-in was obtained */
    consentSource: text('consent_source').notNull(),
    consentContext: text('consent_context'),
    consentedAt: timestamp('consented_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgPhoneIdx: uniqueIndex('wa_consents_org_phone_idx').on(t.orgId, t.phone),
  }),
);

// ─── WhatsApp quality + tier tracking (7.9) ───────────────────────────────────

export const waQualityRatingEnum = pgEnum('wa_quality_rating', ['GREEN', 'YELLOW', 'RED', 'UNKNOWN']);

export const whatsappPhoneNumbers = pgTable(
  'whatsapp_phone_numbers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    phoneNumberId: text('phone_number_id').notNull(),
    displayPhone: text('display_phone'),
    /** Quality rating from Meta: GREEN | YELLOW | RED */
    qualityRating: waQualityRatingEnum('quality_rating').notNull().default('GREEN'),
    /** Messaging limit tier: 1000 | 10000 | 100000 | UNLIMITED */
    messagingLimitTier: text('messaging_limit_tier').notNull().default('1000'),
    /** Total conversations in last 24h (rolling) */
    conversationsLast24h: integer('conversations_last_24h').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('wa_phone_numbers_org_idx').on(t.orgId),
    phoneIdIdx: uniqueIndex('wa_phone_numbers_id_idx').on(t.orgId, t.phoneNumberId),
  }),
);

// ─── WhatsApp conversation tracking (7.9) ────────────────────────────────────

export const waConversationCategoryEnum = pgEnum('wa_conversation_category', [
  'marketing',
  'utility',
  'authentication',
  'service',
]);

export const whatsappConversations = pgTable(
  'whatsapp_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    phoneNumberId: text('phone_number_id').notNull(),
    contactPhone: text('contact_phone').notNull(),
    contactId: uuid('contact_id'),
    category: waConversationCategoryEnum('category').notNull().default('utility'),
    /** Conversation window expires 24h after last inbound */
    windowExpiresAt: timestamp('window_expires_at', { withTimezone: true }),
    messageCount: integer('message_count').notNull().default(0),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('wa_conversations_org_idx').on(t.orgId),
    contactIdx: index('wa_conversations_contact_idx').on(t.orgId, t.contactPhone),
  }),
);

// ─── Type exports ─────────────────────────────────────────────────────────────

export type WaTemplate = typeof whatsappTemplates.$inferSelect;
export type NewWaTemplate = typeof whatsappTemplates.$inferInsert;
export type WaConsent = typeof whatsappConsents.$inferSelect;
export type WaPhoneNumber = typeof whatsappPhoneNumbers.$inferSelect;
export type WaConversation = typeof whatsappConversations.$inferSelect;
