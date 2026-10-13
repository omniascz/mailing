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
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { suppressions } from '../../db/schema/index.js';
import type { contacts } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { suppressionEmailIs } from '../suppressions/email.js';

export type ContactStatus = (typeof contacts.$inferSelect)['status'];

/** Statuses only the recipient can leave. */
export const CONSENT_WITHHELD: readonly ContactStatus[] = ['unsubscribed', 'complained'];

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

/** Throws when `next` would take a withheld contact out of its refusal. */
export function assertNotLiftingRefusal(held: ContactStatus, next: ContactStatus): void {
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
