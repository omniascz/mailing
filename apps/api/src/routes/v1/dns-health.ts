/**
 * DNS health endpoints (§9 P1).
 *
 *   POST /api/v1/dns-health/recheck     run a re-verification sweep
 *                                       for every domain in the org
 *   GET  /api/v1/dns-health             dashboard summary
 */

import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { sendingDomains } from '../../db/schema/index.js';
import { runDnsHealthForOrg } from '../../services/deliverability/dns-health.js';

const dnsHealthRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/dns-health/recheck',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Deliverability'],
        summary: 'Re-verify every sending domain in the org',
      },
    },
    async (req, reply) => {
      const summary = await runDnsHealthForOrg(req.user!.orgId);
      return reply.send({ data: summary });
    },
  );

  app.get(
    '/api/v1/dns-health',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Deliverability'],
        summary: 'Current authentication posture for every sending domain',
      },
    },
    async (req, reply) => {
      const rows = await db
        .select({
          id: sendingDomains.id,
          domain: sendingDomains.domain,
          isVerified: sendingDomains.isVerified,
          spfVerified: sendingDomains.spfVerified,
          dkimVerified: sendingDomains.dkimVerified,
          dmarcVerified: sendingDomains.dmarcVerified,
          returnPathVerified: sendingDomains.returnPathVerified,
          spfVerifiedAt: sendingDomains.spfVerifiedAt,
          dkimVerifiedAt: sendingDomains.dkimVerifiedAt,
          dmarcVerifiedAt: sendingDomains.dmarcVerifiedAt,
          returnPathVerifiedAt: sendingDomains.returnPathVerifiedAt,
        })
        .from(sendingDomains)
        .where(eq(sendingDomains.orgId, req.user!.orgId));
      return reply.send({ data: rows });
    },
  );
};

export default dnsHealthRoutes;
