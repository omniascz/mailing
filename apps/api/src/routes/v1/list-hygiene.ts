import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  generateHygieneReport,
  purgeInactive,
  findDuplicates,
  mergeDuplicates,
} from '../../services/list-hygiene/index.js';

const hygieneRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/list-hygiene/report',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['List Hygiene'] },
    },
    async (req, reply) => {
      return reply.send({ data: await generateHygieneReport(req.user!.orgId) });
    },
  );

  app.post(
    '/api/v1/list-hygiene/purge',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['List Hygiene'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          days: z.number().int().min(30).max(3650).default(365),
        })
        .parse(req.body ?? {});
      return reply.send({ data: await purgeInactive(req.user!.orgId, body.days) });
    },
  );

  app.get(
    '/api/v1/duplicates',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Duplicates'] },
    },
    async (req, reply) => {
      return reply.send({ data: await findDuplicates(req.user!.orgId) });
    },
  );

  app.post(
    '/api/v1/duplicates/merge',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Duplicates'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          primaryId: z.string().uuid(),
          duplicateIds: z.array(z.string().uuid()).min(1).max(50),
        })
        .parse(req.body);
      return reply.send({
        data: await mergeDuplicates(req.user!.orgId, body.primaryId, body.duplicateIds),
      });
    },
  );
};

export default hygieneRoutes;
