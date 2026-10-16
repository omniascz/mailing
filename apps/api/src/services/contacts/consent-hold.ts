/**
 * Whose decision is it that this contact gets marketing again?
 *
 * An unsubscribe and a complaint are the recipient's own refusal. Only the
 * recipient takes them back, by a consent we can prove: the preference
 * centre's resubscribe or a double opt-in confirmation, both through
 * ./resubscribe.ts, which records that consent. An operator's edit, an API
 * call, an unarchive or an SMS keyword is no such proof, and before Z142 each
 * of them could still put an unsubscribed contact back to 'active' (measured:
 * every one of those paths delivered the next campaign).
 *
 * An archive overwrites contacts.status, so for an archived contact the status
 * that speaks for consent is the one the archive replaced (contacts.archived_from).
 * Contacts archived before that column existed have no record; their
 * suppression rows are what is left of the fact.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { suppressions } from '../../db/schema/index.js';
import type { contacts } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { suppressionBlocks, suppressionEmailIs } from '../suppressions/email.js';

export type ContactStatus = (typeof contacts.$inferSelect)['status'];

/** Statuses only the recipient can leave. */
export const CONSENT_WITHHELD: readonly ContactStatus[] = ['unsubscribed', 'complained'];

/**
 * Statuses where the recipient has not said yes: a double opt-in nobody
 * confirmed, or a contact who never subscribed (an order, a stock alert). Only
 * the recipient's own sign-up makes them 'active' — the signup form, or the
 * confirmation through ./resubscribe.ts — and those write the contact
 * themselves, not through an edit. An operator may still move them anywhere
 * else (unsubscribed, archived, bounced). The dashboard editor once sent
 * `status` on every save, so saving a non_subscribed contact's name opted them
 * into marketing (Z114); the PUT route then refused this itself, so no other
 * caller of updateContact did, and the SMS keyword wrote 'active' over both
 * (Z147, measured: the next campaign reached them).
 */
export const CONSENT_NOT_GIVEN: readonly ContactStatus[] = ['pending', 'non_subscribed'];

/**
 * What an operator may set a withheld contact to: another refusal or an
 * archive, which keeps the refusal in archived_from. ('unsubscribed' on a
 * complained contact runs unsubscribeContact, which keeps 'complained' and the
 * complaint row.) Not 'bounced': that is not a consent state, and the next
 * edit could take a bounced contact to 'active'.
 */
const ALLOWED_FROM: Record<string, readonly ContactStatus[]> = {
  unsubscribed: ['unsubscribed', 'complained', 'archived'],
  complained: ['complained', 'unsubscribed', 'archived'],
};

/**
 * The status an archived contact had, for one archived before 0033: read
 * back from its suppression rows, strongest refusal first. No row → active,
 * which is what unarchive always restored before.
 */
export function statusFromSuppressionReasons(reasons: readonly string[]): ContactStatus {
  if (reasons.includes('complaint')) return 'complained';
  if (reasons.includes('unsubscribe')) return 'unsubscribed';
  if (reasons.some((r) => r === 'hard_bounce' || r === 'invalid_email' || r === 'block'))
    return 'bounced';
  return 'active';
}

/** The status that speaks for consent — see the header. */
export async function heldStatus(
  orgId: string,
  row: { status: ContactStatus; archivedFrom: ContactStatus | null; email: string | null },
): Promise<ContactStatus> {
  if (row.status !== 'archived') return row.status;
  if (row.archivedFrom) return row.archivedFrom;
  if (!row.email) return 'active';
  const rows = await db
    .select({ reason: suppressions.reason })
    .from(suppressions)
    .where(and(eq(suppressions.orgId, orgId), suppressionEmailIs(row.email)));
  return statusFromSuppressionReasons(rows.map((r) => r.reason));
}

/**
 * Throws when `next` would take a withheld contact out of its refusal, or make
 * a contact who never said yes 'active'. 'bounced' → 'active' has its own
 * rule, assertBounceReleased below.
 */
export function assertNotLiftingRefusal(held: ContactStatus, next: ContactStatus): void {
  if (next === 'active' && CONSENT_NOT_GIVEN.includes(held)) {
    throw new AppError({
      code: 'CONSENT_REQUIRED',
      statusCode: 409,
      message:
        `This contact is ${held}. It becomes active only when the recipient subscribes ` +
        `themselves — a signup form or the double opt-in confirmation — not by an edit`,
    });
  }
  const allowed = ALLOWED_FROM[held];
  if (!allowed || allowed.includes(next)) return;
  throw new AppError({
    code: 'CONSENT_REQUIRED',
    statusCode: 409,
    message:
      `This contact is ${held}. Only the recipient can opt back in — through the preference ` +
      `centre or a double opt-in confirmation, which record their consent — not an edit`,
  });
}

/**
 * Suppression reasons that say the mailbox itself does not take mail. Not
 * 'block' (the receiving side refusing us, never a fact about the address —
 * Z140), not complaint/unsubscribe/manual (HELD_REASONS below).
 */
export const BOUNCE_REASONS = ['hard_bounce', 'invalid_email'] as const;

/**
 * 'bounced' → 'active' waits for the bounce to be released (owner's decision,
 * 14 Oct 2026). While the address has a hard_bounce or invalid_email row, an
 * edit is refused; an owner or admin first deletes the row (DELETE
 * /suppressions/:id, audited), which leaves the contact bounced, and only then
 * does the edit go through. Before Z149 the edit went through over the row
 * (measured: 200 for a bounced and an archived-bounced contact alike). A
 * bounced contact with no such row may still be set active.
 *
 * `rows` are the suppression rows of the address the contact will have after
 * the edit — the one mail would go to.
 */
export function assertBounceReleased(
  held: ContactStatus,
  next: ContactStatus,
  rows: readonly { id: string; reason: string }[],
): void {
  if (held !== 'bounced' || next !== 'active') return;
  const row = rows.find((r) => (BOUNCE_REASONS as readonly string[]).includes(r.reason));
  if (!row) return;
  throw new AppError({
    code: 'BOUNCE_ACTIVE',
    statusCode: 409,
    message:
      `This contact's address is suppressed as ${row.reason}. An owner or admin must first ` +
      `release that suppression (DELETE /api/v1/suppressions/${row.id}); then the contact can be set active`,
    details: { reason: row.reason, suppressionId: row.id },
  });
}

/**
 * Suppression reasons no edit lifts (Michal, 13 Oct 2026): an unsubscribe and
 * a complaint are the recipient's own refusal, and only the recipient takes
 * them back — the preference centre's resubscribe or a double opt-in
 * confirmation, through ./resubscribe.ts, which write the contact themselves
 * and not through an edit. A 'manual' row (an operator's block, graymail, a
 * GDPR erasure's hash) is not released by an edit either. Not 'block': that
 * is the receiving side refusing us, not a fact about the address (Z140). Not
 * hard_bounce / invalid_email: those are BOUNCE_REASONS, released by an owner
 * or admin, and keep their own 409 BOUNCE_ACTIVE.
 */
export const HELD_REASONS = ['complaint', 'unsubscribe', 'manual'] as const;

/**
 * An edit to 'active' from any stored status but 'active' is refused while the
 * address has a complaint, unsubscribe or manual row (Z171). The status the
 * contact has in the database is what counts here, not heldStatus: an
 * archived contact whose archive replaced 'active' is held 'active', and
 * before Z171 an edit made it active again over the row (measured: 200), as
 * it did a bounced contact with a complaint row, so the contact read 'active'
 * while the row went on stopping its mail.
 *
 * `rows` are the suppression rows of the address the contact will have after
 * the edit — the one mail would go to.
 */
export function assertNoHeldSuppression(
  stored: ContactStatus,
  next: ContactStatus,
  rows: readonly { id: string; reason: string }[],
): void {
  if (next !== 'active' || stored === 'active') return;
  const row = rows.find((r) => (HELD_REASONS as readonly string[]).includes(r.reason));
  if (!row) return;
  const message =
    row.reason === 'manual'
      ? `This contact's address is suppressed as manual, which an edit does not release; ` +
        `the contact cannot be set active while that suppression stands`
      : `This contact's address is suppressed as ${row.reason}, the recipient's own refusal. ` +
        `Only the recipient comes back — through the preference centre or a double opt-in ` +
        `confirmation — not an edit`;
  throw new AppError({
    code: 'SUPPRESSION_HELD',
    statusCode: 409,
    message,
    details: { reason: row.reason, suppressionId: row.id },
  });
}

/**
 * The rows of `email` in this org that stop an edit to 'active' — the
 * BOUNCE_REASONS and the HELD_REASONS — by address or erasure hash, in one
 * query for both checks.
 */
export async function activeBlockingRows(
  orgId: string,
  email: string | null,
): Promise<{ id: string; reason: string }[]> {
  if (!email) return [];
  return db
    .select({ id: suppressions.id, reason: suppressions.reason })
    .from(suppressions)
    .where(
      and(
        eq(suppressions.orgId, orgId),
        suppressionBlocks(email),
        inArray(suppressions.reason, [...BOUNCE_REASONS, ...HELD_REASONS]),
      ),
    );
}
