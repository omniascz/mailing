import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { redis } from '@forgemsg/shared/redis';
import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

const digest = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 32);

/**
 * Who a request counts against: its verified caller, or its address.
 *
 * The key is derived only from what the auth plugin has already VERIFIED and
 * put on request.user — never from what the client sent unchecked:
 *
 *   - a verified API key   → `apikey:<hash of that key>`, one bucket per key;
 *   - a verified session   → `session:<hash of its token>`, one bucket per
 *                            login. Two users always have two buckets, and a
 *                            page the web app renders on its server for a user
 *                            carries that user's cookie, so it counts against
 *                            that user — not against the web server's address,
 *                            which every user rendered there shares;
 *   - no verified identity → the IP, and only the IP.
 *
 * It used to be `x-api-key header || ip`, unverified: any value in the header,
 * valid or not, opened a fresh bucket — so a random header lifted every limit,
 * the 10-per-15-minutes login limit included — while a real signed-in user
 * rendered by the web server shared one bucket with all the others.
 *
 * request.user is set by the auth plugin's onRequest hook. This plugin attaches
 * its handler to each route (onRoute), and route-level hooks run after the
 * application-level ones, so by the time the key is computed the identity has
 * been checked.
 */
/**
 * The verified API key's part of a route's own composite key (key AND address),
 * or 'anon'. Never the raw header: an unknown value there must not open a
 * bucket of its own.
 */
export function verifiedApiKeyPart(request: FastifyRequest): string {
  return request.user?.apiKeyMode !== undefined
    ? digest(String(request.headers['x-api-key'] ?? ''))
    : 'anon';
}

export function rateLimitKey(request: FastifyRequest): string {
  const user = request.user;
  if (user) {
    // apiKeyMode is set only on the API-key path of the auth plugin, after
    // lookupApiKey found an active key for this exact header value.
    if (user.apiKeyMode !== undefined) {
      return `apikey:${digest(String(request.headers['x-api-key'] ?? ''))}`;
    }
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ')
      ? header.slice(7)
      : (request.cookies as Record<string, string> | undefined)?.['fm_session'];
    if (token) return `session:${digest(token)}`;
  }
  return request.ip;
}

async function rateLimitPlugin(app: FastifyInstance) {
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    // The counter lives in Redis, shared by every instance.
    //
    // Without this option @fastify/rate-limit uses its in-process LocalStore —
    // `if (settings.redis) { new RedisStore } else { new LocalStore }`,
    // index.js:119 — so each API process kept its own buckets. Behind a load
    // balancer that means the real ceiling is 100/min TIMES the number of
    // instances, and which share a caller gets depends on how the balancer
    // happens to spread them. One instance is the only configuration in which
    // the advertised limit is the actual limit.
    //
    // This also covers the per-route limits in routes/v1/auth.ts — register
    // 5/hour, login 10/15min, forgot-password 3/hour and the rest. Those pass
    // `config.rateLimit` to this same plugin rather than registering their own,
    // so they were per-process too: the login limit that exists to slow down
    // credential stuffing was the weakest of the lot, being the one an attacker
    // would most like to multiply by the instance count.
    //
    // The same Redis and the same client as the AI daily quota already uses
    // (lib/ai-client.ts → @forgemsg/shared/redis), so this adds a dependency
    // the request path already had rather than a new one.
    //
    // `skipOnError` is left at its default of FALSE (index.js:108). If Redis is
    // unreachable the limiter throws and the request is refused, rather than
    // every caller becoming unlimited at the moment the shared counter is
    // unavailable. For a limiter that is the right side to fail on, and it
    // matches how the internal-auth and webhook gates in this codebase behave.
    redis,
    keyGenerator: rateLimitKey,
    // Exempt /api/v1/internal/* from the limit. These are the
    // service-to-service endpoints (the Go SMTP server's auth + relay calls),
    // already gated by a timing-safe secret in internalAuthPlugin — the IP
    // limit adds no protection there. Worse, every SMTP login arrives from the
    // engine's single IP, so one brute-force flood used to exhaust the shared
    // 100/min bucket and lock out legitimate logins (they got 429 → the engine
    // mapped it to 535). Customer-facing routes keep the 100/min limit unchanged.
    allowList: (request) => request.url.startsWith('/api/v1/internal/'),
  });
}

export default fp(rateLimitPlugin, { name: 'rate-limit' });
