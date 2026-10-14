/**
 * One spelling for an address on the suppression list, and one way to look it
 * up.
 *
 * A suppression blocked only the exact spelling it was stored in. POST
 * /suppressions stored what the operator typed, graymail and the DSN fallback
 * stored contacts.email as it was imported, and every reader compared
 * `suppressions.email` exactly against a lower-cased address. So a manual
 * suppression of Jan.Novak@Example.CZ never stopped a campaign, a flow, a
 * receipt, POST /emails or an SMTP RCPT to jan.novak@example.cz (Z144,
 * measured on master by sending) — a refusal that refuses nothing.
 *
 * Every writer stores suppressionEmail(); every reader matches through
 * suppressionEmailIs / suppressionEmailIn, which compare lower() on both sides,
 * so a row written before migration 0034 lower-cased the table still matches.
 * The (org_id, lower(email)) index serves these lookups.
 *
 * ─── An erased address (Z145) ───────────────────────────────────────────────
 *
 * Anonymisation (services/contacts/gdpr.ts) cannot keep the address, so its
 * suppression has email NULL and email_hash = suppressionEmailHash(address).
 * That hash used to sit in `notes`, read by nothing that decides a send: the
 * same address created again — POST /contacts, an import, a form — got
 * campaigns, flows and receipts (measured on master by sending). Every send
 * decision now asks suppressionBlocks / suppressionBlocksAny /
 * addressUnsuppressed, which match the address OR its hash. The other readers
 * (consent-hold, unsubscribe, preference centre, …) keep suppressionEmailIs:
 * they look for a row of a given reason, not for whether mail may go.
 */
import { createHash } from 'node:crypto';
import { inArray, or, sql, type SQL } from 'drizzle-orm';
import { suppressions } from '../../db/schema/index.js';

/** The form an address is stored in on the suppression list. */
export function suppressionEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * What an erasure keeps of an address: SHA-256, hex, of suppressionEmail().
 * The same hash anonymizeContact wrote into notes before migration 0035 copied
 * it into email_hash, so rows from before and after match alike.
 */
export function suppressionEmailHash(email: string): string {
  return createHash('sha256').update(suppressionEmail(email)).digest('hex');
}

/** suppressionEmailHash() computed by Postgres, for a query over an address column. */
function emailHashSql(email: SQL): SQL {
  return sql`encode(sha256(convert_to(lower(btrim(${email})), 'UTF8')), 'hex')`;
}

/** A row that stops mail to this address: written for it, or left by its erasure. */
export function suppressionBlocks(email: string): SQL {
  return sql`(${suppressionEmailIs(email)} OR ${suppressions.emailHash} = ${suppressionEmailHash(email)})`;
}

/** A row that stops mail to one of these addresses, by address or by erasure hash. */
export function suppressionBlocksAny(emails: readonly string[]): SQL {
  return or(
    suppressionEmailIn(emails),
    inArray(suppressions.emailHash, emails.map(suppressionEmailHash)),
  )!;
}

/**
 * Which of `emails` the rows of a suppressionBlocksAny query stop, as given.
 * An erasure row has no address to answer with, so the answer is always the
 * caller's own spelling, never the row's.
 */
export function blockedAmong(
  emails: readonly string[],
  rows: readonly { email: string | null; emailHash: string | null }[],
): string[] {
  const byEmail = new Set(rows.flatMap((r) => (r.email ? [suppressionEmail(r.email)] : [])));
  const byHash = new Set(rows.flatMap((r) => (r.emailHash ? [r.emailHash] : [])));
  return emails.filter(
    (e) => byEmail.has(suppressionEmail(e)) || byHash.has(suppressionEmailHash(e)),
  );
}

/**
 * No suppression stops mail to the address in `email`, for organisation
 * `orgId` — both columns of the outer query (an audience over contacts). Two
 * NOT EXISTS joined by AND, each planned as its own anti-join: written as
 * NOT (EXISTS … OR EXISTS …) the planner probed both indexes once per contact
 * instead, 608 ms against 143 ms for a 100 000-contact list (Z145, EXPLAIN
 * ANALYZE; the address-only check on master took 95 ms).
 */
export function addressUnsuppressed(orgId: SQL, email: SQL): SQL {
  return sql`(
    NOT EXISTS (
      SELECT 1 FROM "suppressions" s
      WHERE s."org_id" = ${orgId} AND lower(s."email") = lower(${email})
    )
    AND NOT EXISTS (
      SELECT 1 FROM "suppressions" s
      WHERE s."org_id" = ${orgId} AND s."email_hash" = ${emailHashSql(email)}
    )
  )`;
}

/** The row is for this address, whatever case either side was written in. */
export function suppressionEmailIs(email: string): SQL {
  return sql`lower(${suppressions.email}) = lower(${email.trim()})`;
}

/** The row is for one of these addresses, whatever case either side was written in. */
export function suppressionEmailIn(emails: readonly string[]): SQL {
  return inArray(
    sql`lower(${suppressions.email})`,
    emails.map((e) => sql`lower(${e.trim()})`),
  );
}
