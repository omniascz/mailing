import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as svc from '../../services/web-personalization/index.js';

const idParam = z.object({ id: z.string().uuid() });

const audienceSchema = z.object({
  type: z.string(),
  value: z.string().optional(),
});

const createSchema = z.object({
  siteId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(255),
  selector: z.string().min(1).max(2048),
  action: z.enum(['hide', 'show', 'swap_text', 'swap_html', 'add_class', 'remove_class', 'set_attr']).optional(),
  value: z.string().nullable().optional(),
  urlPattern: z.string().max(2048).nullable().optional(),
  audience: audienceSchema.optional(),
  priority: z.string().optional(),
});

const resolveQuery = z.object({
  siteToken: z.string().min(1),
  visitorId: z.string().min(1),
  contactId: z.string().uuid().optional(),
  url: z.string().optional(),
  path: z.string().optional(),
});

export default async function webPersonalizationRoutes(app: FastifyInstance) {
  // ─── Authenticated CRUD ───────────────────────────────────────────────────────

  app.get(
    '/api/v1/personalization/rules',
    { preHandler: app.requireAuth, schema: { tags: ['WebPersonalization'], summary: 'List personalization rules' } },
    async (req) => {
      const { siteId } = z.object({ siteId: z.string().uuid().optional() }).parse(req.query);
      return { data: await svc.listRules(req.user!.orgId, siteId) };
    },
  );

  app.post(
    '/api/v1/personalization/rules',
    { preHandler: app.requireAuth, schema: { tags: ['WebPersonalization'], summary: 'Create personalization rule' } },
    async (req, reply) => {
      const body = createSchema.parse(req.body);
      return reply.code(201).send({ data: await svc.createRule(req.user!.orgId, body) });
    },
  );

  app.get(
    '/api/v1/personalization/rules/:id',
    { preHandler: app.requireAuth, schema: { tags: ['WebPersonalization'], summary: 'Get rule' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await svc.getRule(req.user!.orgId, id) };
    },
  );

  app.put(
    '/api/v1/personalization/rules/:id',
    { preHandler: app.requireAuth, schema: { tags: ['WebPersonalization'], summary: 'Update rule' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await svc.updateRule(req.user!.orgId, id, createSchema.partial().parse(req.body)) };
    },
  );

  app.delete(
    '/api/v1/personalization/rules/:id',
    { preHandler: app.requireAuth, schema: { tags: ['WebPersonalization'], summary: 'Delete rule' } },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await svc.deleteRule(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  // ─── Public: resolve rules for a visitor ─────────────────────────────────────

  app.get(
    '/t/personalization',
    { schema: { tags: ['WebPersonalization'], summary: 'Resolve personalization rules for visitor' } },
    async (req) => {
      const q = resolveQuery.parse(req.query);
      return { data: await svc.resolveRulesForVisitor(q) };
    },
  );
}
