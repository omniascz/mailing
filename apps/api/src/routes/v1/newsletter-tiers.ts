/**
 * Paid newsletter tier management.
 *
 *  GET    /api/v1/newsletter-tiers            — list tiers for org
 *  POST   /api/v1/newsletter-tiers            — create tier
 *  PUT    /api/v1/newsletter-tiers/:id        — update tier
 *  DELETE /api/v1/newsletter-tiers/:id        — deactivate tier
 *  GET    /api/v1/newsletter-tiers/:id/subscribers — list active subscribers
 *  POST   /api/v1/newsletter-tiers/subscribe  — subscribe contact (free tier)
 *  POST   /api/v1/newsletter-tiers/stripe-webhook — handle Stripe events
 *  GET    /api/v1/newsletter-tiers/my         — get current contact's subscriptions (public token auth)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  newsletterTiers,
  newsletterSubscriptions,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { verifyStripeSignature } from '../../services/commerce/payments.js';

const tierCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  priceAmount: z.number().int().min(0),
  currency: z.string().length(3).default('CZK'),
  billingInterval: z.enum(['month', 'year', 'one_time']).default('month'),
  stripePriceId: z.string().optional(),
  benefitsMarkdown: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

const subscribeSchema = z.object({
  contactId: z.string().uuid(),
  tierId: z.string().uuid(),
  stripeSubscriptionId: z.string().optional(),
  stripeCustomerId: z.string().optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
});

// Minimal Stripe webhook event shapes we handle
const stripeEventSchema = z.object({
  type: z.string(),
  data: z.object({ object: z.record(z.unknown()) }),
});

export default async function newsletterTierRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/newsletter-tiers
   */
  app.get(
    '/api/v1/newsletter-tiers',
    { schema: { tags: ['Newsletter Tiers'], summary: 'List newsletter tiers' } },
    async (req) => {
      const orgId = req.user!.orgId;
      const rows = await db
        .select()
        .from(newsletterTiers)
        .where(and(eq(newsletterTiers.orgId, orgId), eq(newsletterTiers.isActive, true)))
        .orderBy(newsletterTiers.sortOrder, newsletterTiers.createdAt);
      return { data: rows };
    },
  );

  /**
   * POST /api/v1/newsletter-tiers
   */
  app.post(
    '/api/v1/newsletter-tiers',
    { schema: { tags: ['Newsletter Tiers'], summary: 'Create newsletter tier' } },
    async (req, reply) => {
      const orgId = req.user!.orgId;
      const body = tierCreateSchema.parse(req.body);

      const [tier] = await db
        .insert(newsletterTiers)
        .values({ orgId, ...body })
        .returning();

      return reply.code(201).send({ data: tier });
    },
  );

  /**
   * PUT /api/v1/newsletter-tiers/:id
   */
  app.put(
    '/api/v1/newsletter-tiers/:id',
    { schema: { tags: ['Newsletter Tiers'], summary: 'Update newsletter tier' } },
    async (req) => {
      const orgId = req.user!.orgId;
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = tierCreateSchema.partial().parse(req.body);

      const existing = await db
        .select()
        .from(newsletterTiers)
        .where(and(eq(newsletterTiers.id, id), eq(newsletterTiers.orgId, orgId)))
        .limit(1);
      if (!existing.length) throw AppError.notFound('Tier');

      const [updated] = await db
        .update(newsletterTiers)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(newsletterTiers.id, id), eq(newsletterTiers.orgId, orgId)))
        .returning();

      return { data: updated };
    },
  );

  /**
   * DELETE /api/v1/newsletter-tiers/:id
   * Soft-deactivates the tier (does not delete existing subscriptions).
   */
  app.delete(
    '/api/v1/newsletter-tiers/:id',
    { schema: { tags: ['Newsletter Tiers'], summary: 'Deactivate newsletter tier' } },
    async (req, reply) => {
      const orgId = req.user!.orgId;
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

      await db
        .update(newsletterTiers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(newsletterTiers.id, id), eq(newsletterTiers.orgId, orgId)));

      return reply.code(204).send();
    },
  );

  /**
   * GET /api/v1/newsletter-tiers/:id/subscribers
   */
  app.get(
    '/api/v1/newsletter-tiers/:id/subscribers',
    { schema: { tags: ['Newsletter Tiers'], summary: 'List subscribers for a tier' } },
    async (req) => {
      const orgId = req.user!.orgId;
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const query = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.string().optional() }).parse(req.query);

      const rows = await db
        .select()
        .from(newsletterSubscriptions)
        .where(
          and(
            eq(newsletterSubscriptions.orgId, orgId),
            eq(newsletterSubscriptions.tierId, id),
            eq(newsletterSubscriptions.status, 'active'),
          ),
        )
        .orderBy(desc(newsletterSubscriptions.createdAt))
        .limit(query.limit + 1);

      const hasMore = rows.length > query.limit;
      const items = hasMore ? rows.slice(0, query.limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]!.id : null;

      return { data: items, nextCursor, hasMore };
    },
  );

  /**
   * POST /api/v1/newsletter-tiers/subscribe
   * Subscribe a contact to a tier (free or after Stripe checkout completes).
   */
  app.post(
    '/api/v1/newsletter-tiers/subscribe',
    { schema: { tags: ['Newsletter Tiers'], summary: 'Subscribe contact to a tier' } },
    async (req, reply) => {
      const orgId = req.user!.orgId;
      const body = subscribeSchema.parse(req.body);

      const tier = await db
        .select()
        .from(newsletterTiers)
        .where(and(eq(newsletterTiers.id, body.tierId), eq(newsletterTiers.orgId, orgId)))
        .limit(1);
      if (!tier.length) throw AppError.notFound('Tier');

      const trialEnd = body.trialDays
        ? new Date(Date.now() + body.trialDays * 86_400_000)
        : undefined;

      const [sub] = await db
        .insert(newsletterSubscriptions)
        .values({
          orgId,
          contactId: body.contactId,
          tierId: body.tierId,
          stripeSubscriptionId: body.stripeSubscriptionId,
          stripeCustomerId: body.stripeCustomerId,
          status: body.trialDays ? 'trialing' : 'active',
          trialEnd,
        })
        .onConflictDoUpdate({
          target: [newsletterSubscriptions.contactId, newsletterSubscriptions.tierId],
          set: {
            status: body.trialDays ? 'trialing' : 'active',
            stripeSubscriptionId: body.stripeSubscriptionId,
            stripeCustomerId: body.stripeCustomerId,
            trialEnd,
            updatedAt: new Date(),
          },
        })
        .returning();

      return reply.code(201).send({ data: sub });
    },
  );

  /**
   * POST /api/v1/newsletter-tiers/stripe-webhook
   * Handle Stripe subscription lifecycle events. The Stripe-Signature header is
   * verified against the raw body (preserved by the global raw-body parser) when
   * STRIPE_WEBHOOK_SECRET is set — a forged event must not be able to flip a
   * subscription to active/canceled/past_due.
   */
  app.post(
    '/api/v1/newsletter-tiers/stripe-webhook',
    { schema: { tags: ['Newsletter Tiers'], summary: 'Stripe subscription webhook' } },
    async (req, reply) => {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (secret) {
        const sig = (req.headers['stripe-signature'] as string) ?? '';
        const raw =
          (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
        if (!verifyStripeSignature(raw, sig, secret)) {
          return reply.code(401).send({ error: 'Invalid Stripe signature' });
        }
      }

      const event = stripeEventSchema.safeParse(req.body);
      if (!event.success) return reply.code(400).send({ error: 'Invalid event' });

      const obj = event.data.data.object as Record<string, unknown>;
      const stripeSubId = typeof obj.id === 'string' ? obj.id : null;
      if (!stripeSubId) return reply.code(200).send({ ok: true });

      let status: 'active' | 'past_due' | 'canceled' | 'paused' | undefined;
      let currentPeriodEnd: Date | undefined;
      let cancelAtPeriodEnd: boolean | undefined;

      switch (event.data.type) {
        case 'customer.subscription.updated':
          status = obj.status as typeof status;
          cancelAtPeriodEnd = obj.cancel_at_period_end as boolean | undefined;
          currentPeriodEnd = typeof obj.current_period_end === 'number'
            ? new Date(obj.current_period_end * 1000)
            : undefined;
          break;
        case 'customer.subscription.deleted':
          status = 'canceled';
          break;
        case 'invoice.payment_failed':
          status = 'past_due';
          break;
        default:
          return reply.code(200).send({ ok: true });
      }

      if (status || currentPeriodEnd || cancelAtPeriodEnd !== undefined) {
        await db
          .update(newsletterSubscriptions)
          .set({
            ...(status ? { status } : {}),
            ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
            ...(cancelAtPeriodEnd !== undefined ? { cancelAtPeriodEnd } : {}),
            updatedAt: new Date(),
          })
          .where(eq(newsletterSubscriptions.stripeSubscriptionId, stripeSubId));
      }

      return reply.code(200).send({ ok: true });
    },
  );

  /**
   * GET /api/v1/newsletter-tiers/check-access?contactId=&tierId=
   * Check if a contact has an active subscription to a given tier.
   * Used by content-gate logic in rendering.
   */
  app.get(
    '/api/v1/newsletter-tiers/check-access',
    { schema: { tags: ['Newsletter Tiers'], summary: 'Check contact tier access' } },
    async (req) => {
      const orgId = req.user!.orgId;
      const { contactId, tierId } = z.object({ contactId: z.string().uuid(), tierId: z.string().uuid() }).parse(req.query);

      const sub = await db
        .select({ status: newsletterSubscriptions.status })
        .from(newsletterSubscriptions)
        .where(
          and(
            eq(newsletterSubscriptions.orgId, orgId),
            eq(newsletterSubscriptions.contactId, contactId),
            eq(newsletterSubscriptions.tierId, tierId),
          ),
        )
        .limit(1);

      const hasAccess = sub.length > 0 && ['active', 'trialing'].includes(sub[0]!.status);
      return { data: { hasAccess, status: sub[0]?.status ?? null } };
    },
  );
}
