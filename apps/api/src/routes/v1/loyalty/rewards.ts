/**
 * Loyalty rewards routes (#237)
 *
 * GET    /api/v1/loyalty/programs/:programId/rewards
 * POST   /api/v1/loyalty/programs/:programId/rewards
 * PATCH  /api/v1/loyalty/programs/:programId/rewards/:rewardId
 * DELETE /api/v1/loyalty/programs/:programId/rewards/:rewardId
 *
 * POST   /api/v1/loyalty/programs/:programId/members/:memberId/redeem
 * GET    /api/v1/loyalty/programs/:programId/members/:memberId/redemptions
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createReward,
  updateReward,
  deleteReward,
  listRewards,
  redeemReward,
  listRedemptions,
} from '../../../services/loyalty/rewards.js';

const loyaltyRewardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/loyalty/programs/:programId/rewards', {
    preHandler: [app.authenticate],
    schema: { tags: ['Loyalty'], summary: 'List rewards catalog' },
  }, async (req) => {
    const { programId } = z.object({ programId: z.string().uuid() }).parse(req.params);
    const { activeOnly } = z.object({ activeOnly: z.coerce.boolean().default(false) }).parse(req.query);
    return { data: await listRewards(req.user!.orgId, programId, { activeOnly }) };
  });

  app.post('/api/v1/loyalty/programs/:programId/rewards', {
    preHandler: [app.authenticate],
    schema: { tags: ['Loyalty'], summary: 'Create a reward' },
  }, async (req, reply) => {
    const { programId } = z.object({ programId: z.string().uuid() }).parse(req.params);
    const body = z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      type: z.enum(['discount_pct', 'discount_fixed', 'free_product', 'voucher', 'experience']),
      pointCost: z.number().int().min(1),
      config: z.record(z.unknown()).default({}),
      requiredTierIds: z.array(z.string()).default([]),
      maxRedemptions: z.number().int().min(1).optional(),
      maxPerMember: z.number().int().min(1).optional(),
      startsAt: z.string().datetime().optional().transform((v) => v ? new Date(v) : undefined),
      endsAt: z.string().datetime().optional().transform((v) => v ? new Date(v) : undefined),
    }).parse(req.body);
    const reward = await createReward(req.user!.orgId, programId, body);
    return reply.status(201).send({ data: reward });
  });

  app.patch('/api/v1/loyalty/programs/:programId/rewards/:rewardId', {
    preHandler: [app.authenticate],
    schema: { tags: ['Loyalty'], summary: 'Update a reward' },
  }, async (req) => {
    const { rewardId } = z.object({
      programId: z.string().uuid(), rewardId: z.string().uuid(),
    }).parse(req.params);
    const body = z.object({
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      pointCost: z.number().int().min(1).optional(),
      config: z.record(z.unknown()).optional(),
      requiredTierIds: z.array(z.string()).optional(),
      maxRedemptions: z.number().int().min(1).optional(),
      maxPerMember: z.number().int().min(1).optional(),
      active: z.boolean().optional(),
      startsAt: z.string().datetime().optional().transform((v) => v ? new Date(v) : undefined),
      endsAt: z.string().datetime().optional().transform((v) => v ? new Date(v) : undefined),
    }).parse(req.body);
    return { data: await updateReward(req.user!.orgId, rewardId, body) };
  });

  app.delete('/api/v1/loyalty/programs/:programId/rewards/:rewardId', {
    preHandler: [app.authenticate],
    schema: { tags: ['Loyalty'], summary: 'Delete a reward' },
  }, async (req, reply) => {
    const { rewardId } = z.object({
      programId: z.string().uuid(), rewardId: z.string().uuid(),
    }).parse(req.params);
    await deleteReward(req.user!.orgId, rewardId);
    return reply.status(204).send();
  });

  // ── Redemption ─────────────────────────────────────────────────────────────

  app.post('/api/v1/loyalty/programs/:programId/members/:memberId/redeem', {
    preHandler: [app.authenticate],
    schema: { tags: ['Loyalty'], summary: 'Redeem a reward' },
  }, async (req, reply) => {
    const { memberId } = z.object({
      programId: z.string().uuid(), memberId: z.string().uuid(),
    }).parse(req.params);
    const { rewardId } = z.object({ rewardId: z.string().uuid() }).parse(req.body);
    const result = await redeemReward(req.user!.orgId, memberId, rewardId);
    if (!result.success) {
      return reply.status(422).send({ code: 'REDEEM_FAILED', message: result.reason });
    }
    return { data: result };
  });

  app.get('/api/v1/loyalty/programs/:programId/members/:memberId/redemptions', {
    preHandler: [app.authenticate],
    schema: { tags: ['Loyalty'], summary: 'List member redemptions' },
  }, async (req) => {
    const { memberId } = z.object({
      programId: z.string().uuid(), memberId: z.string().uuid(),
    }).parse(req.params);
    const q = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      cursor: z.string().optional(),
    }).parse(req.query);
    return listRedemptions(req.user!.orgId, memberId, q);
  });
};

export default loyaltyRewardRoutes;
