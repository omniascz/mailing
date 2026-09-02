/**
 * Multi-email profiles — store up to 5 emails per contact with independent
 * consent + verification. Sending logic prefers the primary email and falls
 * back to the first verified non-primary if primary is unsubscribed.
 *
 * ─── Tenant scoping ──────────────────────────────────────────────────────────
 *
 * Every function here takes `orgId` and every statement filters on it.
 *
 * It did not. `contact_emails` has an `org_id` column and `addEmail` accepted an
 * `orgId` — but only to write it into the new row. Not one query READ it: the
 * quota count, the "clear the other primary" reset, and every update and delete
 * matched on `contact_id` (+ `id`) alone, both here and in the route, which
 * passed the `:contactId` straight from the URL.
 *
 * The whole file is one shape, so it is fixed as one. These routes are core —
 * registered unconditionally, live in production — so this is not a dormant
 * hole behind a flag: any authenticated user could list another tenant's
 * addresses, flip their consent, mark them verified, or delete them, given a
 * contact UUID.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contactEmails, type ContactEmail } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

const MAX_EMAILS_PER_CONTACT = 5;

export async function addEmail(
  orgId: string,
  contactId: string,
  input: {
    email: string;
    isPrimary?: boolean;
    consent?: 'pending' | 'subscribed' | 'unsubscribed';
  },
): Promise<ContactEmail> {
  const rows = (await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count FROM contact_emails
    WHERE contact_id = ${contactId}::uuid AND org_id = ${orgId}::uuid
  `)) as unknown as Array<{ count: string }>;
  const count = rows[0]?.count ?? '0';
  if (Number(count) >= MAX_EMAILS_PER_CONTACT) {
    throw AppError.badRequest(`Profile already has ${MAX_EMAILS_PER_CONTACT} emails`);
  }
  if (input.isPrimary) {
    await db
      .update(contactEmails)
      .set({ isPrimary: false })
      .where(and(eq(contactEmails.contactId, contactId), eq(contactEmails.orgId, orgId)));
  }
  const [row] = await db
    .insert(contactEmails)
    .values({
      orgId,
      contactId,
      email: input.email,
      isPrimary: input.isPrimary ?? false,
      consent: input.consent ?? 'pending',
    })
    .returning();
  return row!;
}

export async function listEmails(orgId: string, contactId: string): Promise<ContactEmail[]> {
  return db
    .select()
    .from(contactEmails)
    .where(and(eq(contactEmails.contactId, contactId), eq(contactEmails.orgId, orgId)));
}

export async function setPrimary(
  orgId: string,
  contactId: string,
  emailId: string,
): Promise<ContactEmail> {
  await db
    .update(contactEmails)
    .set({ isPrimary: false })
    .where(and(eq(contactEmails.contactId, contactId), eq(contactEmails.orgId, orgId)));
  const [row] = await db
    .update(contactEmails)
    .set({ isPrimary: true })
    .where(
      and(
        eq(contactEmails.contactId, contactId),
        eq(contactEmails.id, emailId),
        eq(contactEmails.orgId, orgId),
      ),
    )
    .returning();
  if (!row) throw AppError.notFound('ContactEmail');
  return row;
}

export async function setConsent(
  orgId: string,
  contactId: string,
  emailId: string,
  consent: 'subscribed' | 'unsubscribed',
): Promise<ContactEmail> {
  const [row] = await db
    .update(contactEmails)
    .set({ consent })
    .where(
      and(
        eq(contactEmails.contactId, contactId),
        eq(contactEmails.id, emailId),
        eq(contactEmails.orgId, orgId),
      ),
    )
    .returning();
  if (!row) throw AppError.notFound('ContactEmail');
  return row;
}

export async function verifyEmail(
  orgId: string,
  contactId: string,
  emailId: string,
): Promise<ContactEmail> {
  const [row] = await db
    .update(contactEmails)
    .set({ verifiedAt: new Date() })
    .where(
      and(
        eq(contactEmails.contactId, contactId),
        eq(contactEmails.id, emailId),
        eq(contactEmails.orgId, orgId),
      ),
    )
    .returning();
  if (!row) throw AppError.notFound('ContactEmail');
  return row;
}

export async function removeEmail(
  orgId: string,
  contactId: string,
  emailId: string,
): Promise<void> {
  await db
    .delete(contactEmails)
    .where(
      and(
        eq(contactEmails.contactId, contactId),
        eq(contactEmails.id, emailId),
        eq(contactEmails.orgId, orgId),
      ),
    );
}

/** Pick the email to send to: primary if subscribed, else first verified subscribed alt. */
export async function bestSendableEmail(
  orgId: string,
  contactId: string,
): Promise<ContactEmail | null> {
  const rows = await listEmails(orgId, contactId);
  const subscribed = rows.filter((r) => r.consent === 'subscribed');
  return (
    subscribed.find((r) => r.isPrimary) ??
    subscribed.find((r) => r.verifiedAt) ??
    subscribed[0] ??
    null
  );
}
