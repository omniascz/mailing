/**
 * Emit helpers for outgoing webhook events.
 *
 * Two jobs, both of which were being done ad hoc at each call site before:
 *
 * 1. Never let a webhook take down the operation that produced it. A customer
 *    creating a contact must not get a 500 because their webhook endpoint's
 *    row could not be written.
 *
 * 2. Never swallow the failure either. Every existing emitter ended in
 *    `.catch(() => {})`, so a dispatch that failed left no trace anywhere —
 *    which is how you end up unable to answer "did we even try to send it?".
 *    These log with enough context to find the org and the event.
 */

import type { WebhookEvent } from '../../db/schema/webhooks.js';
import { dispatchEvent } from './index.js';
import type { ContactSummary, WebhookEventPayloads } from './payloads.js';

/**
 * Fire an event without awaiting it and without letting it throw.
 *
 * Deliberately not exported as a promise: every call site is on a request or
 * job path where the webhook is a side effect, and returning something
 * awaitable invites someone to await it and couple the two.
 */
export function emitWebhookEvent<E extends WebhookEvent>(
  orgId: string,
  event: E,
  payload: WebhookEventPayloads[E],
): void {
  void dispatchEvent(orgId, event, payload).catch((err: unknown) => {
    // Not silent. A dispatch failure means the row was never written, so the
    // delivery worker will never see it — there is no later retry to rely on.
    console.error(
      `[webhooks] dispatch failed for ${event} (org ${orgId}):`,
      err instanceof Error ? err.message : err,
    );
  });
}

/** The row shape every contact-creating path already has to hand. */
export interface ContactRowish {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  status?: string | null;
  createdAt?: Date | string | null;
}

/**
 * Build the contact shape the contract promises.
 *
 * Centralised because it is the exact thing that went wrong: the signup form
 * sent `{ contactId, formId, email }` while the published Zapier sample
 * promised `{ id, email, firstName, lastName }`. With one builder, every path
 * sends the same fields whether or not it happens to have them all loaded.
 */
export function toContactSummary(row: ContactRowish): ContactSummary {
  const created = row.createdAt;
  return {
    id: row.id,
    email: row.email ?? null,
    firstName: row.firstName ?? null,
    lastName: row.lastName ?? null,
    phone: row.phone ?? null,
    status: row.status ?? 'active',
    createdAt: (created instanceof Date ? created : new Date(created ?? Date.now())).toISOString(),
  };
}

/** Which of a contact's fields a patch actually changed. */
export function changedFields(patch: Record<string, unknown>): string[] {
  return Object.keys(patch).filter((k) => patch[k] !== undefined);
}
