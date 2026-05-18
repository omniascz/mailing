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
  app.get('/api/v1/ctas', {
    preHandler: [app.authenticate],
    schema: { tags: ['CTAs'], summary: 'List CTAs' },
  }, async (req) => ({ data: await listCtas(req.user!.orgId) }));

  app.get('/api/v1/ctas/:id', {
    preHandler: [app.authenticate],
    schema: { tags: ['CTAs'], summary: 'Get a CTA' },
  }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return { data: await getCta(req.user!.orgId, id) };
  });

  app.post('/api/v1/ctas', {
    preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
    schema: { tags: ['CTAs'], summary: 'Create a CTA' },
  }, async (req, reply) => {
    const body = z.object({
      name: z.string().min(1).max(255),
      type: z.enum(['button', 'banner', 'popup', 'inline', 'exit_intent']).optional(),
      content: z.record(z.unknown()).optional(),
      conditions: z.array(z.object({
        trigger: z.string(),
        operator: z.enum(['eq', 'contains', 'gt', 'gte', 'lt', 'in']),
        value: z.unknown(),
      })).optional(),
      active: z.boolean().optional(),
    }).parse(req.body);
    return reply.code(201).send({ data: await createCta(req.user!.orgId, body as Parameters<typeof createCta>[1]) });
  });

  app.delete('/api/v1/ctas/:id', {
    preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
    schema: { tags: ['CTAs'], summary: 'Delete a CTA' },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await deleteCta(req.user!.orgId, id);
    return reply.code(204).send();
  });

  // Variants
  app.get('/api/v1/ctas/:id/variants', {
    preHandler: [app.authenticate],
    schema: { tags: ['CTAs'], summary: 'List variants for a CTA' },
  }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return { data: await listVariants(id) };
  });

  app.post('/api/v1/ctas/:id/variants', {
    preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
    schema: { tags: ['CTAs'], summary: 'Add a variant to a CTA' },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({
      name: z.string().min(1).max(128),
      weight: z.number().int().min(0).max(1000).optional(),
      content: z.record(z.unknown()),
    }).parse(req.body);
    return reply.code(201).send({ data: await addVariant(id, body) });
  });

  // Analytics
  app.get('/api/v1/ctas/:id/performance', {
    preHandler: [app.authenticate],
    schema: { tags: ['CTAs'], summary: 'CTA performance stats' },
  }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return { data: await getCtaPerformance(req.user!.orgId, id) };
  });

  // Public serve + tracking
  app.post('/api/v1/ctas/serve', {
    schema: { tags: ['CTAs'], summary: 'Public: resolve eligible CTAs for a visitor' },
  }, async (req) => {
    const body = z.object({
      orgId: z.string().uuid(),
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
    }).parse(req.body);
    return { data: await serveCtas(body) };
  });

  app.post('/api/v1/ctas/:id/click', {
    schema: { tags: ['CTAs'], summary: 'Public: record CTA click' },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({
      orgId: z.string().uuid(),
      variantId: z.string().uuid().optional(),
      visitorId: z.string().optional(),
      contactId: z.string().uuid().optional(),
    }).parse(req.body);
    await recordCtaClick({ ...body, ctaId: id });
    return reply.code(204).send();
  });

  app.post('/api/v1/ctas/:id/dismiss', {
    schema: { tags: ['CTAs'], summary: 'Public: record CTA dismiss' },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({
      orgId: z.string().uuid(),
      variantId: z.string().uuid().optional(),
      visitorId: z.string().optional(),
    }).parse(req.body);
    await recordCtaDismiss({ ...body, ctaId: id });
    return reply.code(204).send();
  });
};

export default ctaRoutes;
