/**
 * Teams routes (#343).
 *
 *   GET    /api/v1/teams                                  — list teams
 *   POST   /api/v1/teams                                  — create
 *   POST   /api/v1/teams/:id/members                      — add member
 *   DELETE /api/v1/teams/:id/members/:userId              — remove member
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createTeam, listTeams, addMember, removeMember } from '../../services/teams/index.js';

const teamRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/teams',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Teams'] },
    },
    async (req, reply) => {
      return reply.send({ data: await listTeams(req.user!.orgId) });
    },
  );

  app.post(
    '/api/v1/teams',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['Teams'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(128),
          slug: z
            .string()
            .min(1)
            .max(128)
            .regex(/^[a-z0-9-]+$/),
          description: z.string().max(500).optional(),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await createTeam(req.user!.orgId, body) });
    },
  );

  app.post(
    '/api/v1/teams/:id/members',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['Teams'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          userId: z.string().uuid(),
          teamRole: z.enum(['member', 'lead']).optional(),
          crossTeamAccess: z.boolean().optional(),
        })
        .parse(req.body);
      await addMember(req.user!.orgId, id, body.userId, {
        teamRole: body.teamRole,
        crossTeamAccess: body.crossTeamAccess,
      });
      return reply.code(204).send();
    },
  );

  app.delete(
    '/api/v1/teams/:id/members/:userId',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['Teams'] },
    },
    async (req, reply) => {
      const { id, userId } = z
        .object({
          id: z.string().uuid(),
          userId: z.string().uuid(),
        })
        .parse(req.params);
      await removeMember(req.user!.orgId, id, userId);
      return reply.code(204).send();
    },
  );
};

export default teamRoutes;
