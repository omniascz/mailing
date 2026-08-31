import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { redis } from '@forgemsg/shared/redis';

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
    keyGenerator: (request) => {
      return (request.headers['x-api-key'] as string) || request.ip;
    },
    // Exempt /api/v1/internal/* from the IP-keyed limit. These are the
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
