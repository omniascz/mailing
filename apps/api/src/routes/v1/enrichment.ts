/**
 * Social data enrichment routes (#218)
 *
 *  POST /api/v1/enrichment/social/:contactId  — enrich one contact
 *  POST /api/v1/enrichment/social/bulk        — bulk enrich (async, returns job stats)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { enrichContact, bulkEnrichContacts } from '../../services/enrichment/social.js';

const enrichmentRoutes: FastifyPluginAsync = async (app) => {
  // Single contact enrichment
  app.post(
    '/api/v1/enrichment/social/:contactId',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Enrichment'], summary: 'Enrich a contact with social profile data' },
    },
    async (req) => {
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
      const profile = await enrichContact(req.user!.orgId, contactId);
      return { data: profile };
    },
  );

  // Bulk enrichment
  app.post(
    '/api/v1/enrichment/social/bulk',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Enrichment'], summary: 'Bulk enrich contacts with social profile data' },
    },
    async (req) => {
      const body = z
        .object({
          contactIds: z.array(z.string().uuid()).min(1).max(500),
        })
        .parse(req.body);

      // Run in background (fire-and-forget for large batches)
      const result = await bulkEnrichContacts(req.user!.orgId, body.contactIds);
      return { data: result };
    },
  );
};

export default enrichmentRoutes;
