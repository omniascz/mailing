/**
 * Internal suppressions batch check — single SQL query returns the subset
 * of recipient emails that are currently suppressed for this org. Replaces
 * 1000 individual `/internal/suppressions/check?email=…` calls.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { suppressions } from '../../../db/schema/index.js';

const internalSuppressionsRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/internal/suppressions/check-batch', {
    schema: { tags: ['Internal'] },
  }, async (req, reply) => {
    const body = z.object({
      orgId: z.string().uuid(),
      emails: z.array(z.string().email()).max(1000),
    }).parse(req.body);

    if (body.emails.length === 0) {
      return reply.send({ data: { suppressed: [] } });
    }

    // Lower-case match — suppressions are normalised at insert time but
    // recipients may carry mixed-case addresses from CRM imports.
    const lowered = body.emails.map((e) => e.toLowerCase());

    const rows = await db
      .select({ email: suppressions.email })
      .from(suppressions)
      .where(
        and(
          eq(suppressions.orgId, body.orgId),
          inArray(suppressions.email, lowered),
        ),
      );

    const suppressed = rows.map((r) => r.email).filter((e): e is string => !!e);
    return reply.send({ data: { suppressed } });
  });
};

export default internalSuppressionsRoutes;
