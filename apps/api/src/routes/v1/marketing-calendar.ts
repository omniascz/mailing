/**
 * Marketing calendar — unified view of upcoming + recent email, SMS,
 * WhatsApp, workflow-triggered and social posts for a given date range (#295).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, gte, lte, sql, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { campaigns, rssCampaigns, socialPosts, socialAccounts } from '../../db/schema/index.js';

interface CalendarEntry {
  type: 'campaign' | 'rss' | 'workflow' | 'social_post';
  id: string;
  name: string;
  channel: string;
  status: string;
  startsAt: string;
  endsAt?: string | null;
  meta?: Record<string, unknown>;
}

const calendarRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/marketing-calendar', {
    preHandler: [app.authenticate],
    schema: { tags: ['Marketing Calendar'] },
  }, async (req, reply) => {
    const q = z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
    }).parse(req.query);

    const from = new Date(q.from);
    const to = new Date(q.to);

    const cps = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        type: campaigns.type,
        status: campaigns.status,
        scheduledAt: campaigns.scheduledAt,
        sentAt: campaigns.sentAt,
      })
      .from(campaigns)
      .where(and(
        eq(campaigns.orgId, req.user!.orgId),
        sql`COALESCE(${campaigns.scheduledAt}, ${campaigns.sentAt}) BETWEEN ${from} AND ${to}`,
      ));

    const rss = await db
      .select()
      .from(rssCampaigns)
      .where(and(
        eq(rssCampaigns.orgId, req.user!.orgId),
        gte(rssCampaigns.nextRunAt, from),
        lte(rssCampaigns.nextRunAt, to),
      ));

    // Social posts in range
    const socialPostRows = await db
      .select()
      .from(socialPosts)
      .where(and(
        eq(socialPosts.orgId, req.user!.orgId),
        inArray(socialPosts.status, ['scheduled', 'published']),
        sql`COALESCE(${socialPosts.scheduledAt}, ${socialPosts.publishedAt}) BETWEEN ${from} AND ${to}`,
      ));

    // Resolve account platforms for display
    const allAccountIds = [...new Set(socialPostRows.flatMap(p => p.accountIds as string[]))];
    const accountRows = allAccountIds.length
      ? await db.select({ id: socialAccounts.id, platform: socialAccounts.platform, displayName: socialAccounts.displayName }).from(socialAccounts).where(inArray(socialAccounts.id, allAccountIds))
      : [];
    const accountMap = Object.fromEntries(accountRows.map(a => [a.id, a]));

    const entries: CalendarEntry[] = [
      ...cps.map((c): CalendarEntry => ({
        type: 'campaign',
        id: c.id,
        name: c.name,
        channel: c.type,
        status: c.status,
        startsAt: (c.scheduledAt ?? c.sentAt ?? new Date()).toISOString(),
      })),
      ...rss.map((r): CalendarEntry => ({
        type: 'rss',
        id: r.id,
        name: r.name,
        channel: 'email',
        status: r.active ? 'active' : 'paused',
        startsAt: (r.nextRunAt ?? new Date()).toISOString(),
      })),
      ...socialPostRows.map((p): CalendarEntry => {
        const accountIdList = p.accountIds as string[];
        const platforms = [...new Set(accountIdList.map(id => accountMap[id]?.platform).filter(Boolean))];
        return {
          type: 'social_post',
          id: p.id,
          name: (p.caption as string | null)?.slice(0, 80) ?? 'Social post',
          channel: platforms.join(',') || 'social',
          status: p.status,
          startsAt: (p.scheduledAt ?? p.publishedAt ?? p.createdAt).toISOString(),
          meta: { platforms, mediaCount: (p.mediaUrls as string[]).length },
        };
      }),
    ];

    entries.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return reply.send({ data: entries });
  });

  // ── Reschedule (drag-to-reschedule from calendar UI) ─────────────────────
  app.patch('/api/v1/marketing-calendar/:type/:id/reschedule', {
    preHandler: [app.authenticate],
    schema: { tags: ['Marketing Calendar'] },
  }, async (req, reply) => {
    const { type, id } = z.object({ type: z.enum(['campaign', 'social_post']), id: z.string().uuid() }).parse(req.params);
    const { scheduledAt } = z.object({ scheduledAt: z.string().datetime() }).parse(req.body);
    const orgId = req.user!.orgId;

    if (type === 'social_post') {
      await db
        .update(socialPosts)
        .set({ scheduledAt: new Date(scheduledAt), updatedAt: new Date() })
        .where(and(eq(socialPosts.orgId, orgId), eq(socialPosts.id, id)));
    } else {
      await db
        .update(campaigns)
        .set({ scheduledAt: new Date(scheduledAt) })
        .where(and(eq(campaigns.orgId, orgId), eq(campaigns.id, id)));
    }
    return reply.send({ data: { id, scheduledAt } });
  });
};

export default calendarRoutes;
