import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listPlans,
  getSubscription,
  createCheckoutSession,
  createPortalSession,
  cancelSubscription,
  handleStripeWebhook,
} from '../../services/billing/index.js';
import { getPlanCapacity } from '../../services/billing/plan-enforcement.js';
import { AppError } from '../../lib/app-error.js';

const billingRoutes: FastifyPluginAsync = async (app) => {
  // Public — anyone can browse plans.
  app.get(
    '/api/v1/billing/plans',
    {
      schema: { tags: ['Billing'] },
    },
    async (_req, reply) => {
      return reply.send({ data: listPlans() });
    },
  );

  app.get(
    '/api/v1/billing/subscription',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Billing'] },
    },
    async (req, reply) => {
      return reply.send({ data: await getSubscription(req.user!.orgId) });
    },
  );

  // Current plan capacity (contacts/sends used vs limit). Used by UI
  // banners + the /settings/billing page. Distinct from billing-extended's
  // /billing/usage which surfaces metered product summary (events, AI
  // tokens) — kept as separate path to avoid duplicate-route conflicts.
  app.get(
    '/api/v1/billing/capacity',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Billing'] },
    },
    async (req, reply) => {
      return reply.send({ data: await getPlanCapacity(req.user!.orgId) });
    },
  );

  // Create Stripe Checkout session (owner only).
  app.post(
    '/api/v1/billing/checkout',
    {
      preHandler: [app.authenticate, app.requireRole('owner')],
      schema: { tags: ['Billing'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          tier: z.enum(['starter', 'pro', 'business', 'enterprise']),
          successUrl: z.string().url(),
          cancelUrl: z.string().url(),
        })
        .parse(req.body);
      return reply.send({ data: await createCheckoutSession(req.user!.orgId, body) });
    },
  );

  // Open customer portal (owner only).
  app.post(
    '/api/v1/billing/portal',
    {
      preHandler: [app.authenticate, app.requireRole('owner')],
      schema: { tags: ['Billing'] },
    },
    async (req, reply) => {
      const body = z.object({ returnUrl: z.string().url() }).parse(req.body);
      return reply.send({ data: await createPortalSession(req.user!.orgId, body.returnUrl) });
    },
  );

  // Cancel subscription (owner only).
  app.delete(
    '/api/v1/billing/subscription',
    {
      preHandler: [app.authenticate, app.requireRole('owner')],
      schema: { tags: ['Billing'] },
    },
    async (req, reply) => {
      return reply.send({ data: await cancelSubscription(req.user!.orgId) });
    },
  );

  // Stripe webhook — no auth, signature-verified inside service.
  app.post(
    '/api/v1/billing/webhook',
    {
      schema: { tags: ['Billing'] },
    },
    async (req, reply) => {
      const sig = req.headers['stripe-signature'];
      if (typeof sig !== 'string') throw AppError.badRequest('Missing Stripe-Signature header');

      // Fastify parses body by default; use the raw string if available.
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

      const result = await handleStripeWebhook(rawBody, sig);
      return reply.send(result);
    },
  );
};

export default billingRoutes;
