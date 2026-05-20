import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createPipeline,
  listPipelines,
  getPipeline,
  updatePipeline,
  deletePipeline,
  seedDefaultPipeline,
} from '../../../services/crm/pipelines.js';

const stageInput = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  probability: z.number().int().min(0).max(100),
  order: z.number().int().min(0),
  color: z.string().optional(),
});

const stageInputNoId = stageInput.omit({ id: true });

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  stages: z.array(stageInputNoId).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  stages: z.array(stageInput).optional(),
});

const pipelineRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/crm/pipelines',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['CRM Pipelines'] },
    },
    async (req, reply) => {
      const body = createSchema.parse(req.body);
      return reply.status(201).send({ data: await createPipeline(req.user!.orgId, body) });
    },
  );

  app.post(
    '/api/v1/crm/pipelines/seed-default',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['CRM Pipelines'] },
    },
    async (req, reply) => {
      return reply.send({ data: await seedDefaultPipeline(req.user!.orgId) });
    },
  );

  app.get(
    '/api/v1/crm/pipelines',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CRM Pipelines'] },
    },
    async (req, reply) => {
      return reply.send({ data: await listPipelines(req.user!.orgId) });
    },
  );

  app.get(
    '/api/v1/crm/pipelines/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CRM Pipelines'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await getPipeline(req.user!.orgId, id) });
    },
  );

  app.patch(
    '/api/v1/crm/pipelines/:id',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['CRM Pipelines'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = updateSchema.parse(req.body);
      return reply.send({ data: await updatePipeline(req.user!.orgId, id, body) });
    },
  );

  app.delete(
    '/api/v1/crm/pipelines/:id',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['CRM Pipelines'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deletePipeline(req.user!.orgId, id);
      return reply.status(204).send();
    },
  );
};

export default pipelineRoutes;
