import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  newsletterPlans,
  newsletterPaidSubscriptions as newsletterSubscriptions,
} from '../../db/schema/newsletter-paywall.js';
import { AppError } from '../../lib/app-error.js';

export default async function newsletterPaywallRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // ── Plans ─────────────────────────────────────────────────────────────────

  app.get('/api/v1/newsletter-paywall/plans', async (req) => {
    const rows = await db
      .select()
      .from(newsletterPlans)
      .where(eq(newsletterPlans.orgId, req.user!.orgId))
      .orderBy(desc(newsletterPlans.createdAt));
    return { data: rows };
  });

  const planSchema = z.object({
    name: z.string().min(1).max(100),
    tier: z.enum(['free', 'basic', 'premium', 'vip']),
    priceCzkMonthly: z.number().positive().optional(),
    priceEurMonthly: z.number().positive().optional(),
    stripePriceId: z.string().optional(),
    features: z.array(z.string()).default([]),
  });

  app.post('/api/v1/newsletter-paywall/plans', async (req, reply) => {
    const body = planSchema.parse(req.body);
    const [row] = await db
      .insert(newsletterPlans)
      .values({
        orgId: req.user!.orgId,
        name: body.name,
        tier: body.tier,
        priceCzkMonthly: body.priceCzkMonthly != null ? String(body.priceCzkMonthly) : null,
        priceEurMonthly: body.priceEurMonthly != null ? String(body.priceEurMonthly) : null,
        stripePriceId: body.stripePriceId,
        features: body.features,
      })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.put('/api/v1/newsletter-paywall/plans/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = planSchema.partial().parse(req.body);
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch['name'] = body.name;
    if (body.tier !== undefined) patch['tier'] = body.tier;
    if (body.priceCzkMonthly !== undefined) patch['priceCzkMonthly'] = String(body.priceCzkMonthly);
    if (body.priceEurMonthly !== undefined) patch['priceEurMonthly'] = String(body.priceEurMonthly);
    if (body.stripePriceId !== undefined) patch['stripePriceId'] = body.stripePriceId;
    if (body.features !== undefined) patch['features'] = body.features;
    const [row] = await db
      .update(newsletterPlans)
      .set(patch as never)
      .where(and(eq(newsletterPlans.id, id), eq(newsletterPlans.orgId, req.user!.orgId)))
      .returning();
    return { data: row };
  });

  app.delete('/api/v1/newsletter-paywall/plans/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db
      .update(newsletterPlans)
      .set({ active: false })
      .where(and(eq(newsletterPlans.id, id), eq(newsletterPlans.orgId, req.user!.orgId)));
    return reply.status(204).send();
  });

  // ── Subscriptions ─────────────────────────────────────────────────────────

  app.get('/api/v1/newsletter-paywall/subscriptions', async (req) => {
    const q = z
      .object({ planId: z.string().uuid().optional(), status: z.string().optional() })
      .parse(req.query);
    const conds = [eq(newsletterSubscriptions.orgId, req.user!.orgId)];
    if (q.planId) conds.push(eq(newsletterSubscriptions.planId, q.planId));
    if (q.status) conds.push(eq(newsletterSubscriptions.status, q.status));
    const rows = await db
      .select()
      .from(newsletterSubscriptions)
      .where(and(...conds))
      .orderBy(desc(newsletterSubscriptions.createdAt))
      .limit(500);
    return { data: rows };
  });

  app.post('/api/v1/newsletter-paywall/subscriptions', async (req, reply) => {
    const body = z
      .object({
        contactId: z.string().uuid(),
        planId: z.string().uuid(),
        stripeSubscriptionId: z.string().optional(),
        currentPeriodEnd: z.string().datetime().optional(),
      })
      .parse(req.body);

    const [plan] = await db
      .select({ tier: newsletterPlans.tier })
      .from(newsletterPlans)
      .where(and(eq(newsletterPlans.id, body.planId), eq(newsletterPlans.orgId, req.user!.orgId)))
      .limit(1);
    if (!plan) throw AppError.notFound('Plan not found');

    const [row] = await db
      .insert(newsletterSubscriptions)
      .values({
        orgId: req.user!.orgId,
        contactId: body.contactId,
        planId: body.planId,
        tier: plan.tier,
        stripeSubscriptionId: body.stripeSubscriptionId,
        currentPeriodEnd: body.currentPeriodEnd ? new Date(body.currentPeriodEnd) : null,
      })
      .onConflictDoUpdate({
        target: [
          newsletterSubscriptions.orgId,
          newsletterSubscriptions.contactId,
          newsletterSubscriptions.planId,
        ],
        set: {
          status: 'active',
          stripeSubscriptionId: body.stripeSubscriptionId,
          updatedAt: new Date(),
        },
      })
      .returning();

    return reply.status(201).send({ data: row });
  });

  /** Check if a contact has access to gated content (gate by tier). */
  app.get('/api/v1/newsletter-paywall/check-access', async (req) => {
    const q = z
      .object({
        contactId: z.string().uuid(),
        requiredTier: z.enum(['free', 'basic', 'premium', 'vip']),
      })
      .parse(req.query);
    const tierOrder = ['free', 'basic', 'premium', 'vip'];
    const requiredLevel = tierOrder.indexOf(q.requiredTier);

    const subs = await db
      .select({ tier: newsletterSubscriptions.tier })
      .from(newsletterSubscriptions)
      .where(
        and(
          eq(newsletterSubscriptions.orgId, req.user!.orgId),
          eq(newsletterSubscriptions.contactId, q.contactId),
          eq(newsletterSubscriptions.status, 'active'),
        ),
      );

    const hasAccess = subs.some((s) => tierOrder.indexOf(s.tier) >= requiredLevel);
    const highestTier = subs.reduce((best, s) => {
      return tierOrder.indexOf(s.tier) > tierOrder.indexOf(best) ? s.tier : best;
    }, 'free' as string);

    return { data: { hasAccess, contactTier: highestTier, requiredTier: q.requiredTier } };
  });

  /** Cancel subscription (Stripe webhook or manual). */
  app.post('/api/v1/newsletter-paywall/subscriptions/:id/cancel', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [row] = await db
      .update(newsletterSubscriptions)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(newsletterSubscriptions.id, id), eq(newsletterSubscriptions.orgId, req.user!.orgId)),
      )
      .returning();
    return { data: row };
  });
}
