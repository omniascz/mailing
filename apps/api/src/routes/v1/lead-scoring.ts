/**
 * Lead scoring API routes (task 5.10).
 *
 * GET    /lead-scoring/rules              — list rules for org
 * POST   /lead-scoring/rules              — create rule
 * PUT    /lead-scoring/rules/:id          — update rule
 * DELETE /lead-scoring/rules/:id          — delete rule
 * POST   /lead-scoring/rules/seed-defaults — seed default rules
 * POST   /lead-scoring/apply              — manually apply score event
 * POST   /lead-scoring/decay              — run decay job (admin/cron)
 * GET    /lead-scoring/contacts/:id/history — score event history
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listLeadScoreRules,
  createLeadScoreRule,
  updateLeadScoreRule,
  deleteLeadScoreRule,
  applyLeadScore,
  decayScores,
  seedDefaultRules,
  getContactLeadScoreHistory,
} from '../../services/lead-scoring/index.js';

const leadScoringRoutes: FastifyPluginAsync = async (app) => {
  const prefix = '/api/v1/lead-scoring';

  // ── List rules ──────────────────────────────────────────────────────────────
  app.get(
    `${prefix}/rules`,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['lead-scoring'],
        summary: 'List lead score rules for the organization',
      },
    },
    async (req, reply) => {
      const orgId = (req.user as { orgId: string }).orgId;
      const rules = await listLeadScoreRules(orgId);
      return reply.send({ data: rules });
    },
  );

  // ── Create rule ─────────────────────────────────────────────────────────────
  const createRuleSchema = z.object({
    eventType: z.string().min(1).max(100),
    points: z.number().int(),
    decayDays: z.number().int().min(1).max(3650).optional(),
    description: z.string().max(255).optional(),
  });

  app.post(
    `${prefix}/rules`,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['lead-scoring'],
        summary: 'Create a lead score rule',
      },
    },
    async (req, reply) => {
      const orgId = (req.user as { orgId: string }).orgId;
      const body = createRuleSchema.parse(req.body);
      const rule = await createLeadScoreRule(orgId, body);
      return reply.status(201).send({ data: rule });
    },
  );

  // ── Update rule ─────────────────────────────────────────────────────────────
  const updateRuleSchema = z.object({
    points: z.number().int().optional(),
    decayDays: z.number().int().min(1).max(3650).optional(),
    active: z.boolean().optional(),
    description: z.string().max(255).optional(),
  });

  app.put(
    `${prefix}/rules/:id`,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['lead-scoring'],
        summary: 'Update a lead score rule',
      },
    },
    async (req, reply) => {
      const orgId = (req.user as { orgId: string }).orgId;
      const { id } = req.params as { id: string };
      const body = updateRuleSchema.parse(req.body);
      const rule = await updateLeadScoreRule(id, orgId, body);
      return reply.send({ data: rule });
    },
  );

  // ── Delete rule ─────────────────────────────────────────────────────────────
  app.delete(
    `${prefix}/rules/:id`,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['lead-scoring'],
        summary: 'Delete a lead score rule',
      },
    },
    async (req, reply) => {
      const orgId = (req.user as { orgId: string }).orgId;
      const { id } = req.params as { id: string };
      await deleteLeadScoreRule(id, orgId);
      return reply.status(204).send();
    },
  );

  // ── Seed default rules ──────────────────────────────────────────────────────
  app.post(
    `${prefix}/rules/seed-defaults`,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['lead-scoring'],
        summary: 'Seed default lead score rules (idempotent)',
      },
    },
    async (req, reply) => {
      const orgId = (req.user as { orgId: string }).orgId;
      await seedDefaultRules(orgId);
      const rules = await listLeadScoreRules(orgId);
      return reply.send({ data: rules, message: 'Default rules seeded' });
    },
  );

  // ── Apply score event ───────────────────────────────────────────────────────
  const applySchema = z.object({
    contactId: z.string().uuid(),
    eventType: z.string().min(1).max(100),
    metadata: z.record(z.unknown()).optional(),
  });

  app.post(
    `${prefix}/apply`,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['lead-scoring'],
        summary: 'Manually apply a lead score event to a contact',
      },
    },
    async (req, reply) => {
      const orgId = (req.user as { orgId: string }).orgId;
      const { contactId, eventType, metadata } = applySchema.parse(req.body);
      const result = await applyLeadScore(contactId, orgId, eventType, metadata);
      if (!result) {
        return reply.status(422).send({
          code: 'NO_RULE',
          message: `No active lead score rule for event type '${eventType}'`,
        });
      }
      return reply.send({ data: result });
    },
  );

  // ── Decay scores (cron / admin) ─────────────────────────────────────────────
  app.post(
    `${prefix}/decay`,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['lead-scoring'],
        summary: 'Run score decay job for the organization (idempotent)',
      },
    },
    async (req, reply) => {
      const orgId = (req.user as { orgId: string }).orgId;
      const result = await decayScores(orgId);
      return reply.send({ data: result });
    },
  );

  // ── Contact score history ───────────────────────────────────────────────────
  app.get(
    `${prefix}/contacts/:id/history`,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['lead-scoring'],
        summary: 'Get lead score event history for a contact',
      },
    },
    async (req, reply) => {
      const orgId = (req.user as { orgId: string }).orgId;
      const { id } = req.params as { id: string };
      const { limit } = req.query as { limit?: string };
      const events = await getContactLeadScoreHistory(id, orgId, limit ? Number(limit) : 50);
      return reply.send({ data: events });
    },
  );
};

export default leadScoringRoutes;
