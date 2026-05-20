import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { auditUrl, listAudits } from '../../../services/seo/on-page-audit.js';

const seoAuditRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };

  app.post('/api/v1/seo/audit', auth, async (req, reply) => {
    const body = z
      .object({
        url: z.string().url(),
      })
      .parse(req.body);
    const data = await auditUrl(req.user!.orgId, body.url);
    return reply.send({ data });
  });

  app.get('/api/v1/seo/audit', auth, async (req, reply) => {
    const q = z
      .object({
        url: z.string().url().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);
    const data = await listAudits(req.user!.orgId, q.url, q.limit);
    return reply.send({ data });
  });
};

export default seoAuditRoutes;
