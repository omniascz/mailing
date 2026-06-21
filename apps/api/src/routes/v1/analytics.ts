/**
 * Campaign analytics routes (4.2 + 4.3):
 *
 *  GET  /api/v1/campaigns/:id/stats               — aggregate stats
 *  GET  /api/v1/campaigns/:id/stats/timeline       — time-series (hour|day)
 *  GET  /api/v1/campaigns/:id/stats/links          — per-link clicks
 *  GET  /api/v1/campaigns/:id/stats/devices        — device breakdown
 *  GET  /api/v1/campaigns/:id/heatmap-data         — link click counts for overlay
 *  POST /api/v1/campaigns/:id/screenshot           — Puppeteer screenshot → S3
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getCampaignStats,
  getCampaignTimeline,
  getCampaignLinkStats,
  getCampaignDeviceStats,
  getCampaignHeatmapData,
  compareCampaigns,
} from '../../services/analytics/index.js';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { revenueEvents } from '../../db/schema/index.js';

const idParam = z.object({ id: z.string().uuid() });

export default async function analyticsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // ─── 4.2 ─────────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/campaigns/:id/stats
   * Aggregate campaign statistics.
   */
  app.get(
    '/api/v1/campaigns/:id/stats',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Get campaign aggregate stats',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const orgId = req.user!.orgId;
      const stats = await getCampaignStats(id, orgId);
      return { data: stats };
    },
  );

  /**
   * GET /api/v1/campaigns/:id/stats/timeline?interval=hour|day
   * Time-series breakdown of events.
   */
  app.get(
    '/api/v1/campaigns/:id/stats/timeline',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Get campaign stats timeline',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
        querystring: {
          type: 'object',
          properties: { interval: { type: 'string', enum: ['hour', 'day'] } },
        },
      },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const { interval = 'day' } = z
        .object({ interval: z.enum(['hour', 'day']).optional().default('day') })
        .parse(req.query);
      const orgId = req.user!.orgId;
      const points = await getCampaignTimeline(id, orgId, interval);
      return { data: points };
    },
  );

  /**
   * GET /api/v1/campaigns/:id/stats/links
   * Per-link click statistics.
   */
  app.get(
    '/api/v1/campaigns/:id/stats/links',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Get per-link click stats',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const orgId = req.user!.orgId;
      const links = await getCampaignLinkStats(id, orgId);
      return { data: links };
    },
  );

  /**
   * GET /api/v1/campaigns/:id/stats/devices
   * Device type breakdown for opens.
   */
  app.get(
    '/api/v1/campaigns/:id/stats/devices',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Get device breakdown',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const orgId = req.user!.orgId;
      const devices = await getCampaignDeviceStats(id, orgId);
      return { data: devices };
    },
  );

  // ─── 4.3 Heatmap ─────────────────────────────────────────────────────────

  /**
   * GET /api/v1/campaigns/:id/heatmap-data
   * Returns per-link click counts for heatmap overlay.
   */
  app.get(
    '/api/v1/campaigns/:id/heatmap-data',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Get heatmap click data',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const orgId = req.user!.orgId;
      const heatmap = await getCampaignHeatmapData(id, orgId);
      return { data: heatmap };
    },
  );

  // ─── 4.x Comparative reports ─────────────────────────────────────────────

  /**
   * GET /api/v1/analytics/compare?ids=id1,id2,...
   * Compare up to 20 campaigns side by side.
   */
  app.get(
    '/api/v1/analytics/compare',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Compare multiple campaigns',
        querystring: {
          type: 'object',
          required: ['ids'],
          properties: { ids: { type: 'string', description: 'Comma-separated campaign UUIDs' } },
        },
      },
    },
    async (req) => {
      const { ids } = z.object({ ids: z.string().min(1) }).parse(req.query);
      const campaignIds = ids
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      z.array(z.string().uuid()).min(1).max(20).parse(campaignIds);
      const orgId = req.user!.orgId;
      return { data: await compareCampaigns(orgId, campaignIds) };
    },
  );

  /**
   * POST /api/v1/campaigns/:id/screenshot
   * Captures a screenshot of the campaign email for heatmap overlay.
   * Returns the screenshot URL stored in S3/MinIO.
   *
   * Note: requires MINIO_ENDPOINT + puppeteer to be available.
   * Responds with 501 if puppeteer is not installed.
   */
  app.post(
    '/api/v1/campaigns/:id/screenshot',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Capture campaign screenshot for heatmap',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const orgId = req.user!.orgId;

      let puppeteer: {
        launch: (...args: unknown[]) => Promise<{
          newPage: () => Promise<{
            setViewport: (v: { width: number; height: number }) => Promise<void>;
            setContent: (h: string, o: unknown) => Promise<void>;
            screenshot: (o: unknown) => Promise<Buffer>;
          }>;
          close: () => Promise<void>;
        }>;
      } | null = null;
      try {
        const mod = await import('puppeteer');
        puppeteer = mod.default as unknown as typeof puppeteer;
      } catch {
        return {
          data: {
            screenshotUrl: null,
            message:
              'Puppeteer is not installed. Install it with: pnpm add puppeteer --filter @forgemsg/api',
          },
        };
      }

      // Fetch campaign HTML
      const { db } = await import('../../db/client.js');
      const { campaigns } = await import('../../db/schema/index.js');
      const { eq, and } = await import('drizzle-orm');

      const [campaign] = await db
        .select({ content: campaigns.content })
        .from(campaigns)
        .where(and(eq(campaigns.id, id), eq(campaigns.orgId, orgId)))
        .limit(1);

      if (!campaign) {
        const { AppError } = await import('../../lib/app-error.js');
        throw AppError.notFound('Campaign not found');
      }

      const html =
        typeof campaign.content === 'object' && campaign.content !== null
          ? ((campaign.content as Record<string, unknown>).html as string | undefined)
          : undefined;

      if (!html) {
        return {
          data: {
            screenshotUrl: null,
            message: 'Campaign has no rendered HTML content yet',
          },
        };
      }

      const browser = await puppeteer!.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 600, height: 800 });
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'png' });
      await browser.close();

      // Upload to MinIO/S3
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({
        endpoint: `http://${process.env.MINIO_ENDPOINT ?? 'localhost'}:${process.env.MINIO_PORT ?? 9000}`,
        region: 'us-east-1',
        credentials: {
          accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
          secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
        },
        forcePathStyle: true,
      });

      const key = `screenshots/${orgId}/${id}-${Date.now()}.png`;
      const bucket = process.env.MINIO_BUCKET ?? 'forgemsg';

      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: screenshotBuffer,
          ContentType: 'image/png',
        }),
      );

      const screenshotUrl = `http://${process.env.MINIO_ENDPOINT ?? 'localhost'}:${process.env.MINIO_PORT ?? 9000}/${bucket}/${key}`;

      return { data: { screenshotUrl } };
    },
  );

  /**
   * GET /api/v1/campaigns/:id/revenue
   * Revenue attributed to this campaign (last-touch, 30-day window by default).
   * Returns: totalOrders, totalRevenue, currency, revenuePerSend, topItems.
   */
  app.get(
    '/api/v1/campaigns/:id/revenue',
    { schema: { tags: ['Analytics'], summary: 'Campaign revenue attribution' } },
    async (req) => {
      const orgId = req.user!.orgId;
      const { id } = idParam.parse(req.params);

      const rows = await db
        .select({
          orderId: revenueEvents.orderId,
          amount: revenueEvents.amount,
          currency: revenueEvents.currency,
          items: revenueEvents.items,
          occurredAt: revenueEvents.occurredAt,
        })
        .from(revenueEvents)
        .where(
          and(
            eq(revenueEvents.orgId, orgId),
            eq(revenueEvents.attributedCampaignId, id),
          ),
        );

      const totalOrders = rows.length;
      const totalRevenue = rows.reduce((s, r) => s + parseFloat(r.amount), 0);
      const currency = rows[0]?.currency ?? 'CZK';

      // Aggregate top SKUs across all orders
      const skuMap = new Map<string, { name: string; qty: number; revenue: number }>();
      for (const row of rows) {
        const items = (row.items ?? []) as Array<{ sku: string; name: string; qty: number; price: number }>;
        for (const item of items) {
          const existing = skuMap.get(item.sku) ?? { name: item.name, qty: 0, revenue: 0 };
          skuMap.set(item.sku, {
            name: item.name,
            qty: existing.qty + item.qty,
            revenue: existing.revenue + item.qty * item.price,
          });
        }
      }
      const topItems = [...skuMap.entries()]
        .map(([sku, v]) => ({ sku, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      // Revenue per send = revenue / total sends (fetched from campaign stats)
      const sendCountRow = await db.execute<{ cnt: string }>(sql`
        SELECT COUNT(*)::text AS cnt FROM email_events
        WHERE org_id = ${orgId}::uuid AND campaign_id = ${id}::uuid AND event_type = 'send'
      `);
      const totalSends = Number((sendCountRow as unknown as Array<{ cnt: string }>)[0]?.cnt ?? 0);
      const revenuePerSend = totalSends > 0 ? totalRevenue / totalSends : 0;

      return {
        data: {
          campaignId: id,
          totalOrders,
          totalRevenue: Number(totalRevenue.toFixed(2)),
          currency,
          revenuePerSend: Number(revenuePerSend.toFixed(4)),
          topItems,
        },
      };
    },
  );
}
