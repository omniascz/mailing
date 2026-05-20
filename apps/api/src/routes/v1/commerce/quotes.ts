import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listQuotes,
  getQuote,
  createQuote,
  updateQuote,
  deleteQuote,
  sendQuote,
  getQuoteByToken,
  convertQuoteToInvoice,
} from '../../../services/commerce/quotes.js';
import {
  initiateESign,
  completeBuiltinSigning,
  handleESignWebhook,
} from '../../../services/commerce/e-signature.js';

const lineItemSchema = z.object({
  productId: z.string().uuid().optional(),
  sku: z.string().max(128),
  name: z.string().max(255),
  description: z.string().max(1024).optional(),
  qty: z.number().positive(),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).max(100).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  recurring: z.boolean().optional(),
  recurringInterval: z.enum(['monthly', 'yearly']).optional(),
  total: z.number().optional(),
});

const commerceQuoteRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };

  app.get('/api/v1/commerce/quotes', auth, async (req, reply) => {
    const q = z
      .object({
        status: z.string().optional(),
        dealId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);
    const data = await listQuotes(req.user!.orgId, q);
    return reply.send({ data });
  });

  app.get('/api/v1/commerce/quotes/:quoteId', auth, async (req, reply) => {
    const { quoteId } = z.object({ quoteId: z.string().uuid() }).parse(req.params);
    const data = await getQuote(req.user!.orgId, quoteId);
    return reply.send({ data });
  });

  app.post('/api/v1/commerce/quotes', auth, async (req, reply) => {
    const body = z
      .object({
        dealId: z.string().uuid().optional(),
        contactId: z.string().uuid().optional(),
        title: z.string().min(1).max(255),
        currency: z.string().length(3).default('USD'),
        lineItems: z.array(lineItemSchema).min(1),
        taxRate: z.number().min(0).max(100).default(0),
        validUntil: z.string().datetime().optional(),
        notes: z.string().optional(),
        terms: z.string().optional(),
      })
      .parse(req.body);
    const { computeLineItem } = await import('../../../services/commerce/products.js');
    const items = body.lineItems.map((i) => computeLineItem(i));
    const data = await createQuote(req.user!.orgId, {
      ...body,
      lineItems: items,
      validUntil: body.validUntil ? new Date(body.validUntil) : undefined,
    });
    return reply.code(201).send({ data });
  });

  app.patch('/api/v1/commerce/quotes/:quoteId', auth, async (req, reply) => {
    const { quoteId } = z.object({ quoteId: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        title: z.string().max(255).optional(),
        lineItems: z.array(lineItemSchema).optional(),
        taxRate: z.number().min(0).max(100).optional(),
        currency: z.string().length(3).optional(),
        validUntil: z.string().datetime().optional(),
        notes: z.string().optional(),
        terms: z.string().optional(),
      })
      .parse(req.body);
    const patch: Record<string, unknown> = { ...body };
    if (body.validUntil) patch.validUntil = new Date(body.validUntil);
    if (body.lineItems) {
      const { computeLineItem } = await import('../../../services/commerce/products.js');
      patch.lineItems = body.lineItems.map((i) => computeLineItem(i));
    }
    const data = await updateQuote(req.user!.orgId, quoteId, patch);
    return reply.send({ data });
  });

  app.delete('/api/v1/commerce/quotes/:quoteId', auth, async (req, reply) => {
    const { quoteId } = z.object({ quoteId: z.string().uuid() }).parse(req.params);
    await deleteQuote(req.user!.orgId, quoteId);
    return reply.code(204).send();
  });

  app.post('/api/v1/commerce/quotes/:quoteId/send', auth, async (req, reply) => {
    const { quoteId } = z.object({ quoteId: z.string().uuid() }).parse(req.params);
    const data = await sendQuote(req.user!.orgId, quoteId);
    return reply.send({ data });
  });

  app.post('/api/v1/commerce/quotes/:quoteId/esign', auth, async (req, reply) => {
    const { quoteId } = z.object({ quoteId: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        recipientEmail: z.string().email(),
        recipientName: z.string().min(1),
      })
      .parse(req.body);
    const data = await initiateESign(
      req.user!.orgId,
      quoteId,
      body.recipientEmail,
      body.recipientName,
    );
    return reply.send({ data });
  });

  app.post('/api/v1/commerce/quotes/:quoteId/convert-to-invoice', auth, async (req, reply) => {
    const { quoteId } = z.object({ quoteId: z.string().uuid() }).parse(req.params);
    const body = z.object({ dueDate: z.string().datetime().optional() }).parse(req.body ?? {});
    const data = await convertQuoteToInvoice(
      req.user!.orgId,
      quoteId,
      body.dueDate ? new Date(body.dueDate) : undefined,
    );
    return reply.code(201).send({ data });
  });

  // ── Public endpoints (no auth — by token) ──────────────────────────────────
  app.get('/api/v1/public/quotes/:token', async (req, reply) => {
    const { token } = z.object({ token: z.string().min(32) }).parse(req.params);
    const data = await getQuoteByToken(token);
    return reply.send({ data });
  });

  app.post('/api/v1/public/quotes/:token/sign', async (req, reply) => {
    const { token } = z.object({ token: z.string().min(32) }).parse(req.params);
    const body = z
      .object({
        signerName: z.string().min(1).max(255),
      })
      .parse(req.body);
    const ip = req.ip ?? 'unknown';
    const data = await completeBuiltinSigning(token, body.signerName, ip);
    return reply.send({ data });
  });

  // E-sign provider webhooks
  app.post('/api/v1/webhooks/esign/:provider', async (req, reply) => {
    const { provider } = z
      .object({ provider: z.enum(['docusign', 'hellosign']) })
      .parse(req.params);
    await handleESignWebhook(provider, req.body as Record<string, unknown>);
    return reply.code(200).send('OK');
  });
};

export default commerceQuoteRoutes;
