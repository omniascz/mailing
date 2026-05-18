/**
 * Loyalty analytics routes (#240)
 *
 * GET /api/v1/loyalty/programs/:programId/analytics/overview
 * GET /api/v1/loyalty/programs/:programId/analytics/tiers
 * GET /api/v1/loyalty/programs/:programId/analytics/top-earners
 * GET /api/v1/loyalty/programs/:programId/analytics/rewards
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  getProgramStats,
  getTierDistribution,
  getTopEarners,
  getRewardStats,
} from '../../../services/loyalty/analytics.js';

const loyaltyAnalyticsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/loyalty/programs/:programId/analytics/overview', {
    preHandler: [app.authenticate],
    schema: { tags: ['Loyalty'], summary: 'Program stats overview' },
  }, async (req) => {
    const { programId } = z.object({ programId: z.string().uuid() }).parse(req.params);
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    return { data: await getProgramStats(req.user!.orgId, programId, days) };
  });

  app.get('/api/v1/loyalty/programs/:programId/analytics/tiers', {
    preHandler: [app.authenticate],
    schema: { tags: ['Loyalty'], summary: 'Member tier distribution' },
  }, async (req) => {
    const { programId } = z.object({ programId: z.string().uuid() }).parse(req.params);
    return { data: await getTierDistribution(req.user!.orgId, programId) };
  });

  app.get('/api/v1/loyalty/programs/:programId/analytics/top-earners', {
    preHandler: [app.authenticate],
    schema: { tags: ['Loyalty'], summary: 'Top earners leaderboard' },
  }, async (req) => {
    const { programId } = z.object({ programId: z.string().uuid() }).parse(req.params);
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(10) }).parse(req.query);
    return { data: await getTopEarners(req.user!.orgId, programId, limit) };
  });

  app.get('/api/v1/loyalty/programs/:programId/analytics/rewards', {
    preHandler: [app.authenticate],
    schema: { tags: ['Loyalty'], summary: 'Reward redemption stats' },
  }, async (req) => {
    const { programId } = z.object({ programId: z.string().uuid() }).parse(req.params);
    return { data: await getRewardStats(req.user!.orgId, programId) };
  });
};

export default loyaltyAnalyticsRoutes;
