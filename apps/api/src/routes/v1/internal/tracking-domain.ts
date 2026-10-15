/**
 * Internal tracking-domain resolution — called by batch-sender once per
 * batch to learn the URL prefix for open-pixel + click-redirect links.
 *
 * Resolution (services/sending/tracking-base-url.ts):
 *  1. Look up the org's verified sending domain (return_path_verified=true).
 *  2. If found AND mailSubdomain is set → return https://{mailSubdomain}.
 *     The customer's DNS CNAME points this subdomain to our tracking
 *     edge, so the open/click endpoints serve normally but the URL the
 *     recipient sees is on their own brand.
 *  3. Otherwise → return the default TRACKING_BASE_URL.
 *
 * Verification flow (customer-facing wizard, not implemented here):
 *  - Customer adds CNAME: {mailSubdomain} → track.example.invalid
 *  - GET /api/v1/domains/:id/tracking-cname → DNS lookup verifies
 *  - On success → return_path_verified flips true
 *
 * For this Sprint B.6 we ship the resolution endpoint + worker
 * integration. The CNAME wizard UI lives in Phase UI 3 (UI sprint).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { resolveTrackingBaseUrl } from '../../../services/sending/tracking-base-url.js';

const internalTrackingDomainRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/internal/tracking-domain',
    {
      schema: { tags: ['Internal'] },
    },
    async (req, reply) => {
      const { orgId } = z
        .object({
          orgId: z.string().uuid(),
        })
        .parse(req.query);

      // The resolution lives in services/sending/tracking-base-url.ts so the
      // inline flow e-mail, which builds its unsubscribe URL in the API, uses
      // the same host as batch-sender does through this route (Z157).
      return reply.send({ data: await resolveTrackingBaseUrl(orgId) });
    },
  );
};

export default internalTrackingDomainRoutes;
