import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { refreshOrgRfm, rfmDistribution, getContactRfm } from '../../services/rfm/index.js';

const rfmRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/rfm/refresh', {
    preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
    schema: { tags: ['RFM'] },
  }, async (req, reply) => {
    return reply.send({ data: await refreshOrgRfm(req.user!.orgId) });
  });

  app.get('/api/v1/rfm/distribution', {
    preHandler: [app.authenticate],
    schema: { tags: ['RFM'] },
  }, async (req, reply) => {
    return reply.send({ data: await rfmDistribution(req.user!.orgId) });
  });

  app.get('/api/v1/rfm/contacts/:contactId', {
    preHandler: [app.authenticate],
    schema: { tags: ['RFM'] },
  }, async (req, reply) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    return reply.send({ data: await getContactRfm(contactId) });
  });
};

export default rfmRoutes;
