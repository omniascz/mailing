import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../../db/client.js';
import { competitorWatchlist, competitorEmails } from '../../db/schema/competitive-monitor.js';
import { AppError } from '../../lib/app-error.js';
import { callClaude } from '../../lib/ai-client.js';

export default async function competitiveMonitorRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // ── Watchlist CRUD ─────────────────────────────────────────────────────────

  app.get('/api/v1/competitive-monitor', async (req) => {
    const rows = await db.select().from(competitorWatchlist)
      .where(eq(competitorWatchlist.orgId, req.user!.orgId))
      .orderBy(desc(competitorWatchlist.createdAt));
    return { data: rows };
  });

  app.post('/api/v1/competitive-monitor', async (req, reply) => {
    const body = z.object({
      competitorName: z.string().min(1).max(100),
      competitorDomain: z.string().min(3).max(200),
    }).parse(req.body);

    // Generate a unique monitor inbox address for this competitor
    const monitorEmail = `monitor-${randomUUID().slice(0, 8)}@inbox.forgemsg.io`;

    const [row] = await db.insert(competitorWatchlist).values({
      orgId: req.user!.orgId,
      competitorName: body.competitorName,
      competitorDomain: body.competitorDomain,
      monitorEmail,
    }).returning();

    return reply.status(201).send({ data: row, instruction: `Subscribe to ${body.competitorName} using ${monitorEmail}` });
  });

  app.delete('/api/v1/competitive-monitor/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db.update(competitorWatchlist)
      .set({ active: false })
      .where(and(eq(competitorWatchlist.id, id), eq(competitorWatchlist.orgId, req.user!.orgId)));
    return reply.status(204).send();
  });

  // ── Captured emails ────────────────────────────────────────────────────────

  app.get('/api/v1/competitive-monitor/:watchlistId/emails', async (req) => {
    const { watchlistId } = z.object({ watchlistId: z.string().uuid() }).parse(req.params);
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
    const rows = await db.select().from(competitorEmails)
      .where(and(eq(competitorEmails.orgId, req.user!.orgId), eq(competitorEmails.watchlistId, watchlistId)))
      .orderBy(desc(competitorEmails.receivedAt))
      .limit(q.limit);
    return { data: rows };
  });

  /** Internal hook — receive forwarded competitor email. */
  app.post('/api/v1/competitive-monitor/ingest', { config: { internalOnly: true } }, async (req, reply) => {
    const body = z.object({
      monitorEmail: z.string().email(),
      fromName: z.string().optional(),
      fromEmail: z.string().email().optional(),
      subjectLine: z.string(),
      preheader: z.string().optional(),
      bodyHtml: z.string().optional(),
      receivedAt: z.string().datetime().optional(),
    }).parse(req.body);

    const [watchEntry] = await db.select().from(competitorWatchlist)
      .where(and(eq(competitorWatchlist.monitorEmail, body.monitorEmail), eq(competitorWatchlist.active, true)))
      .limit(1);
    if (!watchEntry) return reply.status(200).send({ ignored: true });

    // AI analysis
    let analysis = null;
    try {
      const aiResult = await callClaude({
        model: 'claude-haiku-4-5-20251001',
        feature: 'other',
        tenantId: watchEntry.orgId,
        system: `Analyze this competitor marketing email. Return JSON: { "hasPromotion": bool, "discountPercent": number|null, "primaryCta": string|null, "topics": string[], "sentimentScore": -1to1, "sendDayOfWeek": 0-6, "sendHour": 0-23 }`,
        user: `Subject: ${body.subjectLine}\nFrom: ${body.fromName ?? ''} <${body.fromEmail ?? ''}>\nBody: ${(body.bodyHtml ?? '').replace(/<[^>]+>/g, ' ').slice(0, 1500)}`,
        maxTokens: 256,
      });
      analysis = JSON.parse(aiResult.text);
    } catch { /* analysis stays null */ }

    const now = body.receivedAt ? new Date(body.receivedAt) : new Date();

    await db.insert(competitorEmails).values({
      orgId: watchEntry.orgId,
      watchlistId: watchEntry.id,
      subjectLine: body.subjectLine,
      fromName: body.fromName,
      fromEmail: body.fromEmail,
      bodyHtml: body.bodyHtml,
      preheader: body.preheader,
      analysis,
      receivedAt: now,
    });

    await db.execute(
      sql`UPDATE competitor_watchlist SET total_emails_received = total_emails_received + 1, last_email_received_at = ${now.toISOString()} WHERE id = ${watchEntry.id}`,
    );

    return reply.status(200).send({ ingested: true });
  });

  /** Analytics: frequency, send patterns, top topics for a competitor. */
  app.get('/api/v1/competitive-monitor/:watchlistId/analytics', async (req) => {
    const { watchlistId } = z.object({ watchlistId: z.string().uuid() }).parse(req.params);
    const d90 = new Date(Date.now() - 90 * 86400_000);

    const [entry] = await db.select().from(competitorWatchlist)
      .where(and(eq(competitorWatchlist.id, watchlistId), eq(competitorWatchlist.orgId, req.user!.orgId)))
      .limit(1);
    if (!entry) throw AppError.notFound('Watchlist entry not found');

    const emails = await db.select({
      id: competitorEmails.id,
      subjectLine: competitorEmails.subjectLine,
      analysis: competitorEmails.analysis,
      receivedAt: competitorEmails.receivedAt,
    }).from(competitorEmails)
      .where(and(eq(competitorEmails.watchlistId, watchlistId), gte(competitorEmails.receivedAt, d90)))
      .orderBy(desc(competitorEmails.receivedAt));

    const total = emails.length;
    const weeklyFreq = total / 13; // ~13 weeks in 90 days

    const allTopics = emails.flatMap((e) => (e.analysis as { topics?: string[] } | null)?.topics ?? []);
    const topicCounts: Record<string, number> = {};
    for (const t of allTopics) topicCounts[t] = (topicCounts[t] ?? 0) + 1;
    const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, c]) => ({ topic: t, count: c }));

    const promotions = emails.filter((e) => (e.analysis as { hasPromotion?: boolean } | null)?.hasPromotion).length;

    return {
      data: {
        competitor: entry.competitorName,
        totalEmails90d: total,
        weeklyFrequency: Math.round(weeklyFreq * 10) / 10,
        promotionRatio: total > 0 ? promotions / total : 0,
        topTopics,
        recentSubjects: emails.slice(0, 10).map((e) => ({ subject: e.subjectLine, receivedAt: e.receivedAt })),
      },
    };
  });
}
