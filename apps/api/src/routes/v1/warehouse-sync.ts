import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createWarehouseSync,
  listWarehouseSyncs,
  deleteWarehouseSync,
  runSync,
} from '../../services/warehouse-sync/index.js';

const warehouseSyncRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/warehouse-syncs',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Warehouse'] },
    },
    async (req, reply) => {
      return reply.send({ data: await listWarehouseSyncs(req.user!.orgId) });
    },
  );

  app.post(
    '/api/v1/warehouse-syncs',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Warehouse'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(255),
          destination: z.enum(['s3', 'snowflake', 'bigquery', 'redshift', 'webhook']),
          entities: z
            .array(
              z.enum(['contacts', 'email_events', 'revenue_events', 'campaigns', 'workflow_runs']),
            )
            .min(1),
          config: z.record(z.unknown()),
          frequency: z.enum(['hourly', 'daily', 'weekly']).optional(),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await createWarehouseSync(req.user!.orgId, body) });
    },
  );

  app.delete(
    '/api/v1/warehouse-syncs/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Warehouse'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteWarehouseSync(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  app.post(
    '/api/v1/warehouse-syncs/:id/run',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Warehouse'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await runSync(id, req.user!.orgId) });
    },
  );
};

export default warehouseSyncRoutes;
