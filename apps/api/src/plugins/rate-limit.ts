import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

async function rateLimitPlugin(app: FastifyInstance) {
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
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
