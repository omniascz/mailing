/**
 * From-address ownership: the single place that decides whether an org may send
 * mail claiming a given From address.
 *
 * Every send path used to trust the From string as given, so any authenticated
 * caller could put `ceo@paypal.com` in it — accepted with HTTP 200, and if a
 * matching verified domain happened to exist it would even be DKIM-signed. This
 * function closes that: the From must resolve to something the org has proven it
 * controls.
 *
 * ─── Source of truth ────────────────────────────────────────────────────────
 *
 * Two, in order of specificity, matching how the sandbox gate already treats a
 * sender:
 *
 *   1. `sending_domains`  — a verified domain lets the org send from ANY address
 *      at that domain (SES/SendGrid domain identity). This is the primary source
 *      the task names.
 *   2. `email_identities` — a verified single address (SES VerifyEmailIdentity).
 *      The lightweight on-ramp: an org with no domain of its own verifies one
 *      mailbox and may send from exactly that address. Without it, "no verified
 *      domain" would mean "cannot send at all", which is stricter than the
 *      product already is elsewhere.
 *
 * Both are org-scoped, so a domain verified by another org is invisible here.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { sendingDomains } from '../../db/schema/domains.js';
import { emailIdentities } from '../../db/schema/email-identities.js';
import { AppError } from '../../lib/app-error.js';

/**
 * Pull the bare email out of a From value. Handles `Name <user@host>` and a
 * bare `user@host`; lowercases, because both stored sources are lowercased.
 * Returns null when there is no address to check.
 */
export function extractFromAddress(from: string | null | undefined): string | null {
  if (!from) return null;
  const angle = /<([^>]+)>/.exec(from);
  const raw = (angle ? angle[1]! : from).trim().toLowerCase();
  // A single @ with something either side. Deliberately loose — Zod/MIME parsing
  // upstream already reject the obviously malformed; this only needs the domain.
  if (!/^[^@\s]+@[^@\s]+$/.test(raw)) return null;
  return raw;
}

/** The domain half of a parsed address, or null. */
export function fromAddressDomain(from: string | null | undefined): string | null {
  const addr = extractFromAddress(from);
  return addr ? (addr.split('@')[1] ?? null) : null;
}

/**
 * The one, deliberately vague, refusal. It must not reveal WHY the address is
 * not allowed — in particular it must not distinguish "belongs to another org"
 * from "not verified" from "does not exist", or it becomes an oracle for probing
 * which domains other tenants have registered. Same wording for every failure.
 */
function refuse(): never {
  throw new AppError({
    code: 'FROM_NOT_VERIFIED',
    statusCode: 403,
    message:
      'This From address is not a verified sender for your account. ' +
      'Verify the domain or email address under Sending Domains before sending from it.',
  });
}

/**
 * Assert the org may send as `fromAddress`. Resolves on success; throws
 * AppError (403 FROM_NOT_VERIFIED, or 400 for an unparseable address) otherwise.
 *
 * This is the whole contract — call it on every path that lets a caller choose
 * a From, before anything is queued or dispatched.
 */
export async function assertFromDomainOwned(orgId: string, from: string): Promise<void> {
  const address = extractFromAddress(from);
  if (!address) {
    throw AppError.badRequest('A valid From email address is required.');
  }
  const domain = address.split('@')[1]!;

  // 1) Verified domain identity — any mailbox at the domain.
  const [domainRow] = await db
    .select({ id: sendingDomains.id })
    .from(sendingDomains)
    .where(
      and(
        eq(sendingDomains.orgId, orgId),
        eq(sendingDomains.domain, domain),
        eq(sendingDomains.isVerified, true),
      ),
    )
    .limit(1);
  if (domainRow) return;

  // 2) Verified single-address identity — exactly this mailbox.
  const [identityRow] = await db
    .select({ id: emailIdentities.id })
    .from(emailIdentities)
    .where(
      and(
        eq(emailIdentities.orgId, orgId),
        eq(emailIdentities.email, address),
        eq(emailIdentities.status, 'verified'),
      ),
    )
    .limit(1);
  if (identityRow) return;

  refuse();
}
