/**
 * Internal newsletter tier batch lookup (called by BullMQ batch-sender worker).
 *
 *  POST /api/v1/internal/newsletter-tiers/batch
 *  Body: { orgId: string, contactIds: string[] }
 *  Returns: { data: Array<{ contactId, tierName }> }
 *
 * Returns only contacts that have an ACTIVE subscription. Missing = no active tier.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { newsletterSubscriptions, newsletterTiers } from '../../../db/schema/index.js';

const bodySchema = z.object({
  orgId: z.string().uuid(),
  contactIds: z.array(z.string().uuid()).max(1000),
});

export default async function internalNewsletterTiersBatchRoutes(app: FastifyInstance) {
  app.post(
    '/api/v1/internal/newsletter-tiers/batch',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      const secret = process.env.INTERNAL_SECRET;
      if (secret && req.headers['x-internal-secret'] !== secret) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const { orgId, contactIds } = bodySchema.parse(req.body);

      if (contactIds.length === 0) {
        return { data: [] };
      }

      const rows = await db
        .select({
          contactId: newsletterSubscriptions.contactId,
          tierName: newsletterTiers.name,
        })
        .from(newsletterSubscriptions)
        .innerJoin(newsletterTiers, eq(newsletterSubscriptions.tierId, newsletterTiers.id))
        .where(
          and(
            eq(newsletterSubscriptions.orgId, orgId),
            inArray(newsletterSubscriptions.contactId, contactIds),
            sql`${newsletterSubscriptions.status} = 'active'`,
          ),
        );

      return { data: rows.map((r) => ({ contactId: r.contactId, tierName: r.tierName })) };
    },
  );
}
