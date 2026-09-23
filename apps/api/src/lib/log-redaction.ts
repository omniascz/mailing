/**
 * The request log stops carrying usable credentials.
 *
 * Fastify's default request serializer logs `req.url`, and this product puts
 * signed tokens in URLs — most of them in the PATH, a few in the query.
 * Measured against a real logger before this existed:
 *
 *   /api/v1/preferences/eyJvcmdJZCI6…In0.Ab3Cd4Ef5Gh6…
 *   /api/v1/unsubscribe/eyJ0eXBlIjoidW5zdWIi…In0.mi1fGohJWgfkCFhv…
 *   /track/c/eyJ0eXBlIjoiY2xpY2si…fQ.N-g_Z-bJ5giAAHQQe4Nq…
 *   /public/forms/<uuid>/autofill?fmcid=msqRPVeNtDWajKTrFRTr0i-…
 *
 * Every one of those is enough to act as the recipient: open their preference
 * centre, unsubscribe them, follow their tracked link. A log line is not a
 * secret store — it is shipped, indexed, and read by people who have no
 * business holding a contact's credentials.
 *
 * ─── What is replaced, and what is deliberately not ─────────────────────────
 *
 * The value is replaced by a MARKER, never dropped: `[redacted]` keeps the fact
 * that the parameter was there, which is what makes a log line still usable for
 * "somebody hit the unsubscribe route without a token" versus "with one".
 *
 * Two rules, both conservative:
 *
 *   1. named query parameters — the ones this product actually signs, plus the
 *      generic names an integration might add (`token`, `signature`, `key`).
 *   2. path segments that LOOK like a token: 40 or more base64url characters,
 *      optionally with a `.` separating payload from signature. The real ones
 *      are far longer (unsubscribe 218, preference centre 216, open pixel 286,
 *      click 384-456 — the numbers index.ts records for maxParamLength), and a
 *      UUID is 36 with dashes, so ids, slugs and route names survive untouched.
 *
 * What must not change, because things depend on it: the request id (logged
 * outside this serializer), the method, host, remote address and port, the
 * path structure itself, and the response serializer with its status code.
 * This function rewrites one string and copies the rest.
 */

import type { FastifyRequest } from 'fastify';

/** Query parameters whose value is a credential. */
const SENSITIVE_QUERY = new Set([
  'token',
  'access_token',
  'signature',
  'sig',
  'key',
  'apikey',
  'api_key',
  'secret',
  // Form autofill is gone (#334 removed), but a link that was already sent can
  // still arrive, and it must not be logged in full when it does.
  'fmid',
  'fmcid',
]);

/** 40+ base64url characters, optionally `payload.signature`. */
const TOKEN_LIKE = /^[A-Za-z0-9_-]{40,}(\.[A-Za-z0-9_-]+)?$/;

export const REDACTED = '[redacted]';

/**
 * Rewrite one URL so it carries no usable token.
 *
 * Never throws: a malformed URL is logged as-is rather than costing a log line.
 */
export function redactUrl(url: string): string {
  if (!url) return url;
  const queryAt = url.indexOf('?');
  const path = queryAt === -1 ? url : url.slice(0, queryAt);
  const query = queryAt === -1 ? '' : url.slice(queryAt + 1);

  const safePath = path
    .split('/')
    .map((segment) => (TOKEN_LIKE.test(segment) ? REDACTED : segment))
    .join('/');

  if (!query) return safePath;

  const safeQuery = query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return pair;
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (SENSITIVE_QUERY.has(name.toLowerCase())) return `${name}=${REDACTED}`;
      // A value that is token-shaped is redacted whatever it is called: an
      // integration that names its token `t` is not a reason to log it.
      if (TOKEN_LIKE.test(value)) return `${name}=${REDACTED}`;
      return pair;
    })
    .join('&');

  return `${safePath}?${safeQuery}`;
}

/**
 * The `req` serializer, field for field what Fastify's default produces —
 * except that `url` has been through redactUrl.
 */
export function requestSerializer(req: FastifyRequest): Record<string, unknown> {
  return {
    method: req.method,
    url: redactUrl(req.url),
    host: req.headers?.host,
    remoteAddress: req.ip,
    remotePort: req.socket?.remotePort,
  };
}
