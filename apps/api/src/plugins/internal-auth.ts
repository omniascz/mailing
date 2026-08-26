/**
 * Shared-secret guard for /api/v1/internal/*.
 *
 * These routes existed since the worker split and were never authenticated.
 * They are also not network-isolated. This shared secret is the whole of the
 * access control on them: there is no private subnet, no VPN, no mTLS, and no
 * path-level allow-list in front of the process. The API is published at `/`
 * on a public host and `/api/v1/internal/*` is a path under it, reachable by
 * anyone who can reach the app. Verified by running the API and POSTing to
 * /api/v1/internal/contacts/batch with no credentials — it returned contact
 * email, first name and last name for any orgId supplied in the body.
 *
 * That was written when the target was EKS behind an `internet-facing` ALB.
 * The infrastructure has since moved (see infra/PIVOT_AWS_TO_HETZNER.md:
 * Hetzner + Coolify for the API, Caddy terminating TLS, Vercel for the web
 * app), and `infra/k8s` is a leftover of the old plan that no pipeline
 * deploys — CD only builds and pushes images, and infra-plan.yml only runs
 * `terraform plan`. The hosting changed; the exposure did not. A reverse proxy
 * in front of the API could block the prefix at the edge, and none does, so
 * treat this hook as the only thing standing there.
 *
 * Registered as ONE onRequest hook rather than per-route, because per-route
 * guards are exactly what lets the next new internal route ship unprotected.
 * Any path under the prefix is covered the moment it is registered.
 */

import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { secretsMatch } from '../lib/shared-secret.js';
import { env } from '../config/env.js';

export const INTERNAL_SECRET_HEADER = 'x-internal-secret';
const INTERNAL_PREFIX = '/api/v1/internal/';

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
