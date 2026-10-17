/**
 * What a GDPR erasure keeps of a phone number, and how a send finds it (Z180).
 *
 * anonymizeContact (services/contacts/gdpr.ts) used to keep a fingerprint of
 * the e-mail address only. The number was deleted without one, so the same
 * number given to a contact created again — active, with an sms_consents row
 * on it, possibly one the erasure never touched because it had no contact_id —
 * got every marketing SMS and WhatsApp (Z179, measured on master by sending).
 * Michal, 13. 10.: "GDPR anonymizace: hash potlačení musí blokovat"; 14. 10.:
 * "HMAC s tajným klíčem místo prostého hashe". The erasure now also writes
 * suppressions.phone_hash, on a 'manual' row of its own (the address's row is
 * deleted by a double opt-in confirmation, and the number must not go with
 * it — Z179, measured), and a campaign's or a flow's marketing SMS
 * (services/sms/routing.ts) and WhatsApp (the workers' whatsapp-sender, through
 * /internal/contacts/batch) do not go to a number whose fingerprint is there;
 * POST /suppressions/check reports it as an ordinary 'manual' row.
 * A transactional SMS does not read it: whether it should is Michal's
 * (asked 17. 10.).
 *
 * The fingerprint is HMAC-SHA256 under SUPPRESSION_HASH_KEY — the key of the
 * e-mail fingerprint, no second one — of `phone:` and the number as
 * suppressionPhone() writes it. The prefix keeps the two apart: the e-mail
 * fingerprint of a string and the phone fingerprint of the same string are
 * never equal, so a row written for one can never stop the other.
 *
 * Nothing lifts it. A double opt-in confirmation lifts the e-mail fingerprint
 * (services/contacts/resubscribe.ts); a number has no such path, and how an
 * erased person comes back to SMS is Michal's question. Until then it blocks.
 */
import { createHmac } from 'node:crypto';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { suppressions } from '../../db/schema/index.js';
import { normalizeE164 } from '../phone/pure.js';

/**
 * The one spelling of a number the fingerprint is taken of, for writing and
 * for reading alike: normalizeE164 (services/phone/pure.ts) — decorations
 * stripped, 00 turned into +, a bare national number given +420 — so
 * "+420 777 123 456", "+420777123456" and "00420777123456" are one number.
 * Nothing on the SMS path normalises the recipient before the gates (routing
 * passes contacts.phone as stored, and the BulkGate adapter's digits-only form
 * keeps a leading 00), and sms_consents keeps what was typed, so the
 * fingerprint cannot lean on either. A string normalizeE164 refuses is taken
 * trimmed, as it is.
 */
export function suppressionPhone(phone: string): string {
  return normalizeE164(phone) ?? phone.trim();
}

/**
 * HMAC-SHA256 under `key` of `phone:` + suppressionPhone(), hex — 64
 * characters, as the e-mail fingerprint. suppressionPhoneHash() is this under
 * SUPPRESSION_HASH_KEY; the key is a parameter only so a test can show that
 * another key gives another fingerprint.
 */
export function suppressionPhoneHashWith(key: string, phone: string): string {
  return createHmac('sha256', key)
    .update(`phone:${suppressionPhone(phone)}`)
    .digest('hex');
}

/** The fingerprint an erasure writes to phone_hash and a marketing send matches. */
export function suppressionPhoneHash(phone: string): string {
  return suppressionPhoneHashWith(env.SUPPRESSION_HASH_KEY, phone);
}

/**
 * suppressionPhone() written in SQL, for a query over a phone column. The same
 * steps as normalizeE164: keep + and digits; a leading + keeps the digits after
 * it, a leading 00 becomes +, nine or more digits get +420; the result is used
 * only when it is an E.164 number, otherwise the trimmed input.
 */
function phoneSql(phone: SQL): SQL {
  const kept = sql`regexp_replace(btrim(${phone}), '[^+0-9]', '', 'g')`;
  const shaped = sql`(CASE
    WHEN left(${kept}, 1) = '+' THEN '+' || regexp_replace(substr(${kept}, 2), '[^0-9]', '', 'g')
    WHEN left(${kept}, 2) = '00' THEN '+' || substr(${kept}, 3)
    WHEN length(${kept}) >= 9 THEN '+420' || ${kept}
    ELSE ${kept}
  END)`;
  return sql`(CASE WHEN ${shaped} ~ '^\\+[1-9][0-9]{7,14}$' THEN ${shaped} ELSE btrim(${phone}) END)`;
}

/**
 * suppressionPhoneHash() computed by Postgres (pgcrypto's hmac, migration
 * 0037), as emailHashSql is for an address. The key travels as a bind
 * parameter of the query and nothing else.
 */
export function phoneHashSql(phone: SQL): SQL {
  return sql`encode(hmac(convert_to('phone:' || ${phoneSql(phone)}, 'UTF8'), convert_to(${env.SUPPRESSION_HASH_KEY}, 'UTF8'), 'sha256'), 'hex')`;
}

/**
 * Whether an erasure in `orgId` left this number's fingerprint — the question a
 * marketing SMS or WhatsApp asks before it goes. One indexed lookup
 * (suppressions_org_phone_hash_idx). An empty number has no fingerprint.
 */
export async function phoneErased(orgId: string, phone: string | null | undefined) {
  if (!phone?.trim()) return false;
  const [row] = await db
    .select({ id: suppressions.id })
    .from(suppressions)
    .where(
      and(eq(suppressions.orgId, orgId), eq(suppressions.phoneHash, suppressionPhoneHash(phone))),
    )
    .limit(1);
  return !!row;
}
