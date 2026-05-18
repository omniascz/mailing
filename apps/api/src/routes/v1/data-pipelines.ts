/**
 * Data pipelines routes (#357).
 *
 *   GET    /api/v1/data-pipelines           — list
 *   POST   /api/v1/data-pipelines           — create (admin)
 *   DELETE /api/v1/data-pipelines/:id       — admin
 *   POST   /api/v1/data-pipelines/dry-run   — run ad-hoc steps against a row sample
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createPipeline, listPipelines, deletePipeline,
} from '../../services/data-ops/index.js';
import { runPipeline } from '../../services/data-ops/pipeline.js';

const sourceEnum = z.enum(['contacts', 'email_events', 'deals', 'orders', 'cdp_events']);

const dataPipelineRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/data-pipelines', {
    preHandler: [app.authenticate],
    schema: { tags: ['DataPipelines'] },
  }, async (req, reply) => {
    return reply.send({ data: await listPipelines(req.user!.orgId) });
  });

  app.post('/api/v1/data-pipelines', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['DataPipelines'] },
  }, async (req, reply) => {
    const body = z.object({
      name: z.string().min(1).max(128),
      description: z.string().max(500).optional(),
      source: sourceEnum,
      steps: z.array(z.any()),
      trigger: z.enum(['manual', 'scheduled', 'event']).optional(),
      schedule: z.string().max(64).optional(),
      sinkWebhookUrl: z.string().url().optional(),
    }).parse(req.body);
    return reply.code(201).send({
      data: await createPipeline(req.user!.orgId, {
        ...body,
        steps: body.steps as never,
      }),
    });
  });

  app.delete('/api/v1/data-pipelines/:id', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['DataPipelines'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await deletePipeline(req.user!.orgId, id);
    return reply.code(204).send();
  });

  app.post('/api/v1/data-pipelines/dry-run', {
    preHandler: [app.authenticate],
    schema: { tags: ['DataPipelines'] },
  }, async (req, reply) => {
    const body = z.object({
      rows: z.array(z.record(z.unknown())),
      steps: z.array(z.any()),
    }).parse(req.body);
    const result = await runPipeline({
      rows: body.rows,
      steps: body.steps as never,
    });
    return reply.send({ data: result });
  });
};

export default dataPipelineRoutes;
