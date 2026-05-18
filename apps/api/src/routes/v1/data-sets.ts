/**
 * Data Sets routes (#356/L4-5).
 *
 *   GET    /api/v1/data-sets                — list
 *   POST   /api/v1/data-sets                — create
 *   GET    /api/v1/data-sets/:id            — get
 *   PATCH  /api/v1/data-sets/:id            — update
 *   DELETE /api/v1/data-sets/:id            — soft-delete
 *   POST   /api/v1/data-sets/:id/run        — bind params + return SQL (caller executes)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createDataSet,
  listDataSets,
  getDataSet,
  updateDataSet,
  deleteDataSet,
  prepareQuery,
} from '../../services/data-sets/index.js';

// Safety allowlist — mirror the NL-query sandbox. Keep in sync!
const ALLOWED_TABLES: readonly string[] = [
  'contacts',
  'email_events',
  'campaigns',
  'lists',
  'contact_lists',
  'tags',
  'contact_tags',
  'ecommerce_orders',
  'workflow_runs',
  'workflows',
  'deals',
  'accounts',
];

const paramSpecSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(['string', 'number', 'date']),
  required: z.boolean().optional(),
  defaultValue: z.unknown().optional(),
});

const columnSpecSchema = z.object({
  name: z.string().min(1).max(128),
  kind: z.enum(['string', 'number', 'date', 'boolean']),
});

const dataSetRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/data-sets', {
    preHandler: [app.authenticate],
    schema: { tags: ['Data Hub'], summary: 'List data sets' },
  }, async (req) => ({ data: await listDataSets(req.user!.orgId) }));

  app.get('/api/v1/data-sets/:id', {
    preHandler: [app.authenticate],
    schema: { tags: ['Data Hub'], summary: 'Get a data set' },
  }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return { data: await getDataSet(req.user!.orgId, id) };
  });

  app.post('/api/v1/data-sets', {
    preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
    schema: { tags: ['Data Hub'], summary: 'Create a data set' },
  }, async (req, reply) => {
    const body = z.object({
      name: z.string().min(1).max(255),
      description: z.string().max(2048).optional(),
      kind: z.enum(['sql', 'segment', 'aggregate']).optional(),
      parameters: z.array(paramSpecSchema),
      definition: z.string().min(1).max(16_384),
      columns: z.array(columnSpecSchema).optional(),
      cacheTtlSeconds: z.number().int().min(0).max(86_400).optional(),
      tags: z.array(z.string().max(64)).optional(),
    }).parse(req.body);

    const row = await createDataSet(
      req.user!.orgId,
      req.user!.userId,
      body,
      ALLOWED_TABLES,
    );
    return reply.code(201).send({ data: row });
  });

  app.patch('/api/v1/data-sets/:id', {
    preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
    schema: { tags: ['Data Hub'], summary: 'Update a data set' },
  }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({
      name: z.string().min(1).max(255).optional(),
      description: z.string().max(2048).optional(),
      parameters: z.array(paramSpecSchema).optional(),
      definition: z.string().min(1).max(16_384).optional(),
      columns: z.array(columnSpecSchema).optional(),
      cacheTtlSeconds: z.number().int().min(0).max(86_400).optional(),
      tags: z.array(z.string().max(64)).optional(),
    }).parse(req.body);
    return { data: await updateDataSet(req.user!.orgId, id, body, ALLOWED_TABLES) };
  });

  app.delete('/api/v1/data-sets/:id', {
    preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
    schema: { tags: ['Data Hub'], summary: 'Delete a data set' },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await deleteDataSet(req.user!.orgId, id);
    return reply.code(204).send();
  });

  app.post('/api/v1/data-sets/:id/prepare', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Data Hub'],
      summary: 'Bind params + return the prepared SQL (runner executes)',
    },
  }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { params } = z.object({ params: z.record(z.unknown()).default({}) }).parse(req.body);
    return { data: await prepareQuery(req.user!.orgId, id, params, ALLOWED_TABLES) };
  });
};

export default dataSetRoutes;
