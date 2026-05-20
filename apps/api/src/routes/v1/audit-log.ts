import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { listAuditLogs, getAuditLog } from '../../services/audit-log/index.js';

const auditLogRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/audit-logs',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Audit Logs'] },
    },
    async (req, reply) => {
      const q = z
        .object({
          userId: z.string().uuid().optional(),
          resource: z.string().optional(),
          action: z.string().optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          cursor: z.string().optional(),
        })
        .parse(req.query);

      const result = await listAuditLogs(req.user!.orgId, {
        ...q,
        from: q.from ? new Date(q.from) : undefined,
        to: q.to ? new Date(q.to) : undefined,
      });
      return reply.send(result);
    },
  );

  app.get(
    '/api/v1/audit-logs/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Audit Logs'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await getAuditLog(req.user!.orgId, id) });
    },
  );
};

export default auditLogRoutes;
