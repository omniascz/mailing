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
 * ─── An erased address (Z145, keyed since Z150) ─────────────────────────────
 *
 * Anonymisation (services/contacts/gdpr.ts) cannot keep the address, so its
 * suppression has email NULL and email_hash = suppressionEmailHash(address).
 * That fingerprint used to sit in `notes`, read by nothing that decides a
 * send: the same address created again — POST /contacts, an import, a form —
 * got campaigns, flows and receipts (measured on master by sending). Every
 * send decision now asks suppressionBlocks / suppressionBlocksAny /
 * addressUnsuppressed, which match the address OR its fingerprint. The other
 * readers (consent-hold, unsubscribe, preference centre, …) keep
 * suppressionEmailIs: they look for a row of a given reason, not for whether
 * mail may go.
 *
 * The fingerprint is an HMAC under SUPPRESSION_HASH_KEY, a key held in the
 * environment and never in the database. It was a plain SHA-256 until Z150,
 * and the SHA-256 of an address can be found by anyone holding the database:
 * hash a list of addresses and look for a match (measured: sha256sum of the
 * address equalled email_hash).
 */
import { createHmac } from 'node:crypto';
import { inArray, or, sql, type SQL } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { suppressions } from '../../db/schema/index.js';
import { normalizeEmail } from '../../lib/email-address.js';

/** The form an address is stored in on the suppression list — the same form contacts.email has. */
export function suppressionEmail(email: string): string {
  return normalizeEmail(email);
}

/**
 * What an erasure keeps of an address: HMAC-SHA256 of suppressionEmail()
 * under `key`, hex — 64 characters, the width email_hash always had.
 * suppressionEmailHash() is this under SUPPRESSION_HASH_KEY; the key is a
 * parameter only so a test can show that another key gives another
 * fingerprint.
 */
export function suppressionEmailHashWith(key: string, email: string): string {
  return createHmac('sha256', key).update(suppressionEmail(email)).digest('hex');
}

/**
 * The fingerprint an erasure writes and every send decision matches:
 * suppressionEmailHashWith(SUPPRESSION_HASH_KEY, email).
 *
 * Rows written before Z150 hold a plain SHA-256 of the address (in email_hash,
 * and in notes as `gdpr_anonymized:<hex>`). They no longer match anything, so
 * they no longer block, and nothing looks them up a second way: there were 0
 * such rows — in the development database, and after every migration on a
 * clean database plus the seed (Z150, measured) — and there is no production
 * deployment that could hold one. Turning them into HMACs would need the
 * addresses the erasure removed.
 */
export function suppressionEmailHash(email: string): string {
  return suppressionEmailHashWith(env.SUPPRESSION_HASH_KEY, email);
}

/**
 * suppressionEmailHash() computed by Postgres (pgcrypto's hmac, migration
 * 0037), for a query over an address column. The key travels as a bind
 * parameter of the query and nothing else: it is not stored in a table, a
 * setting or a function body.
 */
export function emailHashSql(email: SQL): SQL {
  return sql`encode(hmac(convert_to(lower(btrim(${email})), 'UTF8'), convert_to(${env.SUPPRESSION_HASH_KEY}, 'UTF8'), 'sha256'), 'hex')`;
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
