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
  app.post(
    '/api/v1/internal/suppressions/check-batch',
    {
      schema: { tags: ['Internal'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          orgId: z.string().uuid(),
          emails: z.array(z.string().email()).max(1000),
        })
        .parse(req.body);

      if (body.emails.length === 0) {
        return reply.send({ data: { suppressed: [] } });
      }

      // Lower-case match — suppressions are normalised at insert time but
      // recipients may carry mixed-case addresses from CRM imports.
      const lowered = body.emails.map((e) => e.toLowerCase());

      const rows = await db
        .select({ email: suppressions.email })
        .from(suppressions)
        .where(and(eq(suppressions.orgId, body.orgId), inArray(suppressions.email, lowered)));

      const suppressed = rows.map((r) => r.email).filter((e): e is string => !!e);
      return reply.send({ data: { suppressed } });
    },
  );

  /**
   * POST /api/v1/internal/suppressions
   *
   * The write half, and it had no route. mta-sender calls this the moment the
   * MTA reports a hard bounce (mta-sender.ts, addToSuppressionList) — against a
   * path nothing served. fetch does not reject on 404, so even its
   * console.error never ran.
   *
   * So hard bounces were never suppressed. The contact is marked bounced on the
   * contacts row by a separate call, but the suppression list — the thing the
   * send path actually consults through check-batch above — never learned about
   * the address, and the next campaign tried it again. Repeatedly mailing
   * hard-bounced addresses is how sending reputation is lost.
   *
   * Idempotent: the same address suppressed twice for the same reason is one
   * row, because a bounce can be reported more than once for one message.
   */
  app.post(
    '/api/v1/internal/suppressions',
    {
      schema: { tags: ['Internal'], summary: 'Suppress an address for this org' },
    },
    async (req, reply) => {
      const body = z
        .object({
          orgId: z.string().uuid(),
          email: z.string().email(),
          reason: z.enum([
            'hard_bounce',
            'complaint',
            'manual',
            'unsubscribe',
            'block',
            'invalid_email',
          ]),
        })
        .parse(req.body);

      const email = body.email.toLowerCase();
      const existing = await db
        .select({ id: suppressions.id })
        .from(suppressions)
        .where(
          and(
            eq(suppressions.orgId, body.orgId),
            eq(suppressions.email, email),
            eq(suppressions.reason, body.reason),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        return reply.send({ data: { suppressed: true, created: false } });
      }

      await db.insert(suppressions).values({ orgId: body.orgId, email, reason: body.reason });
      return reply.send({ data: { suppressed: true, created: true } });
    },
  );
};

export default internalSuppressionsRoutes;
