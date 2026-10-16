/**
 * The list double opt-in confirmation — the one sender of it. Generates a DOI
 * token (the `doi:<token>` Redis key + `{contactId,listId,orgId}` payload the
 * `GET /api/v1/confirm/:token` handler consumes) and emails the confirmation
 * link. Used by POST /api/v1/lists/:listId/subscribe and by signup-form submits
 * with `doubleOptIn` enabled.
 *
 * Those two used to carry a copy each of the same mail (the route's was inline).
 * They are one function now because this mail is the only one allowed through
 * the row a GDPR erasure leaves (TransactionalPurpose in lib/queues.ts; Z148,
 * narrowed to the erasure row in Z170): one place asks for that, so one place
 * has to be read to know who can. It is also the one place the limit below
 * holds for both callers.
 */

import crypto from 'node:crypto';
import { redis } from '@forgemsg/shared/redis';
import { sendTransactionalEmail } from '../../lib/queues.js';
import { env } from '../../config/env.js';
import { suppressionEmailHash } from '../suppressions/email.js';

const DOI_TTL = 60 * 60 * 48; // 48h — the link's own text says so

// Michal 14. 10.: max 3 za 24 h na adresu a seznam.
const DOI_LIMIT = 3;
const DOI_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A sliding window of the confirmations queued for one address on one list: a
 * sorted set of send times. Times 24 hours old or older are dropped, and a new
 * one is written only while fewer than ARGV[3] remain — in one script, so five
 * requests at once cannot all read "two so far" and let a fourth through.
 * Returns 1 when this confirmation may go, 0 when the limit is reached.
 */
const LIMIT_SCRIPT = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], now, ARGV[4])
redis.call('PEXPIRE', KEYS[1], window)
return 1
`;

/**
 * The limit's key: the list and the erasure fingerprint of the address
 * (suppressionEmailHash, keyed), never the address itself.
 */
export function doiLimitKey(listId: string, email: string): string {
  return `doi:limit:${listId}:${suppressionEmailHash(email.toLowerCase())}`;
}

export async function sendListDoiConfirmation(opts: {
  orgId: string;
  contactId: string;
  listId: string;
  email: string;
  listName: string;
  firstName?: string | null;
  toName?: string;
}): Promise<{ token: string; confirmUrl: string }> {
  const token = crypto.randomUUID();
  const apiPublicUrl = process.env.API_PUBLIC_URL ?? process.env.APP_URL ?? 'http://localhost:3001';
  const confirmUrl = `${apiPublicUrl}/api/v1/confirm/${token}`;

  // At most DOI_LIMIT confirmations per address and list in any 24 hours. The
  // public route used to mail any address a confirmation as often as anyone
  // asked. Every queued confirmation counts, also one the MTA gate then stops;
  // an attempt over the limit counts for nothing. A Redis failure throws, as
  // the setex below did before: nothing is sent unchecked.
  const now = Date.now();
  const allowed = await redis.eval(
    LIMIT_SCRIPT,
    1,
    doiLimitKey(opts.listId, opts.email),
    now,
    DOI_LIMIT_WINDOW_MS,
    DOI_LIMIT,
    `${now}:${token}`,
  );
  if (Number(allowed) !== 1) {
    // Both callers answer exactly as for a sent confirmation, and the token
    // has the same shape but is stored nowhere: the answer must not tell
    // anyone what has been sent to this address. The log names no address.
    console.warn(`[doi] doi_rate_limited list=${opts.listId} org=${opts.orgId}`);
    return { token, confirmUrl };
  }

  await redis.setex(
    `doi:${token}`,
    DOI_TTL,
    JSON.stringify({ contactId: opts.contactId, listId: opts.listId, orgId: opts.orgId }),
  );
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : 'Hi,';
  await sendTransactionalEmail(
    {
      to: opts.email,
      ...(opts.toName ? { toName: opts.toName } : {}),
      from: env.SYSTEM_EMAIL_FROM,
      fromName: opts.listName,
      subject: `Confirm your subscription to ${opts.listName}`,
      html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:24px;color:#1e293b">
<p style="font-size:16px">${greeting}</p>
<p style="font-size:16px">You signed up to receive emails from <strong>${opts.listName}</strong>. Click below to confirm.</p>
<p style="margin:32px 0"><a href="${confirmUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Confirm subscription</a></p>
<p style="font-size:13px;color:#64748b">If you didn't sign up, ignore this — no further messages will arrive. The link expires in 48 hours.</p>
</body></html>`,
      text: `${greeting}\n\nYou signed up to receive emails from ${opts.listName}. Confirm here:\n${confirmUrl}\n\nLink expires in 48 hours.`,
      orgId: opts.orgId,
      contactId: opts.contactId,
    },
    // The recipient asked for this mail, so the row a GDPR erasure leaves
    // (reason 'manual', no address, only email_hash) does not stop it — the
    // confirmation is the erased person's only way back. Výjimka jen pro výmaz
    // GDPR — Michal 14. 10., varianta (a): an ordinary 'manual' row (an
    // operator's entry, graymail) stops it, as does every other reason but
    // 'unsubscribe' (mta-sender isSuppressed, check-batch exceptErasure).
    { purpose: 'doi_confirmation' },
  ).catch((err: unknown) => {
    // Logged, not thrown: the token is stored and both callers answer as
    // they did before — the route with 202, the form with its message.
    console.error(
      `[doi] doi_email_enqueue_failed list=${opts.listId} org=${opts.orgId}: ${(err as Error)?.message}`,
    );
  });
  return { token, confirmUrl };
}
