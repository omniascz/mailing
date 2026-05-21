import { pgEnum } from 'drizzle-orm/pg-core';

export const planEnum = pgEnum('plan', ['free', 'starter', 'pro', 'business', 'enterprise']);

export const userRoleEnum = pgEnum('user_role', [
  'owner',
  'admin',
  'editor',
  'viewer',
  // Platform-level role. NOT scoped to a specific org — system_admin sees
  // and acts across all tenants via /superadmin/* routes. Set only by
  // direct DB intervention (psql or seed); never via UI promotion.
  'system_admin',
]);

export const authProviderEnum = pgEnum('auth_provider', ['email', 'google', 'sso']);

export const contactStatusEnum = pgEnum('contact_status', [
  'active',
  'unsubscribed',
  'bounced',
  'complained',
  'pending',
]);

/** HubSpot-style lifecycle stages (#317/#394). Customisable later via per-org override. */
export const lifecycleStageEnum = pgEnum('lifecycle_stage', [
  'subscriber',
  'lead',
  'marketing_qualified_lead',
  'sales_qualified_lead',
  'opportunity',
  'customer',
  'evangelist',
  'other',
]);

export const phoneTypeEnum = pgEnum('phone_type', ['mobile', 'landline', 'voip', 'unknown']);

export const phoneStatusEnum = pgEnum('phone_status', ['active', 'inactive', 'unknown', 'invalid']);

export const campaignTypeEnum = pgEnum('campaign_type', [
  'email',
  'sms',
  'whatsapp',
  'push',
  'voice',
  'viber',
]);

export const dataRegionEnum = pgEnum('data_region', ['us', 'eu', 'ap']);

export const campaignStatusEnum = pgEnum('campaign_status', [
  'draft',
  'scheduled',
  'sending',
  'sent',
  'paused',
  'cancelled',
]);

export const templateCategoryEnum = pgEnum('template_category', [
  'newsletter',
  'promo',
  'transactional',
  'event',
  'onboarding',
  'seasonal',
  'ecommerce',
  'custom',
]);

export const emailEventTypeEnum = pgEnum('email_event_type', [
  'send',
  'deliver',
  'open',
  'click',
  'bounce',
  'unsubscribe',
  'complaint',
]);

export const bounceTypeEnum = pgEnum('bounce_type', ['none', 'hard', 'soft', 'block']);

export const suppressionReasonEnum = pgEnum('suppression_reason', [
  'hard_bounce',
  'complaint',
  'manual',
  'unsubscribe',
]);

export const customFieldTypeEnum = pgEnum('custom_field_type', [
  'text',
  'number',
  'date',
  'select',
  'boolean',
]);

export const callStatusEnum = pgEnum('call_status', [
  'initiated',
  'ringing',
  'in_progress',
  'completed',
  'no_answer',
  'busy',
  'voicemail',
  'failed',
]);

export const messageStreamEnum = pgEnum('message_stream', [
  'broadcast',
  'transactional',
  'triggered',
]);

/** Billing model for a plan: contact-based (default) or per-send-volume (#281) */
export const billingTypeEnum = pgEnum('billing_type', [
  'contact_based',
  'send_based',
  'payg', // Pay-As-You-Go credits (#282)
]);
