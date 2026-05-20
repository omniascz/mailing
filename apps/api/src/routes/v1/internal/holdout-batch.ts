/**
 * Internal holdout batch check — single SQL query returns the subset of
 * contact IDs currently held out (i.e. in an active holdout group). One
 * round-trip instead of N. Complements /internal/holdout/check for
 * single-contact callers (which workers no longer uses).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { holdoutGroups, holdoutGroupMembers } from '../../../db/schema/index.js';

const internalHoldoutBatchRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/internal/holdout/check-batch',
    {
      schema: { tags: ['Internal'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          orgId: z.string().uuid(),
          contactIds: z.array(z.string().uuid()).max(1000),
        })
        .parse(req.body);

      if (body.contactIds.length === 0) {
        return reply.send({ data: { heldOut: [] } });
      }

      const rows = await db
        .selectDistinct({ contactId: holdoutGroupMembers.contactId })
        .from(holdoutGroupMembers)
        .innerJoin(holdoutGroups, eq(holdoutGroups.id, holdoutGroupMembers.groupId))
        .where(
          and(
            eq(holdoutGroups.orgId, body.orgId),
            eq(holdoutGroups.active, true),
            inArray(holdoutGroupMembers.contactId, body.contactIds),
          ),
        );

      const heldOut = rows.map((r) => r.contactId);
      return reply.send({ data: { heldOut } });
    },
  );
};

export default internalHoldoutBatchRoutes;
