import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listInvoices, getInvoice, createInvoice, updateInvoice,
  sendInvoice, voidInvoice, markInvoicePaid,
} from '../../../services/commerce/invoicing.js';
import {
  createInvoicePaymentIntent, refundInvoicePayment, handleStripeWebhook,
} from '../../../services/commerce/payments.js';

const lineItemSchema = z.object({
  productId: z.string().uuid().optional(),
  sku: z.string().max(128),
  name: z.string().max(255),
  qty: z.number().positive(),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).max(100).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  total: z.number().optional(),
});

const commerceInvoiceRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };

  app.get('/api/v1/commerce/invoices', auth, async (req, reply) => {
    const q = z.object({
      status: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);
    const data = await listInvoices(req.user!.orgId, q);
    return reply.send({ data });
  });

  app.get('/api/v1/commerce/invoices/:invoiceId', auth, async (req, reply) => {
    const { invoiceId } = z.object({ invoiceId: z.string().uuid() }).parse(req.params);
    const data = await getInvoice(req.user!.orgId, invoiceId);
    return reply.send({ data });
  });

  app.post('/api/v1/commerce/invoices', auth, async (req, reply) => {
    const body = z.object({
      dealId: z.string().uuid().optional(),
      contactId: z.string().uuid().optional(),
      currency: z.string().length(3).default('USD'),
      lineItems: z.array(lineItemSchema).min(1),
      taxRate: z.number().min(0).max(100).default(0),
      dueDate: z.string().datetime().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const { computeLineItem } = await import('../../../services/commerce/products.js');
    const items = body.lineItems.map(i => computeLineItem(i));
    const data = await createInvoice(req.user!.orgId, { ...body, lineItems: items, dueDate: body.dueDate ? new Date(body.dueDate) : undefined });
    return reply.code(201).send({ data });
  });

  app.patch('/api/v1/commerce/invoices/:invoiceId', auth, async (req, reply) => {
    const { invoiceId } = z.object({ invoiceId: z.string().uuid() }).parse(req.params);
    const body = z.object({
      lineItems: z.array(lineItemSchema).optional(),
      taxRate: z.number().optional(),
      dueDate: z.string().datetime().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const patch: Record<string, unknown> = { ...body };
    if (body.dueDate) patch.dueDate = new Date(body.dueDate);
    if (body.lineItems) {
      const { computeLineItem } = await import('../../../services/commerce/products.js');
      patch.lineItems = body.lineItems.map(i => computeLineItem(i));
    }
    const data = await updateInvoice(req.user!.orgId, invoiceId, patch);
    return reply.send({ data });
  });

  app.post('/api/v1/commerce/invoices/:invoiceId/send', auth, async (req, reply) => {
    const { invoiceId } = z.object({ invoiceId: z.string().uuid() }).parse(req.params);
    const data = await sendInvoice(req.user!.orgId, invoiceId);
    return reply.send({ data });
  });

  app.post('/api/v1/commerce/invoices/:invoiceId/void', auth, async (req, reply) => {
    const { invoiceId } = z.object({ invoiceId: z.string().uuid() }).parse(req.params);
    const data = await voidInvoice(req.user!.orgId, invoiceId);
    return reply.send({ data });
  });

  app.post('/api/v1/commerce/invoices/:invoiceId/mark-paid', auth, async (req, reply) => {
    const { invoiceId } = z.object({ invoiceId: z.string().uuid() }).parse(req.params);
    const body = z.object({ amountPaid: z.number().positive().optional() }).parse(req.body ?? {});
    const data = await markInvoicePaid(req.user!.orgId, invoiceId, body.amountPaid);
    return reply.send({ data });
  });

  // ── Payment ──────────────────────────────────────────────────────────────
  app.post('/api/v1/commerce/invoices/:invoiceId/payment-intent', auth, async (req, reply) => {
    const { invoiceId } = z.object({ invoiceId: z.string().uuid() }).parse(req.params);
    const data = await createInvoicePaymentIntent(req.user!.orgId, invoiceId);
    return reply.send({ data });
  });

  app.post('/api/v1/commerce/invoices/:invoiceId/refund', auth, async (req, reply) => {
    const { invoiceId } = z.object({ invoiceId: z.string().uuid() }).parse(req.params);
    const body = z.object({ amountCents: z.number().int().positive().optional() }).parse(req.body ?? {});
    const data = await refundInvoicePayment(req.user!.orgId, invoiceId, body.amountCents);
    return reply.send({ data });
  });

  // ── Stripe webhook ────────────────────────────────────────────────────────
  app.post('/api/v1/webhooks/stripe', {
    config: { rawBody: true },
  }, async (req, reply) => {
    const sig = req.headers['stripe-signature'] as string ?? '';
    await handleStripeWebhook(Buffer.from(JSON.stringify(req.body)), sig);
    return reply.code(200).send({ received: true });
  });
};

export default commerceInvoiceRoutes;
