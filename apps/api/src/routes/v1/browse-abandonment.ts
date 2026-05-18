/**
 * Browse abandonment / retargeting routes — #85
 *
 *  POST /api/v1/browse/track                 — record product page view (public, auth by API key or contact token)
 *  GET  /api/v1/browse/contact/:contactId    — list recent views for a contact
 *  GET  /api/v1/browse/top-products          — top viewed products (org-level)
 *  POST /api/v1/browse/check-abandonment     — manual trigger / cron endpoint
 *  POST /api/v1/browse/converted             — mark contact as purchased (suppresses retargeting)
 *  POST /api/v1/browse/associate             — link visitor token → known contact after login
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  trackPageView,
  listRecentViews,
  checkAndFireAbandonments,
  markConverted,
  associateVisitorViews,
  topViewedProducts,
} from '../../services/browse-abandonment/index.js';

const browseAbandonmentRoutes: FastifyPluginAsync = async (app) => {

  // Public tracking endpoint — called from storefront JS (auth by API key or visitor token).
  app.post('/api/v1/browse/track', {
    preHandler: [app.authenticate],
    schema: { tags: ['Browse Abandonment'], summary: 'Track a product page view' },
  }, async (req, reply) => {
    const body = z.object({
      contactId: z.string().uuid().optional(),
      visitorToken: z.string().min(1).max(128).optional(),
      sku: z.string().max(128).optional(),
      productName: z.string().max(512).optional(),
      productUrl: z.string().url().optional(),
      meta: z.object({
        url: z.string().optional(),
        referrer: z.string().optional(),
        sessionId: z.string().optional(),
        ua: z.string().max(256).optional(),
      }).optional(),
    }).parse(req.body);

    if (!body.contactId && !body.visitorToken) {
      return reply.code(400).send({ code: 'MISSING_IDENTITY', message: 'contactId or visitorToken required' });
    }

    const view = await trackPageView({ orgId: req.user!.orgId, ...body });
    return reply.code(201).send({ data: view });
  });

  // List recent views for a contact.
  app.get('/api/v1/browse/contact/:contactId', {
    preHandler: [app.authenticate],
    schema: { tags: ['Browse Abandonment'], summary: 'List recent product views for a contact' },
  }, async (req, reply) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    const { sinceHours } = z.object({ sinceHours: z.coerce.number().int().min(1).max(8760).default(72) }).parse(req.query);
    return reply.send({ data: await listRecentViews(req.user!.orgId, contactId, sinceHours) });
  });

  // Top viewed products for the org.
  app.get('/api/v1/browse/top-products', {
    preHandler: [app.authenticate],
    schema: { tags: ['Browse Abandonment'], summary: 'Top viewed products (retargeting dashboard)' },
  }, async (req, reply) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
    return reply.send({ data: await topViewedProducts(req.user!.orgId, limit) });
  });

  // Manual / cron trigger — check for abandoned browses and fire workflow events.
  app.post('/api/v1/browse/check-abandonment', {
    preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
    schema: { tags: ['Browse Abandonment'], summary: 'Trigger browse-abandonment detection (run or test)' },
  }, async (req, reply) => {
    const body = z.object({
      waitHours: z.number().min(0.25).max(48).default(1),
      suppressionHours: z.number().min(1).max(720).default(72),
      minViews: z.number().int().min(1).max(10).default(1),
    }).parse(req.body);
    const result = await checkAndFireAbandonments(req.user!.orgId, body);
    return reply.send({ data: result });
  });

  // Mark a contact as converted so they are suppressed from further retargeting.
  app.post('/api/v1/browse/converted', {
    preHandler: [app.authenticate],
    schema: { tags: ['Browse Abandonment'], summary: 'Mark contact as purchased (suppress retargeting)' },
  }, async (req, reply) => {
    const body = z.object({ contactId: z.string().uuid() }).parse(req.body);
    await markConverted(req.user!.orgId, body.contactId);
    return reply.send({ data: { ok: true } });
  });

  // Associate an anonymous visitor token to a known contact after login/identify.
  app.post('/api/v1/browse/associate', {
    preHandler: [app.authenticate],
    schema: { tags: ['Browse Abandonment'], summary: 'Backfill anonymous page views to a contact' },
  }, async (req, reply) => {
    const body = z.object({
      visitorToken: z.string().min(1).max(128),
      contactId: z.string().uuid(),
    }).parse(req.body);
    const updated = await associateVisitorViews(req.user!.orgId, body.visitorToken, body.contactId);
    return reply.send({ data: { updatedViews: updated } });
  });
};

export default browseAbandonmentRoutes;
