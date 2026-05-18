/**
 * Campaign analytics service — queries email_events (PostgreSQL) and computes
 * aggregate statistics. In a future phase these aggregations will move to
 * ClickHouse; the interface here stays the same.
 */

import { and, count, countDistinct, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents, campaigns } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CampaignStats {
  sent: number;
  delivered: number;
  deliveryRate: number;
  opens: number;
  uniqueOpens: number;
  openRate: number;
  clicks: number;
  uniqueClicks: number;
  clickRate: number;
  ctor: number; // click-to-open rate
  bounces: number;
  bounceRate: number;
  hardBounces: number;
  softBounces: number;
  unsubs: number;
  unsubRate: number;
  complaints: number;
  complaintRate: number;
}

export interface TimelinePoint {
  timestamp: string;
  sends: number;
  opens: number;
  clicks: number;
  bounces: number;
  unsubs: number;
}

export interface LinkStats {
  url: string;
  clicks: number;
  uniqueClicks: number;
  percentage: number;
}

export interface DeviceStats {
  desktop: number;
  mobile: number;
  tablet: number;
  unknown: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertCampaignExists(campaignId: string, orgId: string) {
  const [row] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .limit(1);
  if (!row) {
    throw AppError.notFound('Campaign not found');
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getCampaignStats(
  campaignId: string,
  orgId: string,
): Promise<CampaignStats> {
  await assertCampaignExists(campaignId, orgId);

  // Count each event type
  const rows = await db
    .select({
      eventType: emailEvents.eventType,
      bounceType: emailEvents.bounceType,
      total: count(),
      uniqueContacts: countDistinct(emailEvents.contactId),
    })
    .from(emailEvents)
    .where(
      and(eq(emailEvents.campaignId, campaignId), eq(emailEvents.orgId, orgId)),
    )
    .groupBy(emailEvents.eventType, emailEvents.bounceType);

  const get = (type: string) => rows.find((r) => r.eventType === type);
  const getUnique = (type: string) =>
    rows.find((r) => r.eventType === type)?.uniqueContacts ?? 0;

  const sent = get('send')?.total ?? 0;
  const delivered = get('deliver')?.total ?? 0;
  const opens = get('open')?.total ?? 0;
  const uniqueOpens = getUnique('open');
  const clicks = get('click')?.total ?? 0;
  const uniqueClicks = getUnique('click');
  const bounceRows = rows.filter((r) => r.eventType === 'bounce');
  const bounces = bounceRows.reduce((a, r) => a + r.total, 0);
  const hardBounces = bounceRows.find((r) => r.bounceType === 'hard')?.total ?? 0;
  const softBounces = bounceRows.find((r) => r.bounceType === 'soft')?.total ?? 0;
  const unsubs = get('unsubscribe')?.total ?? 0;
  const complaints = get('complaint')?.total ?? 0;

  const safeRate = (num: number, denom: number) =>
    denom > 0 ? Math.round((num / denom) * 10000) / 100 : 0;

  return {
    sent,
    delivered,
    deliveryRate: safeRate(delivered, sent),
    opens,
    uniqueOpens,
    openRate: safeRate(uniqueOpens, delivered || sent),
    clicks,
    uniqueClicks,
    clickRate: safeRate(uniqueClicks, delivered || sent),
    ctor: safeRate(uniqueClicks, uniqueOpens),
    bounces,
    bounceRate: safeRate(bounces, sent),
    hardBounces,
    softBounces,
    unsubs,
    unsubRate: safeRate(unsubs, delivered || sent),
    complaints,
    complaintRate: safeRate(complaints, delivered || sent),
  };
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export async function getCampaignTimeline(
  campaignId: string,
  orgId: string,
  interval: 'hour' | 'day',
): Promise<TimelinePoint[]> {
  await assertCampaignExists(campaignId, orgId);

  const truncFn = interval === 'hour' ? 'hour' : 'day';

  const rows = await db.execute(sql`
    SELECT
      date_trunc(${truncFn}, created_at) AS ts,
      event_type,
      COUNT(*) AS cnt
    FROM email_events
    WHERE campaign_id = ${campaignId}
      AND org_id = ${orgId}
    GROUP BY ts, event_type
    ORDER BY ts
  `);

  // Group by timestamp
  const map = new Map<string, TimelinePoint>();

  for (const row of rows as unknown as Array<Record<string, unknown>>) {
    const ts = new Date(row.ts as string).toISOString();
    if (!map.has(ts)) {
      map.set(ts, { timestamp: ts, sends: 0, opens: 0, clicks: 0, bounces: 0, unsubs: 0 });
    }
    const point = map.get(ts)!;
    const cnt = Number(row.cnt);
    switch (row.event_type) {
      case 'send':
        point.sends += cnt;
        break;
      case 'open':
        point.opens += cnt;
        break;
      case 'click':
        point.clicks += cnt;
        break;
      case 'bounce':
        point.bounces += cnt;
        break;
      case 'unsubscribe':
        point.unsubs += cnt;
        break;
    }
  }

  return [...map.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// ─── Link stats ───────────────────────────────────────────────────────────────

export async function getCampaignLinkStats(
  campaignId: string,
  orgId: string,
): Promise<LinkStats[]> {
  await assertCampaignExists(campaignId, orgId);

  const rows = await db
    .select({
      url: emailEvents.linkUrl,
      clicks: count(),
      uniqueClicks: countDistinct(emailEvents.contactId),
    })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.campaignId, campaignId),
        eq(emailEvents.orgId, orgId),
        eq(emailEvents.eventType, 'click'),
      ),
    )
    .groupBy(emailEvents.linkUrl)
    .orderBy(sql`count(*) DESC`);

  const totalClicks = rows.reduce((a, r) => a + r.clicks, 0);

  return rows
    .filter((r) => r.url)
    .map((r) => ({
      url: r.url!,
      clicks: r.clicks,
      uniqueClicks: r.uniqueClicks,
      percentage: totalClicks > 0 ? Math.round((r.clicks / totalClicks) * 10000) / 100 : 0,
    }));
}

// ─── Device stats ─────────────────────────────────────────────────────────────

export async function getCampaignDeviceStats(
  campaignId: string,
  orgId: string,
): Promise<DeviceStats> {
  await assertCampaignExists(campaignId, orgId);

  const rows = await db
    .select({
      deviceType: emailEvents.deviceType,
      cnt: count(),
    })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.campaignId, campaignId),
        eq(emailEvents.orgId, orgId),
        eq(emailEvents.eventType, 'open'),
      ),
    )
    .groupBy(emailEvents.deviceType);

  const get = (type: string) => rows.find((r) => r.deviceType === type)?.cnt ?? 0;

  return {
    desktop: get('desktop'),
    mobile: get('mobile'),
    tablet: get('tablet'),
    unknown: get('unknown') + rows.filter((r) => !r.deviceType).reduce((a, r) => a + r.cnt, 0),
  };
}

// ─── Heatmap data ─────────────────────────────────────────────────────────────

export interface HeatmapData {
  links: Array<{
    url: string;
    clicks: number;
    uniqueClicks: number;
  }>;
  totalClicks: number;
}

export async function getCampaignHeatmapData(
  campaignId: string,
  orgId: string,
): Promise<HeatmapData> {
  await assertCampaignExists(campaignId, orgId);

  const rows = await db
    .select({
      url: emailEvents.linkUrl,
      clicks: count(),
      uniqueClicks: countDistinct(emailEvents.contactId),
    })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.campaignId, campaignId),
        eq(emailEvents.orgId, orgId),
        eq(emailEvents.eventType, 'click'),
      ),
    )
    .groupBy(emailEvents.linkUrl)
    .orderBy(sql`count(*) DESC`);

  const links = rows
    .filter((r) => r.url)
    .map((r) => ({ url: r.url!, clicks: r.clicks, uniqueClicks: r.uniqueClicks }));

  return {
    links,
    totalClicks: links.reduce((a, l) => a + l.clicks, 0),
  };
}

// ─── Comparative reports ──────────────────────────────────────────────────────

export interface CampaignComparison {
  campaign: {
    id: string;
    name: string;
    type: string;
    status: string;
    sentAt: string | null;
    estimatedRecipients: number | null;
  };
  stats: CampaignStats;
}

export async function compareCampaigns(
  orgId: string,
  campaignIds: string[],
): Promise<CampaignComparison[]> {
  if (campaignIds.length === 0) return [];
  if (campaignIds.length > 20) throw AppError.badRequest('Cannot compare more than 20 campaigns at once');

  const { inArray } = await import('drizzle-orm');

  // Fetch campaign metadata — org-scoped
  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      type: campaigns.type,
      status: campaigns.status,
      sentAt: campaigns.sentAt,
      estimatedRecipients: campaigns.estimatedRecipients,
    })
    .from(campaigns)
    .where(and(eq(campaigns.orgId, orgId), inArray(campaigns.id, campaignIds)));

  const found = new Set(rows.map(r => r.id));
  for (const id of campaignIds) {
    if (!found.has(id)) throw AppError.notFound(`Campaign not found: ${id}`);
  }

  // Fetch stats in parallel
  const results = await Promise.all(
    rows.map(async (campaign): Promise<CampaignComparison> => {
      const stats = await getCampaignStats(campaign.id, orgId);
      return {
        campaign: {
          id: campaign.id,
          name: campaign.name,
          type: campaign.type,
          status: campaign.status,
          sentAt: campaign.sentAt?.toISOString() ?? null,
          estimatedRecipients: campaign.estimatedRecipients ?? null,
        },
        stats,
      };
    }),
  );

  // Return in the requested order
  const index = new Map(results.map(r => [r.campaign.id, r]));
  return campaignIds.map(id => index.get(id)!);
}

// ─── Org-level stats (for anomaly detection and dashboards) ──────────────────

export interface OrgDailyStats {
  date: string;
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
  bounces: number;
  unsubs: number;
  complaints: number;
}

export async function getOrgDailyStats(
  orgId: string,
  days: number,
): Promise<OrgDailyStats[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await db.execute(sql`
    SELECT
      date_trunc('day', created_at) AS date,
      event_type,
      COUNT(*) AS cnt
    FROM email_events
    WHERE org_id = ${orgId}
      AND created_at >= ${since.toISOString()}
    GROUP BY date, event_type
    ORDER BY date
  `);

  const map = new Map<string, OrgDailyStats>();

  for (const row of rows as unknown as Array<Record<string, unknown>>) {
    const date = new Date(row.date as string).toISOString().slice(0, 10);
    if (!map.has(date)) {
      map.set(date, { date, sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0, unsubs: 0, complaints: 0 });
    }
    const s = map.get(date)!;
    const cnt = Number(row.cnt);
    switch (row.event_type) {
      case 'send': s.sent += cnt; break;
      case 'deliver': s.delivered += cnt; break;
      case 'open': s.opens += cnt; break;
      case 'click': s.clicks += cnt; break;
      case 'bounce': s.bounces += cnt; break;
      case 'unsubscribe': s.unsubs += cnt; break;
      case 'complaint': s.complaints += cnt; break;
    }
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
