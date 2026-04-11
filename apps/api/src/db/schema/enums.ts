import { pgEnum } from 'drizzle-orm/pg-core';

export const planEnum = pgEnum('plan', ['free', 'starter', 'pro', 'business', 'enterprise']);

export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'editor', 'viewer']);

export const authProviderEnum = pgEnum('auth_provider', ['email', 'google']);

export const contactStatusEnum = pgEnum('contact_status', [
  'active',
  'unsubscribed',
  'bounced',
  'complained',
  'pending',
]);

export const phoneTypeEnum = pgEnum('phone_type', ['mobile', 'landline', 'voip', 'unknown']);

export const phoneStatusEnum = pgEnum('phone_status', ['active', 'inactive', 'unknown', 'invalid']);

export const campaignTypeEnum = pgEnum('campaign_type', [
  'email',
  'sms',
  'whatsapp',
  'push',
  'voice',
]);

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
