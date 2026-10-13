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
 */
import { inArray, sql, type SQL } from 'drizzle-orm';
import { suppressions } from '../../db/schema/index.js';

/** The form an address is stored in on the suppression list. */
export function suppressionEmail(email: string): string {
  return email.trim().toLowerCase();
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
