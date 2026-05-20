/**
 * Multi-language content routes (#338).
 *
 *   POST /api/v1/i18n/templates/:id/translate  — Claude translate to locale
 *   GET  /api/v1/i18n/templates/group/:groupId — list variants in a group
 *   GET  /api/v1/i18n/templates/group/:groupId/pick?locale=cs — pick best variant
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  getTemplateGroup,
  selectTemplateForLocale,
  translateTemplate,
} from '../../services/i18n/translation.js';

const i18nRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/i18n/templates/:id/translate',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['i18n'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          targetLocale: z.string().min(2).max(8),
          sourceLocale: z.string().min(2).max(8).optional(),
          tone: z.string().max(200).optional(),
        })
        .parse(req.body);
      const result = await translateTemplate(req.user!.orgId, id, body.targetLocale, {
        sourceLocale: body.sourceLocale,
        tone: body.tone,
      });
      return reply.code(201).send({ data: result });
    },
  );

  app.get(
    '/api/v1/i18n/templates/group/:groupId',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['i18n'] },
    },
    async (req, reply) => {
      const { groupId } = z.object({ groupId: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await getTemplateGroup(req.user!.orgId, groupId) });
    },
  );

  app.get(
    '/api/v1/i18n/templates/group/:groupId/pick',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['i18n'] },
    },
    async (req, reply) => {
      const { groupId } = z.object({ groupId: z.string().uuid() }).parse(req.params);
      const q = z.object({ locale: z.string().min(2).max(8) }).parse(req.query);
      return reply.send({
        data: await selectTemplateForLocale(req.user!.orgId, groupId, q.locale),
      });
    },
  );
};

export default i18nRoutes;
