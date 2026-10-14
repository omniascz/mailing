/**
 * One address, one contact.
 *
 * contacts had only a plain (org_id, email) index and kept the address as it
 * was typed, so every path that created a contact for an address the org
 * already held made a second one — active, beside the unsubscribed, pending,
 * bounced or complained original. POST /contacts, the batch, PUT, Zapier,
 * Mall.cz, the CDP identity graph and the Raynet and Salesforce pulls never
 * looked; the Resend API, Calendly, Stripe, CDP sync and the forms, DOI and
 * imports looked by exact spelling. A campaign then mailed the duplicate of
 * everyone whose refusal lived only in contacts.status (Z146, measured by
 * sending). The four migrations that upserted on (org_id, email) created
 * nobody at all: Postgres refused every insert for want of a unique index.
 *
 * Migration 0036 stores every address in normalizeEmail() form and puts a
 * partial unique index on (org_id, email) for live contacts. Everything that
 * finds a contact by address does it through contactEmailIs(); everything
 * that creates one for an address that may exist goes through
 * findOrCreateContact(), which takes the contact that is there and never
 * raises its status. A soft-deleted or anonymised contact is outside the
 * index, so its address can be created again (and an erasure's hash still
 * blocks the send, services/suppressions/email.ts).
 */
import { and, eq, isNull, ne, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts, type Contact, type NewContact } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { normalizeEmail } from '../../lib/email-address.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

/** Name of the partial unique index from migration 0036. */
export const CONTACT_EMAIL_INDEX = 'contacts_org_email_uq';

/**
 * The predicate of that index, for ON CONFLICT: Postgres matches a partial
 * index only when the statement names its predicate.
 */
export const LIVE_CONTACT_EMAIL = sql`deleted_at IS NULL AND email IS NOT NULL`;

/** The live contact whose address is `email`, in any spelling. */
export function contactEmailIs(email: string): SQL {
  return and(eq(contacts.email, normalizeEmail(email)), isNull(contacts.deletedAt))!;
}

/** normalizeEmail() in SQL, for joining contacts.email to an address column of another table. */
export function normalizedEmailSql(expr: SQL): SQL {
  return sql`lower(btrim(${expr}))`;
}

/** The answer to creating a contact for an address that already has one. */
export function contactExists(id: string): AppError {
  return new AppError({
    code: 'CONTACT_EXISTS',
    message: 'A contact with this email address already exists',
    statusCode: 409,
    details: { id },
  });
}

/** Did this write lose to the unique index on (org_id, email)? */
export function isContactEmailConflict(err: unknown): boolean {
  let current = err as { code?: unknown; constraint_name?: unknown; cause?: unknown } | null;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current.code === '23505' && current.constraint_name === CONTACT_EMAIL_INDEX) return true;
    current = current.cause as typeof current;
  }
  return false;
}

export async function findContactByEmail(
  orgId: string,
  email: string,
  q: Executor = db,
): Promise<Contact | undefined> {
  const [row] = await q
    .select()
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), contactEmailIs(email)))
    .limit(1);
  return row;
}

/** The id of another live contact that already has `email`, if any. */
export async function emailTakenBy(
  orgId: string,
  email: string,
  exceptId?: string,
  q: Executor = db,
): Promise<string | null> {
  const [row] = await q
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.orgId, orgId),
        contactEmailIs(email),
        ...(exceptId ? [ne(contacts.id, exceptId)] : []),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

export interface FindOrCreateOptions {
  /** Written onto an existing contact only where its own field is empty. */
  fill?: { firstName?: string | null; lastName?: string | null; phone?: string | null };
  q?: Executor;
}

/**
 * The live contact with this address, or a new one made from `values`.
 *
 * An existing contact keeps its status — unsubscribed, pending, bounced and
 * complained stay what they are; whoever calls this cannot lift a refusal by
 * creating the address again. Only the empty fields named in `fill` are
 * filled. Two callers racing for a new address get the same row: the loser's
 * insert hits the unique index and reads the winner's.
 */
export async function findOrCreateContact(
  orgId: string,
  email: string,
  values: Omit<NewContact, 'orgId' | 'email'>,
  opts: FindOrCreateOptions = {},
): Promise<{ contact: Contact; created: boolean }> {
  const q = opts.q ?? db;
  const address = normalizeEmail(email);

  let existing = await findContactByEmail(orgId, address, q);
  if (!existing) {
    const [inserted] = await q
      .insert(contacts)
      .values({ ...values, orgId, email: address })
      .onConflictDoNothing({ target: [contacts.orgId, contacts.email], where: LIVE_CONTACT_EMAIL })
      .returning();
    if (inserted) return { contact: inserted, created: true };
    existing = await findContactByEmail(orgId, address, q);
    if (!existing) throw AppError.internal('Contact insert conflicted but no contact was found');
  }

  const fill: Record<string, SQL> = {};
  for (const [key, column] of [
    ['firstName', contacts.firstName],
    ['lastName', contacts.lastName],
    ['phone', contacts.phone],
  ] as const) {
    const value = opts.fill?.[key];
    if (value && !existing[key]) fill[key] = sql`coalesce(${column}, ${value})`;
  }
  if (Object.keys(fill).length === 0) return { contact: existing, created: false };

  const [filled] = await q
    .update(contacts)
    .set({ ...fill, updatedAt: new Date() })
    .where(eq(contacts.id, existing.id))
    .returning();
  return { contact: filled ?? existing, created: false };
}
