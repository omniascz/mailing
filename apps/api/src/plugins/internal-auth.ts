/**
 * Shared-secret guard for /api/v1/internal/*.
 *
 * These routes existed since the worker split and were never authenticated.
 * They were also never network-isolated: the Helm chart publishes the API
 * behind an `internet-facing` ALB with `path: /` and `pathType: Prefix`, so
 * every internal route was reachable from the public internet. Verified by
 * running the API and POSTing to /api/v1/internal/contacts/batch with no
 * credentials — it returned contact email, first name and last name for any
 * orgId supplied in the body.
 *
 * Registered as ONE onRequest hook rather than per-route, because per-route
 * guards are exactly what lets the next new internal route ship unprotected.
 * Any path under the prefix is covered the moment it is registered.
 */

import fp from 'fastify-plugin';
import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { env } from '../config/env.js';

export const INTERNAL_SECRET_HEADER = 'x-internal-secret';
const INTERNAL_PREFIX = '/api/v1/internal/';

/**
 * Constant-time compare that does not leak length either.
 *
 * timingSafeEqual throws when the buffers differ in size, and a naive
 * try/catch around it turns "wrong length" into a fast reject — a length
 * oracle. Hashing both sides first makes every comparison run over 32 bytes
 * regardless of what the caller sent.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

const internalAuthPlugin: FastifyPluginAsync = async (app) => {
  const expected = env.INTERNAL_API_SECRET;

  app.addHook('onRequest', async (req, reply) => {
    const url = req.url.split('?')[0] ?? '';
    if (!url.startsWith(INTERNAL_PREFIX)) return;

    // No secret configured at all. In production env.ts refuses to boot
    // without one, so this can only be a dev/test process that opted out —
    // fail closed anyway rather than silently reopening the hole.
    if (!expected) {
      req.log.error('[internal-auth] INTERNAL_API_SECRET is not set — refusing internal request');
      return reply.code(401).send({
        code: 'UNAUTHORIZED',
        message: 'Internal API is not configured',
        statusCode: 401,
      });
    }

    const header = req.headers[INTERNAL_SECRET_HEADER];
    const provided = Array.isArray(header) ? header[0] : header;

    if (!provided || !secretsMatch(provided, expected)) {
      req.log.warn(
        { path: url, ip: req.ip },
        '[internal-auth] rejected internal request with missing or invalid secret',
      );
      return reply.code(401).send({
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
        statusCode: 401,
      });
    }
  });
};

export default fp(internalAuthPlugin, { name: 'internal-auth' });
