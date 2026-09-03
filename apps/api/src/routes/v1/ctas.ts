/**
 * CTA routes (#340/#412).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createCta,
  listCtas,
  getCta,
  deleteCta,
  addVariant,
  listVariants,
  serveCtas,
  recordCtaClick,
  recordCtaDismiss,
  getCtaPerformance,
} from '../../services/blog/ctas.js';

const ctaRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/ctas',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CTAs'], summary: 'List CTAs' },
    },
    async (req) => ({ data: await listCtas(req.user!.orgId) }),
  );

  app.get(
    '/api/v1/ctas/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CTAs'], summary: 'Get a CTA' },
    },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return { data: await getCta(req.user!.orgId, id) };
    },
  );

  app.post(
    '/api/v1/ctas',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['CTAs'], summary: 'Create a CTA' },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(255),
          type: z.enum(['button', 'banner', 'popup', 'inline', 'exit_intent']).optional(),
          content: z.record(z.unknown()).optional(),
          conditions: z
            .array(
              z.object({
                trigger: z.string(),
                operator: z.enum(['eq', 'contains', 'gt', 'gte', 'lt', 'in']),
                value: z.unknown(),
              }),
            )
            .optional(),
          active: z.boolean().optional(),
        })
        .parse(req.body);
      return reply
        .code(201)
        .send({ data: await createCta(req.user!.orgId, body as Parameters<typeof createCta>[1]) });
    },
  );

  app.delete(
    '/api/v1/ctas/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['CTAs'], summary: 'Delete a CTA' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteCta(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  // Variants
  app.get(
    '/api/v1/ctas/:id/variants',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CTAs'], summary: 'List variants for a CTA' },
    },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return { data: await listVariants(req.user!.orgId, id) };
    },
  );

  app.post(
    '/api/v1/ctas/:id/variants',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['CTAs'], summary: 'Add a variant to a CTA' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          name: z.string().min(1).max(128),
          weight: z.number().int().min(0).max(1000).optional(),
          content: z.record(z.unknown()),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await addVariant(req.user!.orgId, id, body) });
    },
  );

  // Analytics
  app.get(
    '/api/v1/ctas/:id/performance',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CTAs'], summary: 'CTA performance stats' },
    },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return { data: await getCtaPerformance(req.user!.orgId, id) };
    },
  );

  // ── Browser-called serve + tracking ───────────────────────────────────────
  //
  // These three are genuinely public in the sense that matters — they run in a
  // visitor's browser on the customer's own website, and no visitor has a
  // session. What they must NOT be is anonymous about which org they act on:
  // all three took `orgId` from the request body, so anyone could enumerate
  // orgs and read another tenant's targeting rules out of /serve, or write
  // impressions, clicks and dismissals into their CTA statistics.
  //
  // `authenticatePublic` is this repository's existing answer to exactly that
  // shape — its own docstring names "in-app message match, event ingest" as the
  // intended use, and POST /api/v1/events, GET /api/v1/in-app/messages/sdk and
  // POST /api/v1/push/devices already sit behind it. It accepts the publishable
  // `fm_pub_` key that packages/web-sdk embeds in page JS (sent as `X-API-Key`,
  // see web-sdk/src/index.ts:apiFetch), and it resolves the org FROM the key.
  //
  // So the fix is not "make them private". It is: the page keeps calling them
  // with the key it already carries, and `orgId` stops being a caller-supplied
  // claim. A signed per-CTA token was the alternative and is the wrong tool —
  // it would need issuing, rotating and embedding per CTA, and the publishable
  // key already carries the one fact these routes need.
  app.post(
    '/api/v1/ctas/serve',
    {
      preHandler: [app.authenticatePublic],
      schema: { tags: ['CTAs'], summary: 'Public: resolve eligible CTAs for a visitor' },
    },
    async (req) => {
      const body = z
        .object({
          visitorId: z.string().optional(),
          contactId: z.string().uuid().optional(),
          context: z.object({
            url: z.string().optional(),
            timeOnSiteSeconds: z.number().optional(),
            scrollDepthPercent: z.number().optional(),
            cartValue: z.number().optional(),
            isReturningVisitor: z.boolean().optional(),
            segmentIds: z.array(z.string()).optional(),
            exitIntent: z.boolean().optional(),
            customEvent: z.string().optional(),
          }),
        })
        .parse(req.body);
      return { data: await serveCtas({ ...body, orgId: req.user!.orgId }) };
    },
  );

  app.post(
    '/api/v1/ctas/:id/click',
    {
      preHandler: [app.authenticatePublic],
      schema: { tags: ['CTAs'], summary: 'Public: record CTA click' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          variantId: z.string().uuid().optional(),
          visitorId: z.string().optional(),
          contactId: z.string().uuid().optional(),
        })
        .parse(req.body);
      await recordCtaClick({ ...body, orgId: req.user!.orgId, ctaId: id });
      return reply.code(204).send();
    },
  );

  app.post(
    '/api/v1/ctas/:id/dismiss',
    {
      preHandler: [app.authenticatePublic],
      schema: { tags: ['CTAs'], summary: 'Public: record CTA dismiss' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          variantId: z.string().uuid().optional(),
          visitorId: z.string().optional(),
        })
        .parse(req.body);
      await recordCtaDismiss({ ...body, orgId: req.user!.orgId, ctaId: id });
      return reply.code(204).send();
    },
  );
};

export default ctaRoutes;
