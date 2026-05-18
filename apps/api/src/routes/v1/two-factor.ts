import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { beginEnrollment, confirmEnrollment, disable } from '../../services/two-factor/index.js';

const twoFactorRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/2fa/enroll', {
    preHandler: [app.authenticate],
    schema: { tags: ['2FA'] },
  }, async (req, reply) => {
    const data = await beginEnrollment(req.user!.userId, req.user!.email || 'user');
    return reply.send({ data });
  });

  app.post('/api/v1/2fa/confirm', {
    preHandler: [app.authenticate],
    schema: { tags: ['2FA'] },
  }, async (req, reply) => {
    const body = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    await confirmEnrollment(req.user!.userId, body.code);
    return reply.send({ ok: true });
  });

  app.delete('/api/v1/2fa', {
    preHandler: [app.authenticate],
    schema: { tags: ['2FA'] },
  }, async (req, reply) => {
    await disable(req.user!.userId);
    return reply.code(204).send();
  });
};

export default twoFactorRoutes;
