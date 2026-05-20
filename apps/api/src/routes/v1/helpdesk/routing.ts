/**
 * Chat routing & assignment routes (#245)
 *
 *  GET    /api/v1/helpdesk/agents                    — list agent availability
 *  PATCH  /api/v1/helpdesk/agents/me/status          — update my status
 *  PATCH  /api/v1/helpdesk/agents/me/profile         — update skills / channels
 *  POST   /api/v1/helpdesk/tickets/:id/assign        — manual assign
 *  POST   /api/v1/helpdesk/tickets/:id/auto-assign   — trigger auto-assignment
 *
 *  GET    /api/v1/helpdesk/routing-rules             — list routing rules
 *  POST   /api/v1/helpdesk/routing-rules             — create rule
 *  PATCH  /api/v1/helpdesk/routing-rules/:id         — update rule
 *  DELETE /api/v1/helpdesk/routing-rules/:id         — delete rule
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  setAgentStatus,
  updateAgentProfile,
  listAgentAvailability,
  createRoutingRule,
  listRoutingRules,
  updateRoutingRule,
  deleteRoutingRule,
  autoAssignTicket,
  manualAssignTicket,
} from '../../../services/helpdesk/routing.js';

const helpdeskRoutingRoutes: FastifyPluginAsync = async (app) => {
  // ── Agent availability ──────────────────────────────────────────────────────

  app.get(
    '/api/v1/helpdesk/agents',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      return reply.send({ data: await listAgentAvailability(req.user!.orgId) });
    },
  );

  app.patch(
    '/api/v1/helpdesk/agents/me/status',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const { status } = z
        .object({
          status: z.enum(['online', 'away', 'busy', 'offline']),
        })
        .parse(req.body);
      return reply.send({ data: await setAgentStatus(req.user!.orgId, req.user!.userId, status) });
    },
  );

  app.patch(
    '/api/v1/helpdesk/agents/me/profile',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          maxConcurrent: z.number().int().min(0).max(100).optional(),
          skills: z.array(z.string().max(64)).optional(),
          channels: z.array(z.string().max(64)).optional(),
        })
        .parse(req.body);
      return reply.send({
        data: await updateAgentProfile(req.user!.orgId, req.user!.userId, body),
      });
    },
  );

  // ── Ticket assignment ───────────────────────────────────────────────────────

  app.post(
    '/api/v1/helpdesk/tickets/:id/assign',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { agentId } = z.object({ agentId: z.string().uuid() }).parse(req.body);
      await manualAssignTicket(req.user!.orgId, id, agentId, req.user!.userId);
      return reply.send({ data: { assigned: true } });
    },
  );

  app.post(
    '/api/v1/helpdesk/tickets/:id/auto-assign',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = z
        .object({
          channel: z.string().max(64).optional(),
          requiredSkills: z.array(z.string()).optional(),
        })
        .parse(req.body ?? {});
      const result = await autoAssignTicket(
        req.user!.orgId,
        id,
        body.channel ?? 'chat',
        body.requiredSkills,
      );
      return reply.send({ data: result });
    },
  );

  // ── Routing rules ───────────────────────────────────────────────────────────

  app.get(
    '/api/v1/helpdesk/routing-rules',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      return reply.send({ data: await listRoutingRules(req.user!.orgId) });
    },
  );

  app.post(
    '/api/v1/helpdesk/routing-rules',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(255),
          channel: z.string().max(64).optional(),
          strategy: z.enum(['round-robin', 'least-loaded', 'skill-based', 'manual']),
          requiredSkill: z.string().max(128).optional(),
          agentIds: z.array(z.string().uuid()).optional(),
          priority: z.number().int().min(1).max(10).optional(),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await createRoutingRule(req.user!.orgId, body) });
    },
  );

  app.patch(
    '/api/v1/helpdesk/routing-rules/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = z
        .object({
          name: z.string().max(255).optional(),
          channel: z.string().max(64).optional(),
          strategy: z.enum(['round-robin', 'least-loaded', 'skill-based', 'manual']).optional(),
          requiredSkill: z.string().max(128).nullable().optional(),
          agentIds: z.array(z.string().uuid()).optional(),
          priority: z.number().int().min(1).max(10).optional(),
          isActive: z.boolean().optional(),
        })
        .parse(req.body);
      return reply.send({
        data: await updateRoutingRule(
          req.user!.orgId,
          id,
          body as Parameters<typeof updateRoutingRule>[2],
        ),
      });
    },
  );

  app.delete(
    '/api/v1/helpdesk/routing-rules/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await deleteRoutingRule(req.user!.orgId, id);
      return reply.send({ data: { deleted: true } });
    },
  );
};

export default helpdeskRoutingRoutes;
