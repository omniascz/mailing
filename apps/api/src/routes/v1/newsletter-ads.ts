import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { newsletterAds, newsletterAdSlots } from '../../db/schema/newsletter-ads.js';

export default async function newsletterAdRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // ── Ad slots ─────────────────────────────────────────────────────────────────

  app.get('/api/v1/newsletter-ads/slots', async (req) => {
    const rows = await db.select().from(newsletterAdSlots)
      .where(eq(newsletterAdSlots.orgId, req.user!.orgId))
      .orderBy(desc(newsletterAdSlots.createdAt));
    return { data: rows };
  });

  const slotSchema = z.object({
    name: z.string().min(1).max(100),
    placementType: z.enum(['banner', 'sponsored_section', 'native_content', 'classified']).default('banner'),
    priceEur: z.number().positive(),
    estimatedReach: z.number().int().min(0).default(0),
  });

  app.post('/api/v1/newsletter-ads/slots', async (req, reply) => {
    const body = slotSchema.parse(req.body);
    const [row] = await db.insert(newsletterAdSlots)
      .values({ orgId: req.user!.orgId, ...body, priceEur: String(body.priceEur) })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.put('/api/v1/newsletter-ads/slots/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = slotSchema.partial().parse(req.body);
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch['name'] = body.name;
    if (body.placementType !== undefined) patch['placementType'] = body.placementType;
    if (body.priceEur !== undefined) patch['priceEur'] = String(body.priceEur);
    if (body.estimatedReach !== undefined) patch['estimatedReach'] = body.estimatedReach;
    const [row] = await db.update(newsletterAdSlots)
      .set(patch as never)
      .where(and(eq(newsletterAdSlots.id, id), eq(newsletterAdSlots.orgId, req.user!.orgId)))
      .returning();
    return { data: row };
  });

  app.delete('/api/v1/newsletter-ads/slots/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db.delete(newsletterAdSlots)
      .where(and(eq(newsletterAdSlots.id, id), eq(newsletterAdSlots.orgId, req.user!.orgId)));
    return reply.status(204).send();
  });

  // ── Ads ────────────────────────────────────────────────────────────────────

  app.get('/api/v1/newsletter-ads', async (req) => {
    const q = z.object({ status: z.string().optional(), slotId: z.string().uuid().optional() }).parse(req.query);
    const conds = [eq(newsletterAds.orgId, req.user!.orgId)];
    if (q.status) conds.push(eq(newsletterAds.status, q.status as 'pending'));
    if (q.slotId) conds.push(eq(newsletterAds.slotId, q.slotId));
    const rows = await db.select().from(newsletterAds).where(and(...conds)).orderBy(desc(newsletterAds.createdAt));
    return { data: rows };
  });

  const adSchema = z.object({
    slotId: z.string().uuid(),
    advertiserName: z.string().min(1).max(200),
    advertiserEmail: z.string().email(),
    headline: z.string().min(1).max(200),
    bodyText: z.string().min(1).max(1000),
    imageUrl: z.string().url().optional(),
    ctaText: z.string().max(50).default('Learn more'),
    ctaUrl: z.string().url(),
    paidEur: z.number().positive().optional(),
    targeting: z.record(z.unknown()).optional(),
    scheduledFor: z.string().datetime().optional(),
  });

  app.post('/api/v1/newsletter-ads', async (req, reply) => {
    const body = adSchema.parse(req.body);
    const [row] = await db.insert(newsletterAds).values({
      orgId: req.user!.orgId,
      slotId: body.slotId,
      advertiserName: body.advertiserName,
      advertiserEmail: body.advertiserEmail,
      headline: body.headline,
      bodyText: body.bodyText,
      imageUrl: body.imageUrl,
      ctaText: body.ctaText,
      ctaUrl: body.ctaUrl,
      paidEur: body.paidEur ? String(body.paidEur) : null,
      targeting: body.targeting ?? {},
      scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
    }).returning();
    return reply.status(201).send({ data: row });
  });

  app.put('/api/v1/newsletter-ads/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = adSchema.partial().extend({ status: z.enum(['pending','approved','active','paused','completed','rejected']).optional() }).parse(req.body);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.advertiserName !== undefined) patch['advertiserName'] = body.advertiserName;
    if (body.headline !== undefined) patch['headline'] = body.headline;
    if (body.bodyText !== undefined) patch['bodyText'] = body.bodyText;
    if (body.imageUrl !== undefined) patch['imageUrl'] = body.imageUrl;
    if (body.ctaText !== undefined) patch['ctaText'] = body.ctaText;
    if (body.ctaUrl !== undefined) patch['ctaUrl'] = body.ctaUrl;
    if (body.paidEur !== undefined) patch['paidEur'] = String(body.paidEur);
    if (body.targeting !== undefined) patch['targeting'] = body.targeting;
    if (body.scheduledFor !== undefined) patch['scheduledFor'] = new Date(body.scheduledFor);
    if (body.status !== undefined) patch['status'] = body.status;
    const [row] = await db.update(newsletterAds)
      .set(patch as never)
      .where(and(eq(newsletterAds.id, id), eq(newsletterAds.orgId, req.user!.orgId)))
      .returning();
    return { data: row };
  });

  // POST /api/v1/newsletter-ads/:id/track-impression
  app.post('/api/v1/newsletter-ads/:id/track-impression', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db.execute(`UPDATE newsletter_ads SET impressions = impressions + 1 WHERE id = '${id}' AND org_id = '${req.user!.orgId}'`);
    return reply.status(204).send();
  });

  // POST /api/v1/newsletter-ads/:id/track-click
  app.post('/api/v1/newsletter-ads/:id/track-click', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db.execute(`UPDATE newsletter_ads SET clicks = clicks + 1 WHERE id = '${id}' AND org_id = '${req.user!.orgId}'`);
    return reply.status(204).send();
  });
}
