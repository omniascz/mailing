/**
 * Frequency suppression read endpoints (§9 P1 cross-channel cap).
 *
 *   GET /api/v1/frequency-suppressions          recent list
 *   GET /api/v1/frequency-suppressions/summary  counts by reason + channel
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { frequencySuppressions } from '../../db/schema/index.js';

const frequencySuppressionsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/frequency-suppressions',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['FrequencyCapping'],
        summary: 'Recent suppressions for the org',
      },
    },
    async (req, reply) => {
      const q = z
        .object({
          limit: z.coerce.number().int().min(1).max(500).optional(),
          contactId: z.string().uuid().optional(),
          reason: z.enum(['cap_exceeded', 'quiet_hours', 'band_locked']).optional(),
          sinceDays: z.coerce.number().int().min(1).max(365).optional(),
        })
        .parse(req.query);

      const conds = [eq(frequencySuppressions.orgId, req.user!.orgId)];
      if (q.contactId) conds.push(eq(frequencySuppressions.contactId, q.contactId));
      if (q.reason) conds.push(eq(frequencySuppressions.reason, q.reason));
      if (q.sinceDays) {
        const since = new Date(Date.now() - q.sinceDays * 86_400_000);
        conds.push(gte(frequencySuppressions.suppressedAt, since));
      }
      const rows = await db
        .select()
        .from(frequencySuppressions)
        .where(and(...conds))
        .orderBy(desc(frequencySuppressions.suppressedAt))
        .limit(q.limit ?? 50);
      return reply.send({ data: rows });
    },
  );

  app.get(
    '/api/v1/frequency-suppressions/summary',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['FrequencyCapping'],
        summary: 'Suppression counts grouped by reason + channel',
      },
    },
    async (req, reply) => {
      const q = z
        .object({
          sinceDays: z.coerce.number().int().min(1).max(365).optional(),
        })
        .parse(req.query);

      const since = new Date(Date.now() - (q.sinceDays ?? 7) * 86_400_000);
      const rows = (await db.execute<{ reason: string; channel: string; count: string }>(sql`
        SELECT reason, channel, COUNT(*)::text AS count
        FROM frequency_suppressions
        WHERE org_id = ${req.user!.orgId}::uuid
          AND suppressed_at >= ${since.toISOString()}
        GROUP BY reason, channel
        ORDER BY count DESC
      `)) as unknown as Array<{ reason: string; channel: string; count: string }>;

      return reply.send({
        data: rows.map((r) => ({
          reason: r.reason,
          channel: r.channel,
          count: Number(r.count),
        })),
      });
    },
  );
};

export default frequencySuppressionsRoutes;
