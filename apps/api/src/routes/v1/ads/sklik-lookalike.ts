/**
 * Sklik lookalike + conversion tracking routes (#636).
 *
 *   POST   /api/v1/ads/sklik/lookalike          — create Sklik lookalike audience
 *   GET    /api/v1/ads/sklik/conversions         — list Sklik conversion goals
 *   POST   /api/v1/ads/sklik/conversions/report  — server-side conversion event
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createSklikLookalike,
  listSklikConversionGoals,
  reportSklikConversion,
} from '../../../services/ads/providers/sklik/lookalike.js';
import { db } from '../../../db/client.js';
import { adAccounts } from '../../../db/schema/index.js';
import { and, eq } from 'drizzle-orm';

const sklikLookalikeRoutes: FastifyPluginAsync = async (app) => {
  const adminAuth = { preHandler: [app.authenticate, app.requireRole('admin', 'owner', 'editor')] };

  // ── Lookalike audience creation ───────────────────────────────────────────

  app.post(
    '/api/v1/ads/sklik/lookalike',
    adminAuth,
    async (req, reply) => {
      const body = z.object({
        adAccountId: z.string().uuid(),
        sourceAudienceId: z.string().min(1),
        name: z.string().min(1).max(64),
        countryCode: z.string().length(2).default('CZ'),
        ratio: z.number().int().min(1).max(10).default(3),
      }).parse(req.body);

      // Load ad account for access token
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(eq(adAccounts.orgId, req.user!.orgId), eq(adAccounts.id, body.adAccountId)))
        .limit(1);

      if (!account) {
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'Ad account not found' });
      }
      if (account.platform !== 'sklik') {
        return reply.code(422).send({ code: 'WRONG_PLATFORM', message: 'Account is not a Sklik account' });
      }

      const result = await createSklikLookalike(
        account.accessToken ?? '',
        body.sourceAudienceId,
        body.name,
        body.countryCode,
        body.ratio,
      );

      return reply.code(201).send({ data: result });
    },
  );

  // ── Conversion goals ──────────────────────────────────────────────────────

  app.get(
    '/api/v1/ads/sklik/conversions',
    adminAuth,
    async (req, reply) => {
      const { adAccountId } = z.object({ adAccountId: z.string().uuid() }).parse(req.query);

      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(eq(adAccounts.orgId, req.user!.orgId), eq(adAccounts.id, adAccountId)))
        .limit(1);

      if (!account) {
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'Ad account not found' });
      }

      const goals = await listSklikConversionGoals(
        account.accessToken ?? '',
        account.platformAccountId,
      );

      return reply.send({ data: goals });
    },
  );

  // ── Conversion event reporting ────────────────────────────────────────────

  app.post(
    '/api/v1/ads/sklik/conversions/report',
    adminAuth,
    async (req, reply) => {
      const body = z.object({
        adAccountId: z.string().uuid(),
        goalId: z.string().min(1),
        orderId: z.string().max(255).optional(),
        value: z.number().nonnegative().optional(),
        currency: z.string().length(3).default('CZK'),
        timestamp: z.string().datetime().optional(),
      }).parse(req.body);

      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(eq(adAccounts.orgId, req.user!.orgId), eq(adAccounts.id, body.adAccountId)))
        .limit(1);

      if (!account) {
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'Ad account not found' });
      }

      await reportSklikConversion(
        account.accessToken ?? '',
        account.platformAccountId,
        {
          goalId: body.goalId,
          orderId: body.orderId,
          value: body.value,
          currency: body.currency,
          timestamp: body.timestamp ? new Date(body.timestamp) : undefined,
        },
      );

      return reply.send({ data: { ok: true } });
    },
  );
};

export default sklikLookalikeRoutes;
