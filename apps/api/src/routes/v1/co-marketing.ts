import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, or } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../../db/client.js';
import { coMarketingCampaigns } from '../../db/schema/co-marketing.js';
import { AppError } from '../../lib/app-error.js';

export default async function coMarketingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /** List co-marketing campaigns for this org (as initiator or partner). */
  app.get('/api/v1/co-marketing', async (req) => {
    const rows = await db
      .select()
      .from(coMarketingCampaigns)
      .where(
        or(
          eq(coMarketingCampaigns.initiatorOrgId, req.user!.orgId),
          eq(coMarketingCampaigns.partnerOrgId, req.user!.orgId),
        ),
      )
      .orderBy(desc(coMarketingCampaigns.createdAt));
    return { data: rows };
  });

  const createSchema = z.object({
    partnerOrgId: z.string().uuid(),
    name: z.string().min(1).max(200),
    description: z.string().optional(),
    templateHtml: z.string().optional(),
    initiatorListId: z.string().uuid().optional(),
    initiatorCostShare: z.number().min(0).max(100).default(50),
    scheduledAt: z.string().datetime().optional(),
  });

  app.post('/api/v1/co-marketing', async (req, reply) => {
    const body = createSchema.parse(req.body);
    if (body.partnerOrgId === req.user!.orgId) {
      throw AppError.badRequest('Cannot create co-marketing campaign with yourself');
    }

    const inviteToken = randomUUID();
    const inviteExpiresAt = new Date(Date.now() + 7 * 86400_000);

    const [row] = await db
      .insert(coMarketingCampaigns)
      .values({
        initiatorOrgId: req.user!.orgId,
        partnerOrgId: body.partnerOrgId,
        name: body.name,
        description: body.description,
        templateHtml: body.templateHtml,
        initiatorListId: body.initiatorListId,
        initiatorCostShare: String(body.initiatorCostShare),
        partnerCostShare: String(100 - body.initiatorCostShare),
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        inviteToken,
        inviteExpiresAt,
        status: 'invited',
      })
      .returning();

    return reply.status(201).send({ data: row, inviteToken });
  });

  /** Partner accepts invitation. */
  app.post('/api/v1/co-marketing/accept/:token', async (req) => {
    const { token } = z.object({ token: z.string().uuid() }).parse(req.params);
    const body = z
      .object({ partnerListId: z.string().uuid().optional() })
      .optional()
      .parse(req.body);

    const [campaign] = await db
      .select()
      .from(coMarketingCampaigns)
      .where(
        and(
          eq(coMarketingCampaigns.inviteToken, token),
          eq(coMarketingCampaigns.partnerOrgId, req.user!.orgId),
        ),
      )
      .limit(1);

    if (!campaign) throw AppError.notFound('Invitation not found or expired');
    if (campaign.status !== 'invited')
      throw AppError.badRequest(`Campaign is already ${campaign.status}`);
    if (campaign.inviteExpiresAt && campaign.inviteExpiresAt < new Date()) {
      throw AppError.badRequest('Invitation has expired');
    }

    const [updated] = await db
      .update(coMarketingCampaigns)
      .set({
        status: 'accepted',
        partnerListId: body?.partnerListId,
        updatedAt: new Date(),
      })
      .where(eq(coMarketingCampaigns.id, campaign.id))
      .returning();

    return { data: updated };
  });

  /** Partner rejects invitation. */
  app.post('/api/v1/co-marketing/reject/:token', async (req) => {
    const { token } = z.object({ token: z.string().uuid() }).parse(req.params);
    const [campaign] = await db
      .select()
      .from(coMarketingCampaigns)
      .where(
        and(
          eq(coMarketingCampaigns.inviteToken, token),
          eq(coMarketingCampaigns.partnerOrgId, req.user!.orgId),
        ),
      )
      .limit(1);
    if (!campaign) throw AppError.notFound('Invitation not found');
    await db
      .update(coMarketingCampaigns)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(eq(coMarketingCampaigns.id, campaign.id));
    return { data: { status: 'rejected' } };
  });

  /** Update metrics on a co-marketing campaign. */
  app.put('/api/v1/co-marketing/:id/metrics', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        totalSent: z.number().int().optional(),
        initiatorSent: z.number().int().optional(),
        partnerSent: z.number().int().optional(),
        opens: z.number().int().optional(),
        clicks: z.number().int().optional(),
        conversions: z.number().int().optional(),
      })
      .parse(req.body);

    const [existing] = await db
      .select()
      .from(coMarketingCampaigns)
      .where(
        and(
          eq(coMarketingCampaigns.id, id),
          or(
            eq(coMarketingCampaigns.initiatorOrgId, req.user!.orgId),
            eq(coMarketingCampaigns.partnerOrgId, req.user!.orgId),
          ),
        ),
      )
      .limit(1);
    if (!existing) throw AppError.notFound('Campaign not found');

    const current = (existing.combinedMetrics ?? {}) as Record<string, number>;
    const merged = { ...current, ...body };

    const [updated] = await db
      .update(coMarketingCampaigns)
      .set({ combinedMetrics: merged, updatedAt: new Date() })
      .where(eq(coMarketingCampaigns.id, id))
      .returning();
    return { data: updated };
  });

  app.delete('/api/v1/co-marketing/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db
      .update(coMarketingCampaigns)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(coMarketingCampaigns.id, id),
          eq(coMarketingCampaigns.initiatorOrgId, req.user!.orgId),
        ),
      );
    return reply.status(204).send();
  });
}
