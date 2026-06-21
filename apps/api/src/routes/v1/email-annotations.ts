import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  injectAnnotations,
  buildAppleMailHeaders,
  type EmailAnnotation,
} from '../../services/email/gmail-annotations.js';

export default async function emailAnnotationsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /**
   * POST /api/v1/email-annotations/inject
   * Injects schema.org JSON-LD + Gmail Promotions headers into email HTML.
   */
  app.post('/api/v1/email-annotations/inject', async (req) => {
    const promoSchema = z.object({
      type: z.literal('promotion'),
      discount: z.string().optional(),
      expiryDate: z.string().optional(),
      promoCode: z.string().optional(),
      imageUrl: z.string().url().optional(),
      badgeLabel: z.string().optional(),
    });

    const orderSchema = z.object({
      type: z.literal('order'),
      orderNumber: z.string(),
      orderDate: z.string(),
      orderStatus: z.enum(['ORDER_PLACED','ORDER_SHIPPED','ORDER_DELIVERED','ORDER_CANCELLED']),
      trackingUrl: z.string().url().optional(),
      estimatedArrival: z.string().optional(),
    });

    const eventSchema = z.object({
      type: z.literal('event'),
      eventName: z.string(),
      startDate: z.string(),
      endDate: z.string().optional(),
      location: z.string().optional(),
      organizer: z.string().optional(),
      rsvpUrl: z.string().url().optional(),
    });

    const body = z.object({
      html: z.string().min(1),
      annotation: z.discriminatedUnion('type', [promoSchema, orderSchema, eventSchema]),
      appleLogoUrl: z.string().url().optional(),
    }).parse(req.body);

    const { html, extraHeaders } = injectAnnotations(body.html, body.annotation as EmailAnnotation);
    const appleHeaders = body.appleLogoUrl ? buildAppleMailHeaders(body.appleLogoUrl) : {};

    return {
      data: {
        html,
        headers: { ...extraHeaders, ...appleHeaders },
      },
    };
  });

  /**
   * POST /api/v1/email-annotations/preview
   * Returns just the JSON-LD script block for preview/testing.
   */
  app.post('/api/v1/email-annotations/preview', async (req) => {
    const body = z.object({
      type: z.enum(['promotion', 'order', 'event']),
      discount: z.string().optional(),
      promoCode: z.string().optional(),
      expiryDate: z.string().optional(),
      orderNumber: z.string().optional(),
      eventName: z.string().optional(),
      startDate: z.string().optional(),
    }).parse(req.body);

    // Build a minimal annotation for preview
    let annotation: EmailAnnotation;
    if (body.type === 'promotion') {
      annotation = { type: 'promotion', discount: body.discount, promoCode: body.promoCode, expiryDate: body.expiryDate };
    } else if (body.type === 'order') {
      annotation = { type: 'order', orderNumber: body.orderNumber ?? '#000', orderDate: new Date().toISOString(), orderStatus: 'ORDER_PLACED' };
    } else {
      annotation = { type: 'event', eventName: body.eventName ?? 'Event', startDate: body.startDate ?? new Date().toISOString() };
    }

    const { html: previewHtml } = injectAnnotations('<head></head>', annotation);
    return { data: { preview: previewHtml } };
  });
}
