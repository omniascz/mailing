import type { WebhookEvent } from '../../db/schema/webhooks.js';

/**
 * The payload contract for outgoing webhooks.
 *
 * There was none. `dispatchEvent(orgId, event, payload)` took
 * `Record<string, unknown>`, so what a customer received depended entirely on
 * what the emitter happened to pass — and the emitters disagreed. The signup
 * form sends `{ contactId, formId, email }` for contact.created; the Zapier
 * trigger's published sample promises `{ id, email, firstName, lastName }`.
 * Nothing could have caught that, because there was nothing to check against.
 *
 * This file is that something. Each event maps to the exact shape it carries,
 * and dispatchEvent is generic over the event name, so passing the wrong shape
 * is a compile error at the emitter rather than a surprise in someone's Zap.
 *
 * ─── Why a map type and not one interface per event ─────────────────────────
 *
 * The alternative shapes were a discriminated union (`{ event: 'x', data: … }`)
 * or a base interface every payload extends. A map keyed by the event name is
 * better here for one reason: it makes the RELATIONSHIP checkable. A union
 * lets an emitter construct a valid member of the wrong variant; a base
 * interface checks the common fields and nothing else. With
 * `WebhookEventPayloads[E]` the compiler ties the name and the shape together,
 * which is precisely the mistake that shipped.
 *
 * ─── Conventions the shapes follow ──────────────────────────────────────────
 *
 * - Identifiers are `<thing>Id`, matching the existing email.* emitters.
 * - Nullable rather than optional where the column is nullable: a contact can
 *   genuinely have no email, and `email: null` says that, while a missing key
 *   is indistinguishable from an emitter that forgot.
 * - No timestamps inside the payload. dispatchEvent already wraps every
 *   payload in `{ event, orgId, timestamp, data }`, so a second one would only
 *   ever be a source of disagreement.
 */

/**
 * The identifying fields of a contact, as a receiver would want them.
 *
 * `id` rather than `contactId` at the top level of this one: it is the subject
 * of the event, and Zapier de-duplicates records on `id`. The existing
 * email.* payloads use `contactId` because there the contact is a participant,
 * not the subject.
 */
export interface ContactSummary {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  status: string;
  /** ISO-8601. The contact's own creation time, not the event time. */
  createdAt: string;
}

/** Fields shared by every email lifecycle event. */
export interface EmailEventFields {
  messageId?: string | null;
  contactId?: string | null;
  campaignId?: string | null;
  email?: string | null;
  /** Providers attach their own extras (bounce type, feedback id, url, …). */
  [key: string]: unknown;
}

export interface WebhookEventPayloads {
  // ─── Contacts ─────────────────────────────────────────────────────────────
  /**
   * A contact was created. Emitted per contact from the paths that create one
   * at a time; bulk paths (CSV import, provider migrations, e-shop sync) do
   * NOT emit it — see docs/WEBHOOK-EVENTS.md for the list and the reasoning.
   *
   * `source` says which path created it, because "a contact appeared" is much
   * less useful than "a contact appeared from your signup form".
   */
  'contact.created': ContactSummary & { source: ContactSource };
  /** A contact's fields changed. `changed` lists the field names that moved. */
  'contact.updated': ContactSummary & { changed: string[] };
  /**
   * A contact was deleted. Soft delete — the row is retained with deletedAt
   * set — so only the identifiers are carried; the rest is no longer current.
   */
  'contact.deleted': { id: string; email: string | null };

  // ─── Campaigns ────────────────────────────────────────────────────────────
  /**
   * A campaign finished sending: emitted when the campaign is marked `sent`,
   * which the splitter does after the last batch completes.
   */
  'campaign.sent': {
    campaignId: string;
    name: string | null;
    subject: string | null;
    type: string | null;
    recipientCount: number | null;
    /** ISO-8601, from campaigns.sent_at. */
    sentAt: string | null;
  };

  // ─── Email lifecycle ──────────────────────────────────────────────────────
  'email.sent': EmailEventFields;
  'email.delivered': EmailEventFields;
  'email.opened': EmailEventFields;
  'email.clicked': EmailEventFields;
  'email.bounced': EmailEventFields;
  'email.unsubscribed': EmailEventFields;
  'email.complained': EmailEventFields;
  'email.rejected': EmailEventFields;
  'email.rendering_failed': EmailEventFields;
  'email.delivery_delayed': EmailEventFields;
  'email.group_unsubscribe': EmailEventFields;
  'email.group_resubscribe': EmailEventFields;

  // ─── SMS ──────────────────────────────────────────────────────────────────
  /** A provider delivery report said the message arrived. */
  'sms.delivered': SmsEventFields;
  /** A provider delivery report said it did not, and will not. */
  'sms.failed': SmsEventFields & { reason: string | null };

  // ─── Workflows ────────────────────────────────────────────────────────────
  /** A workflow run reached its end. Not emitted for runs that error out. */
  'workflow.completed': {
    workflowId: string;
    runId: string;
    contactId: string | null;
    /** ISO-8601, from workflow_runs.completed_at. */
    completedAt: string | null;
  };

  // ─── Billing ──────────────────────────────────────────────────────────────
  'usage.alert': {
    metric: string;
    threshold: number;
    pctUsed: number;
    current: number;
    limit: number;
  };
}

/** Which code path created a contact. Kept narrow so it stays meaningful. */
export type ContactSource =
  | 'api'
  | 'zapier'
  | 'signup_form'
  | 'sms_keyword'
  | 'inbox'
  | 'ticketing'
  | 'lead_ad'
  | 'calendly'
  | 'cdp';

export interface SmsEventFields {
  /** The provider's own message id — what a delivery report is keyed on. */
  providerMessageId: string;
  provider: string | null;
  to: string | null;
  contactId?: string | null;
  campaignId?: string | null;
}

/**
 * Compile-time proof that the map covers every event and invents none.
 *
 * The runtime check that every event has an EMITTER lives in
 * webhook-event-coverage.test.ts. This one only guarantees that the two lists
 * agree, which is the cheaper half and worth having at build time.
 */
type Assert<T extends true> = T;
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Fails to compile if WEBHOOK_EVENTS and this map ever diverge. */
export type _EveryEventHasAPayload = Assert<Exact<keyof WebhookEventPayloads, WebhookEvent>>;
