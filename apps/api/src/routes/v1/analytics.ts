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
import { env } from '../../config/env.js';
import { z } from 'zod';
import {
  getCampaignStats,
  getCampaignTimeline,
  getCampaignLinkStats,
  getCampaignDeviceStats,
  getCampaignClientStats,
  getCampaignHeatmapData,
  getCampaignPositionalHeatmap,
  compareCampaigns,
} from '../../services/analytics/index.js';
import {
  getCampaignGeoStats,
  getCampaignGeoCityStats,
  getCampaignGeoMap,
} from '../../services/analytics/geo.js';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { revenueEvents, campaigns } from '../../db/schema/index.js';
import { toCsv } from '../../lib/csv.js';
import { renderPdf } from '../../lib/pdf.js';
import { isGeoConfigured } from '../../lib/geo.js';
import { putObject, presignUrl } from '../../lib/object-store.js';

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
   * GET /api/v1/campaigns/:id/report.csv
   * Download the campaign report (summary + per-link clicks) as CSV.
   */
  app.get(
    '/api/v1/campaigns/:id/report.csv',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Export campaign report as CSV',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const orgId = req.user!.orgId;
      const [stats, links] = await Promise.all([
        getCampaignStats(id, orgId),
        getCampaignLinkStats(id, orgId),
      ]);

      // Section 1: flat metric/value summary.
      const summaryRows = Object.entries(stats as unknown as Record<string, unknown>)
        .filter(([, v]) => typeof v !== 'object')
        .map(([metric, value]) => ({ metric, value }));
      const summaryCsv = toCsv(summaryRows, [
        { header: 'Metric', value: 'metric' },
        { header: 'Value', value: 'value' },
      ]);

      // Section 2: per-link clicks.
      const linkCsv = toCsv(links as unknown as Array<Record<string, unknown>>);

      const csv = `# Summary\r\n${summaryCsv}\r\n\r\n# Links\r\n${linkCsv}\r\n`;
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="campaign_${id}_report.csv"`)
        .send(csv);
    },
  );

  /**
   * GET /api/v1/campaigns/:id/report.pdf
   * Download the campaign report (summary + devices + clients + links) as PDF.
   */
  app.get(
    '/api/v1/campaigns/:id/report.pdf',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Export campaign report as PDF',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const orgId = req.user!.orgId;

      const [campaign] = await db
        .select({ name: campaigns.name, subject: campaigns.subject, sentAt: campaigns.sentAt })
        .from(campaigns)
        .where(and(eq(campaigns.id, id), eq(campaigns.orgId, orgId)))
        .limit(1);
      if (!campaign) {
        return reply
          .code(404)
          .send({ code: 'NOT_FOUND', message: 'Campaign not found', statusCode: 404 });
      }

      const [stats, links, devices, clients, geo] = await Promise.all([
        getCampaignStats(id, orgId),
        getCampaignLinkStats(id, orgId),
        getCampaignDeviceStats(id, orgId),
        getCampaignClientStats(id, orgId),
        getCampaignGeoStats(id, orgId),
      ]);

      const summaryRows = Object.entries(stats as unknown as Record<string, unknown>)
        .filter(([, v]) => typeof v !== 'object')
        .map(([metric, value]) => [metric, String(value)] as [string, string]);

      const sentLabel = campaign.sentAt
        ? new Date(campaign.sentAt).toISOString().slice(0, 16).replace('T', ' ')
        : 'not sent';

      const pdf = renderPdf({
        title: campaign.name ?? 'Campaign report',
        subtitle: `Subject: ${campaign.subject ?? '—'}  ·  Sent: ${sentLabel}`,
        sections: [
          { heading: 'Summary', rows: summaryRows },
          {
            heading: 'Devices (opens)',
            rows: [
              ['Desktop', String(devices.desktop)],
              ['Mobile', String(devices.mobile)],
              ['Tablet', String(devices.tablet)],
              ['Unknown', String(devices.unknown)],
            ],
          },
          {
            heading: 'Email clients (opens)',
            columns: ['Client', 'Opens', '%'],
            rows: clients.map((c) => [c.label, String(c.opens), `${c.percentage}%`]),
          },
          {
            heading: 'Top countries',
            columns: ['Country', 'Opens', 'Clicks'],
            rows: geo.slice(0, 15).map((g) => [g.country, String(g.opens), String(g.clicks)]),
          },
          {
            heading: 'Links',
            columns: ['URL', 'Clicks', 'Unique', '%'],
            rows: links.map((l) => [
              l.url,
              String(l.clicks),
              String(l.uniqueClicks),
              `${l.percentage}%`,
            ]),
          },
        ],
      });

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="campaign_${id}_report.pdf"`)
        .send(pdf);
    },
  );

  /**
   * GET /api/v1/account/send-statistics?days=N
   * Account-wide send/delivery/bounce/complaint stats + rates (SES
   * GetSendStatistics equivalent).
   */
  app.get(
    '/api/v1/account/send-statistics',
    { schema: { tags: ['Analytics'], summary: 'Account-level send statistics' } },
    async (req) => {
      const { days } = z
        .object({ days: z.coerce.number().int().min(1).max(365).optional().default(30) })
        .parse(req.query);
      const { getAccountSendStats } = await import('../../services/analytics/account-stats.js');
      return { data: await getAccountSendStats(req.user!.orgId, days) };
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
   * GET /api/v1/campaigns/:id/stats/geo
   * Opens/clicks grouped by country (requires GEOIP_API_URL configured).
   */
  app.get(
    '/api/v1/campaigns/:id/stats/geo',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Get campaign opens/clicks by country',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      // `configured` so the panel can say "GeoIP is not set up" instead of
      // drawing an empty map that looks like a real, sad result.
      return {
        data: await getCampaignGeoStats(id, req.user!.orgId),
        configured: isGeoConfigured(),
      };
    },
  );

  /**
   * GET /api/v1/campaigns/:id/stats/geo/cities
   * Opens/clicks grouped by city (top 100).
   */
  app.get(
    '/api/v1/campaigns/:id/stats/geo/cities',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Get campaign opens/clicks by city',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await getCampaignGeoCityStats(id, req.user!.orgId) };
    },
  );

  /**
   * GET /api/v1/campaigns/:id/stats/geo/map
   * Map-ready country aggregation with normalized intensity for a choropleth.
   */
  app.get(
    '/api/v1/campaigns/:id/stats/geo/map',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Get map-ready country data (choropleth intensity)',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await getCampaignGeoMap(id, req.user!.orgId) };
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

  /**
   * GET /api/v1/campaigns/:id/stats/clients
   * Email-client breakdown for opens (Gmail / Apple Mail / Outlook / …).
   */
  app.get(
    '/api/v1/campaigns/:id/stats/clients',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Get email-client breakdown',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const orgId = req.user!.orgId;
      const clients = await getCampaignClientStats(id, orgId);
      return { data: clients };
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

  /**
   * GET /api/v1/campaigns/:id/heatmap
   * Positional click heat-map — clicks mapped to each link's vertical position
   * in the email body (relativeY 0..1) with intensity, for an overlay render.
   */
  app.get(
    '/api/v1/campaigns/:id/heatmap',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Get positional click heat-map',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const orgId = req.user!.orgId;
      return { data: await getCampaignPositionalHeatmap(id, orgId) };
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

      const key = `screenshots/${orgId}/${id}-${Date.now()}.png`;
      const bucket = env.MINIO_BUCKET;

      // Through the shared client. This built its own S3Client per request with
      // the endpoint hard-coded to http:// — ignoring MINIO_USE_SSL, so against
      // a TLS store it would have talked plaintext to port 9000.
      await putObject(bucket, key, Buffer.from(screenshotBuffer), 'image/png');

      // Presigned, because this URL goes back to a browser that holds no AWS
      // credentials. An hour: long enough to open the report and share the tab,
      // short enough that a link pasted into a ticket stops working.
      const screenshotUrl = await presignUrl('get', bucket, key, 3600);

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
        .where(and(eq(revenueEvents.orgId, orgId), eq(revenueEvents.attributedCampaignId, id)));

      const totalOrders = rows.length;
      const totalRevenue = rows.reduce((s, r) => s + parseFloat(r.amount), 0);
      const currency = rows[0]?.currency ?? 'CZK';

      // Aggregate top SKUs across all orders
      const skuMap = new Map<string, { name: string; qty: number; revenue: number }>();
      for (const row of rows) {
        const items = (row.items ?? []) as Array<{
          sku: string;
          name: string;
          qty: number;
          price: number;
        }>;
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
