/**
 * Internal audience-resolution endpoint — called by the campaign-splitter
 * worker when a scheduled campaign fires. Returns the contact-ID list
 * after applying whichever audience strategy the campaign uses (legacy
 * list+segment OR Sprint E.1 non-opener resend).
 *
 * Worker hits one endpoint regardless of strategy; resolveAudience() in
 * the service picks the branch.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { resolveAudience } from '../../../services/campaigns/auto-resend.js';

const internalAudienceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/internal/audience', {
    schema: { tags: ['Internal'] },
  }, async (req, reply) => {
    const { orgId, campaignId } = z.object({
      orgId: z.string().uuid(),
      campaignId: z.string().uuid(),
    }).parse(req.query);

    const contactIds = await resolveAudience(orgId, campaignId);
    return reply.send({ data: { contactIds } });
  });
};

export default internalAudienceRoutes;
