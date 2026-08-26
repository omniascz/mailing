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
  // Has an address but no marketing opt-in — may still receive transactional
  // mail / ads, excluded from marketing broadcasts (Mailchimp "non-subscribed").
  'non_subscribed',
  // Removed from marketing + not billed, data retained, reversible
  // (Mailchimp "archived"). Distinct from soft-delete (`deleted_at`).
  'archived',
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

/**
 * `sending` used to mean two different things, and the shorter one was
 * drowning out the longer: the splitter marked a campaign `sent` the moment
 * the last batch reached the queue, so `sending` lasted for the splitter's run
 * and `sent` covered the hours of actual delivery. Anything watching a send in
 * progress — the anomaly detector, an operator, the Pause button — was looking
 * at a window that had already closed.
 *
 * So the two are separated. `queueing` is the splitter's run; `sending` is mail
 * actually going out; `sent` is every batch finished. `failed` is the same
 * finish line with nothing delivered.
 *
 * Order matters for `enumsortorder` but nothing sorts on it, and new values
 * must be appended in the migration regardless — Postgres will not let a value
 * be added and used inside the same transaction.
 */
export const campaignStatusEnum = pgEnum('campaign_status', [
  'draft',
  'scheduled',
  'sending',
  'sent',
  'paused',
  'cancelled',
  /** The splitter is turning the audience into batches. Short, minutes at most. */
  'queueing',
  /** Every batch finished and not one of them sent anything. Terminal. */
  'failed',
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

/** What a folder organises. One flat namespace per kind, per organisation. */
export const folderKindEnum = pgEnum('folder_kind', ['campaign', 'template']);

export const emailEventTypeEnum = pgEnum('email_event_type', [
  'send',
  'deliver',
  'open',
  'click',
  'bounce',
  'unsubscribe',
  'complaint',
  /**
   * An attempt failed and another one is coming. Written once per non-final
   * attempt, for a 4xx and for a transport error alike.
   *
   * Deliberately not `bounce`. Every consumer that measures deliverability
   * counts `event_type = 'bounce'`, so recording a retry there made a message
   * that was merely greylisted look like six rejections — and, through
   * onBounceComplaintSignal, fed the auto-pause evaluator six times.
   */
  'deferred',
  /**
   * The message was never delivered and the recipient never rejected it:
   * retries ran out against a timeout, a DNS failure, an unreachable host.
   *
   * Also not `bounce`. A bounce is something the far side said; this is the
   * absence of anything being said. It used to be recorded as a soft bounce
   * ("so it is not lost") which put transport faults into the customer's
   * bounce rate, or — in the MTA-error branch — recorded nothing at all.
   */
  'failed',
]);

export const bounceTypeEnum = pgEnum('bounce_type', ['none', 'hard', 'soft', 'block']);

export const suppressionReasonEnum = pgEnum('suppression_reason', [
  'hard_bounce',
  'complaint',
  'manual',
  'unsubscribe',
  // SendGrid-parity suppression lists: policy/RBL rejections and
  // nonexistent-address bounces get their own buckets.
  'block',
  'invalid_email',
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
