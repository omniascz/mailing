/**
 * Sandboxes routes (#342).
 *
 *   POST   /api/v1/sandboxes                — create a sandbox of current org
 *   GET    /api/v1/sandboxes                — list current org's sandboxes
 *   GET    /api/v1/sandboxes/:id            — sandbox details
 *   PATCH  /api/v1/sandboxes/:id/no-op      — flip no-op mode
 *   DELETE /api/v1/sandboxes/:id            — archive sandbox
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createSandbox,
  listSandboxes,
  getSandbox,
  deleteSandbox,
  setNoOpMode,
} from '../../services/sandboxes/index.js';

const sandboxRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/sandboxes',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Sandboxes'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(128),
          purpose: z.enum(['dev', 'staging', 'training', 'demo']).optional(),
          noOpMode: z.boolean().optional(),
          expiresAt: z.coerce.date().optional(),
          seedConfig: z
            .object({
              seedContacts: z.number().int().min(0).max(10_000).optional(),
              copyTemplates: z.boolean().optional(),
              copyWorkflows: z.boolean().optional(),
              copyBrandKit: z.boolean().optional(),
              copySavedBlocks: z.boolean().optional(),
            })
            .optional(),
        })
        .parse(req.body);

      const result = await createSandbox(req.user!.orgId, {
        ...body,
        createdBy: req.user!.userId,
      });
      return reply.code(201).send({ data: result });
    },
  );

  app.get(
    '/api/v1/sandboxes',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Sandboxes'] },
    },
    async (req, reply) => {
      return reply.send({ data: await listSandboxes(req.user!.orgId) });
    },
  );

  app.get(
    '/api/v1/sandboxes/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Sandboxes'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await getSandbox(req.user!.orgId, id) });
    },
  );

  app.patch(
    '/api/v1/sandboxes/:id/no-op',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Sandboxes'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z.object({ noOpMode: z.boolean() }).parse(req.body);
      await setNoOpMode(req.user!.orgId, id, body.noOpMode);
      return reply.send({ data: { ok: true } });
    },
  );

  app.delete(
    '/api/v1/sandboxes/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Sandboxes'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteSandbox(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );
};

export default sandboxRoutes;
