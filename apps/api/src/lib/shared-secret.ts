/**
 * Constant-time comparison for the shared secrets machines authenticate with.
 *
 * This lived inside plugins/internal-auth.ts, which is why the routes that are
 * NOT under /api/v1/internal/* never got it: the MX receiver endpoints in
 * routes/v1/inbound-email.ts compared with `!==`, which returns as soon as two
 * bytes differ and so leaks how much of a guess was right.
 *
 * Those routes cannot simply move under the internal prefix. The engine holds
 * their URL in INBOUND_API_URL and posts inbound mail to it; changing the path
 * means an API deploy and an engine env change in the right order, and mail
 * arriving in the gap is refused at the MX and bounced back to the sender.
 * They also authenticate with a different secret on purpose — the MX receiver
 * sits on the internet-facing edge and its credential should be rotatable
 * without touching every worker. So the URL stays and the comparison moves
 * here, where both callers can reach it.
 */
import crypto from 'node:crypto';

/**
 * Compare without leaking length either.
 *
 * timingSafeEqual throws when the buffers differ in size, and a try/catch
 * around it turns "wrong length" into a fast reject — a length oracle. Hashing
 * both sides first makes every comparison run over 32 bytes regardless of what
 * the caller sent.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Same, for a header that Node may hand back as an array or not at all.
 * An absent secret is never a match — including against an unset expectation,
 * which would otherwise compare '' to '' and let everyone through.
 */
export function headerMatchesSecret(
  header: string | string[] | undefined,
  expected: string | undefined,
): boolean {
  if (!expected) return false;
  const provided = Array.isArray(header) ? header[0] : header;
  if (!provided) return false;
  return secretsMatch(provided, expected);
}
