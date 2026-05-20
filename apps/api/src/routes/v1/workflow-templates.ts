/**
 * Pre-built workflow gallery (Sprint E.3).
 *
 *   GET  /api/v1/workflow-templates                       list + filter
 *   GET  /api/v1/workflow-templates/categories            category counts
 *   GET  /api/v1/workflow-templates/:slug                 detail
 *   POST /api/v1/workflow-templates/:slug/fork            create draft workflow
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listTemplates,
  findTemplate,
  forkTemplate,
  listCategories,
} from '../../services/workflow-templates/index.js';

const categoryEnum = z.enum([
  'welcome',
  'abandoned_cart',
  'post_purchase',
  'winback',
  'birthday',
  'browse_abandonment',
  'vip_loyalty',
  'lead_nurture',
  'event',
  'feedback_nps',
  'cross_sell',
  'onboarding',
  'churn_prevention',
  'date_triggered',
  'subscription_renewal',
]);

const localeEnum = z.enum(['en', 'cs', 'sk']);

export default async function workflowTemplateRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get(
    '/api/v1/workflow-templates',
    {
      schema: { tags: ['WorkflowTemplates'], summary: 'List workflow templates' },
    },
    async (req) => {
      const q = z
        .object({
          category: categoryEnum.optional(),
          locale: localeEnum.optional(),
          recommendedFor: z.string().max(64).optional(),
        })
        .parse(req.query);
      return { data: listTemplates(q) };
    },
  );

  app.get(
    '/api/v1/workflow-templates/categories',
    {
      schema: { tags: ['WorkflowTemplates'], summary: 'List categories with counts' },
    },
    async () => {
      return { data: listCategories() };
    },
  );

  app.get(
    '/api/v1/workflow-templates/:slug',
    {
      schema: { tags: ['WorkflowTemplates'], summary: 'Get a template' },
    },
    async (req, reply) => {
      const { slug } = z.object({ slug: z.string().min(1).max(128) }).parse(req.params);
      const tpl = findTemplate(slug);
      if (!tpl)
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Template not found' } });
      return { data: tpl };
    },
  );

  app.post(
    '/api/v1/workflow-templates/:slug/fork',
    {
      schema: { tags: ['WorkflowTemplates'], summary: 'Fork a template into a draft workflow' },
    },
    async (req, reply) => {
      const { slug } = z.object({ slug: z.string().min(1).max(128) }).parse(req.params);
      const body = z.object({ name: z.string().max(255).optional() }).parse(req.body ?? {});
      const wf = await forkTemplate(req.user!.orgId, slug, body);
      return reply.code(201).send({ data: wf });
    },
  );
}
