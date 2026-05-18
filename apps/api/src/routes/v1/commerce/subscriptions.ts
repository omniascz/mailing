import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createSubscription, getSubscription, listSubscriptions,
  updateSubscription, pauseSubscription, resumeSubscription,
  cancelSubscription, reactivateSubscription, listSubscriptionChanges,
  softDeleteSubscription, runDueInvoiceGeneration,
} from '../../../services/commerce/subscriptions.js';

const subscriptionLineItemSchema = z.object({
  productId: z.string().uuid().optional(),
  sku: z.string().max(128).optional(),
  description: z.string().max(255),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  currency: z.string().length(3),
  taxRate: z.number().min(0).max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const commerceSubscriptionRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };

  app.get('/api/v1/commerce/subscriptions', auth, async (req, reply) => {
    const q = z.object({
      status: z.string().optional(),
      contactId: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);
    const data = await listSubscriptions(req.user!.orgId, q);
    return reply.send({ data });
  });

  app.get('/api/v1/commerce/subscriptions/:id', auth, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = await getSubscription(req.user!.orgId, id);
    return reply.send({ data });
  });

  app.post('/api/v1/commerce/subscriptions', auth, async (req, reply) => {
    const body = z.object({
      contactId: z.string().uuid().optional(),
      dealId: z.string().uuid().optional(),
      currency: z.string().length(3).default('USD'),
      lineItems: z.array(subscriptionLineItemSchema).min(1),
      billingInterval: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month'),
      billingIntervalCount: z.number().int().min(1).default(1),
      billingAnchor: z.number().int().min(1).max(31).optional(),
      startDate: z.string().datetime().optional(),
      trialEndsAt: z.string().datetime().optional(),
      endsAt: z.string().datetime().optional(),
      stripeSubscriptionId: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).parse(req.body);

    const data = await createSubscription(req.user!.orgId, {
      ...body,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      trialEndsAt: body.trialEndsAt ? new Date(body.trialEndsAt) : undefined,
      endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
    });
    return reply.code(201).send({ data });
  });

  app.patch('/api/v1/commerce/subscriptions/:id', auth, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({
      lineItems: z.array(subscriptionLineItemSchema).min(1),
      effective: z.enum(['immediate', 'next_period']).default('immediate'),
      reason: z.string().max(500).optional(),
    }).parse(req.body);
    const data = await updateSubscription(req.user!.orgId, id, {
      ...body,
      changedByUserId: req.user!.userId,
    });
    return reply.send({ data });
  });

  app.post('/api/v1/commerce/subscriptions/:id/pause', auth, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = await pauseSubscription(req.user!.orgId, id, req.user!.userId);
    return reply.send({ data });
  });

  app.post('/api/v1/commerce/subscriptions/:id/resume', auth, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = await resumeSubscription(req.user!.orgId, id, req.user!.userId);
    return reply.send({ data });
  });

  app.post('/api/v1/commerce/subscriptions/:id/cancel', auth, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({
      when: z.enum(['immediate', 'period_end']).default('period_end'),
      reason: z.string().max(500).optional(),
    }).parse(req.body ?? {});
    const data = await cancelSubscription(req.user!.orgId, id, {
      ...body,
      changedByUserId: req.user!.userId,
    });
    return reply.send({ data });
  });

  app.post('/api/v1/commerce/subscriptions/:id/reactivate', auth, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = await reactivateSubscription(req.user!.orgId, id, req.user!.userId);
    return reply.send({ data });
  });

  app.get('/api/v1/commerce/subscriptions/:id/changes', auth, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = await listSubscriptionChanges(req.user!.orgId, id);
    return reply.send({ data });
  });

  app.delete('/api/v1/commerce/subscriptions/:id', auth, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await softDeleteSubscription(req.user!.orgId, id);
    return reply.code(204).send();
  });

  // Internal endpoint called by the subscription-billing worker cron.
  app.post('/api/v1/internal/subscriptions/generate-due', async (req, reply) => {
    const secret = req.headers['x-internal-secret'];
    if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const body = z.object({ limit: z.number().int().min(1).max(1000).default(100) }).parse(req.body ?? {});
    const result = await runDueInvoiceGeneration(body.limit);
    return reply.send({ data: result });
  });
};

export default commerceSubscriptionRoutes;
