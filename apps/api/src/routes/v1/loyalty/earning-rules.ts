/**
 * Loyalty earning rules routes (#238)
 *
 * GET    /api/v1/loyalty/programs/:programId/earning-rules
 * POST   /api/v1/loyalty/programs/:programId/earning-rules
 * PATCH  /api/v1/loyalty/programs/:programId/earning-rules/:ruleId
 * DELETE /api/v1/loyalty/programs/:programId/earning-rules/:ruleId
 *
 * POST   /api/v1/loyalty/programs/:programId/earn   — trigger earn event manually
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createEarningRule,
  updateEarningRule,
  deleteEarningRule,
  listEarningRules,
  processEarnEvent,
} from '../../../services/loyalty/earning-rules.js';

const loyaltyEarningRuleRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/loyalty/programs/:programId/earning-rules',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Loyalty'], summary: 'List earning rules' },
    },
    async (req) => {
      const { programId } = z.object({ programId: z.string().uuid() }).parse(req.params);
      return { data: await listEarningRules(req.user!.orgId, programId) };
    },
  );

  app.post(
    '/api/v1/loyalty/programs/:programId/earning-rules',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Loyalty'], summary: 'Create an earning rule' },
    },
    async (req, reply) => {
      const { programId } = z.object({ programId: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          name: z.string().min(1).max(255),
          description: z.string().optional(),
          eventType: z.enum([
            'purchase',
            'signup',
            'birthday',
            'referral',
            'review',
            'social_share',
            'profile_complete',
            'custom_event',
          ]),
          customEventName: z.string().max(255).optional(),
          pointsFixed: z.number().int().min(0).optional(),
          pointsPerCurrency: z.string().optional(),
          currencyField: z.string().max(100).optional(),
          maxPointsPerEvent: z.number().int().min(1).optional(),
          maxLifetimePoints: z.number().int().min(1).optional(),
          maxPointsPerPeriod: z.number().int().min(1).optional(),
          periodDays: z.number().int().min(1).optional(),
          conditions: z.record(z.unknown()).optional(),
          startsAt: z
            .string()
            .datetime()
            .optional()
            .transform((v) => (v ? new Date(v) : undefined)),
          endsAt: z
            .string()
            .datetime()
            .optional()
            .transform((v) => (v ? new Date(v) : undefined)),
        })
        .parse(req.body);
      const rule = await createEarningRule(req.user!.orgId, programId, body);
      return reply.status(201).send({ data: rule });
    },
  );

  app.patch(
    '/api/v1/loyalty/programs/:programId/earning-rules/:ruleId',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Loyalty'], summary: 'Update an earning rule' },
    },
    async (req) => {
      const { ruleId } = z
        .object({
          programId: z.string().uuid(),
          ruleId: z.string().uuid(),
        })
        .parse(req.params);
      const body = z
        .object({
          name: z.string().min(1).max(255).optional(),
          description: z.string().optional(),
          active: z.boolean().optional(),
          pointsFixed: z.number().int().min(0).optional(),
          pointsPerCurrency: z.string().optional(),
          maxPointsPerEvent: z.number().int().min(1).optional(),
          startsAt: z
            .string()
            .datetime()
            .optional()
            .transform((v) => (v ? new Date(v) : undefined)),
          endsAt: z
            .string()
            .datetime()
            .optional()
            .transform((v) => (v ? new Date(v) : undefined)),
        })
        .parse(req.body);
      return { data: await updateEarningRule(req.user!.orgId, ruleId, body) };
    },
  );

  app.delete(
    '/api/v1/loyalty/programs/:programId/earning-rules/:ruleId',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Loyalty'], summary: 'Delete an earning rule' },
    },
    async (req, reply) => {
      const { ruleId } = z
        .object({
          programId: z.string().uuid(),
          ruleId: z.string().uuid(),
        })
        .parse(req.params);
      await deleteEarningRule(req.user!.orgId, ruleId);
      return reply.status(204).send();
    },
  );

  // ── Manual earn event ──────────────────────────────────────────────────────

  app.post(
    '/api/v1/loyalty/programs/:programId/earn',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Loyalty'], summary: 'Trigger earn event for a contact' },
    },
    async (req, reply) => {
      const { programId } = z.object({ programId: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          contactId: z.string().uuid(),
          eventType: z.enum([
            'purchase',
            'signup',
            'birthday',
            'referral',
            'review',
            'social_share',
            'profile_complete',
            'custom_event',
          ]),
          customEventName: z.string().optional(),
          properties: z.record(z.unknown()).default({}),
        })
        .parse(req.body);

      const result = await processEarnEvent(req.user!.orgId, programId, body.contactId, {
        eventType: body.eventType,
        customEventName: body.customEventName,
        properties: body.properties,
      });

      if (!result) {
        return reply.status(200).send({ data: { pointsEarned: 0, message: 'No matching rules' } });
      }
      return { data: result };
    },
  );
};

export default loyaltyEarningRuleRoutes;
