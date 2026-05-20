import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as svc from '../../services/site-messages/index.js';

const idParam = z.object({ id: z.string().uuid() });

const conditionSchema = z.object({
  trigger: z.string(),
  operator: z.enum(['eq', 'contains', 'gt', 'gte', 'lt', 'in']),
  value: z.unknown(),
});

const createSchema = z.object({
  siteId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(255),
  type: z.enum(['popup', 'banner', 'slide_in', 'full_screen']).optional(),
  trigger: z
    .enum([
      'page_visit',
      'time_on_site',
      'exit_intent',
      'scroll_depth',
      'cart_value',
      'returning_visitor',
      'segment_match',
      'custom_event',
    ])
    .optional(),
  conditions: z.array(conditionSchema).optional(),
  headline: z.string().max(255).optional(),
  body: z.string().max(10_000).optional(),
  ctaText: z.string().max(100).optional(),
  ctaUrl: z.string().url().max(2048).optional(),
  style: z.record(z.unknown()).optional(),
  showOncePerVisitor: z.boolean().optional(),
  showOncePerSession: z.boolean().optional(),
  delaySeconds: z.number().int().min(0).max(300).optional(),
});

const resolveQuery = z.object({
  siteToken: z.string().min(1),
  visitorId: z.string().min(1),
  url: z.string().optional(),
  sessionId: z.string().optional(),
});

const impressionBody = z.object({
  siteToken: z.string().min(1),
  messageId: z.string().uuid(),
  visitorId: z.string().min(1),
  contactId: z.string().uuid().optional(),
  clicked: z.boolean().optional(),
  dismissed: z.boolean().optional(),
});

export default async function siteMessageRoutes(app: FastifyInstance) {
  // ─── Authenticated CRUD ───────────────────────────────────────────────────────

  app.get(
    '/api/v1/site-messages',
    {
      preHandler: app.requireAuth,
      schema: { tags: ['SiteMessages'], summary: 'List site messages' },
    },
    async (req) => {
      const { siteId } = z.object({ siteId: z.string().uuid().optional() }).parse(req.query);
      return { data: await svc.listMessages(req.user!.orgId, siteId) };
    },
  );

  app.post(
    '/api/v1/site-messages',
    {
      preHandler: app.requireAuth,
      schema: { tags: ['SiteMessages'], summary: 'Create site message' },
    },
    async (req, reply) => {
      const body = createSchema.parse(req.body);
      return reply.code(201).send({
        data: await svc.createMessage(
          req.user!.orgId,
          body as Parameters<typeof svc.createMessage>[1],
        ),
      });
    },
  );

  app.get(
    '/api/v1/site-messages/:id',
    {
      preHandler: app.requireAuth,
      schema: { tags: ['SiteMessages'], summary: 'Get site message' },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await svc.getMessage(req.user!.orgId, id) };
    },
  );

  app.put(
    '/api/v1/site-messages/:id',
    {
      preHandler: app.requireAuth,
      schema: { tags: ['SiteMessages'], summary: 'Update site message' },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return {
        data: await svc.updateMessage(
          req.user!.orgId,
          id,
          createSchema.partial().parse(req.body) as Parameters<typeof svc.updateMessage>[2],
        ),
      };
    },
  );

  app.delete(
    '/api/v1/site-messages/:id',
    {
      preHandler: app.requireAuth,
      schema: { tags: ['SiteMessages'], summary: 'Delete site message' },
    },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await svc.deleteMessage(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  // ─── Public endpoints (called by JS tracker) ─────────────────────────────────

  app.get(
    '/t/messages',
    { schema: { tags: ['SiteMessages'], summary: 'Resolve messages for visitor' } },
    async (req) => {
      const q = resolveQuery.parse(req.query);
      const messages = await svc.resolveMessagesForVisitor(q);
      return { data: messages };
    },
  );

  app.post(
    '/t/messages/impression',
    { schema: { tags: ['SiteMessages'], summary: 'Record message impression' } },
    async (req, reply) => {
      try {
        const body = impressionBody.parse(req.body);
        await svc.recordImpression(body);
      } catch {
        /* noop */
      }
      return reply.code(202).send({ ok: true });
    },
  );
}
