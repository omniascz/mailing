/**
 * Internal tracking-domain resolution — called by batch-sender once per
 * batch to learn the URL prefix for open-pixel + click-redirect links.
 *
 * Resolution:
 *  1. Look up the org's verified sending domain (return_path_verified=true).
 *  2. If found AND mailSubdomain is set → return https://{mailSubdomain}.
 *     The customer's DNS CNAME points this subdomain to our tracking
 *     edge, so the open/click endpoints serve normally but the URL the
 *     recipient sees is on their own brand.
 *  3. Otherwise → return the default TRACKING_BASE_URL.
 *
 * Verification flow (customer-facing wizard, not implemented here):
 *  - Customer adds CNAME: {mailSubdomain} → track.mailforge.io
 *  - GET /api/v1/domains/:id/tracking-cname → DNS lookup verifies
 *  - On success → return_path_verified flips true
 *
 * For this Sprint B.6 we ship the resolution endpoint + worker
 * integration. The CNAME wizard UI lives in Phase UI 3 (UI sprint).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { sendingDomains } from '../../../db/schema/index.js';

const DEFAULT_TRACKING_BASE_URL =
  process.env.TRACKING_BASE_URL ?? 'https://track.mailforge.io';

const internalTrackingDomainRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/internal/tracking-domain', {
    schema: { tags: ['Internal'] },
  }, async (req, reply) => {
    const { orgId } = z.object({
      orgId: z.string().uuid(),
    }).parse(req.query);

    // Pick the first verified domain with a mailSubdomain. An org can have
    // multiple sending domains; we currently use the first verified one as
    // the tracking host. Future Sprint B.6 follow-up could expose
    // per-campaign domain selection.
    const [row] = await db
      .select({
        mailSubdomain: sendingDomains.mailSubdomain,
        returnPathVerified: sendingDomains.returnPathVerified,
      })
      .from(sendingDomains)
      .where(
        and(
          eq(sendingDomains.orgId, orgId),
          eq(sendingDomains.returnPathVerified, true),
        ),
      )
      .limit(1);

    if (row?.mailSubdomain && row.returnPathVerified) {
      return reply.send({
        data: {
          baseUrl: `https://${row.mailSubdomain}`,
          branded: true,
        },
      });
    }

    return reply.send({
      data: {
        baseUrl: DEFAULT_TRACKING_BASE_URL,
        branded: false,
      },
    });
  });
};

export default internalTrackingDomainRoutes;
