/**
 * Campaign analytics service. Reads from ClickHouse (email_events_daily rollup)
 * when CLICKHOUSE_ENABLED=true, falling back to PostgreSQL aggregation otherwise
 * — same interface, same result shapes either way.
 */

import { and, count, countDistinct, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents, campaigns } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { EMAIL_CLIENT_LABELS } from '../../lib/user-agent.js';
import { isClickHouseEnabled } from './clickhouse/client.js';
import { chCampaignEventRows, chOrgDailyRows } from './clickhouse/queries.js';

interface CampaignEventRow {
  eventType: string;
  bounceType: string | null;
  total: number;
  uniqueContacts: number;
}

/** Pure: fold grouped event rows into the CampaignStats shape. */
export function computeCampaignStats(rows: CampaignEventRow[]): CampaignStats {
  const get = (type: string) => rows.find((r) => r.eventType === type);
  const getUnique = (type: string) => rows.find((r) => r.eventType === type)?.uniqueContacts ?? 0;

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

/** Pure: fold per-(day,event_type) counts into the OrgDailyStats series. */
export function aggregateOrgDaily(rows: Array<{ date: string; eventType: string; cnt: number }>): OrgDailyStats[] {
  const map = new Map<string, OrgDailyStats>();
  for (const row of rows) {
    const date = row.date.slice(0, 10);
    if (!map.has(date)) {
      map.set(date, { date, sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0, unsubs: 0, complaints: 0 });
    }
    const s = map.get(date)!;
    switch (row.eventType) {
      case 'send': s.sent += row.cnt; break;
      case 'deliver': s.delivered += row.cnt; break;
      case 'open': s.opens += row.cnt; break;
      case 'click': s.clicks += row.cnt; break;
      case 'bounce': s.bounces += row.cnt; break;
      case 'unsubscribe': s.unsubs += row.cnt; break;
      case 'complaint': s.complaints += row.cnt; break;
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

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

export interface ClientStat {
  /** Normalized client id (e.g. "gmail"), or "unknown" for unattributed opens. */
  client: string;
  label: string;
  opens: number;
  percentage: number;
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

async function pgCampaignEventRows(campaignId: string, orgId: string): Promise<CampaignEventRow[]> {
  const rows = await db
    .select({
      eventType: emailEvents.eventType,
      bounceType: emailEvents.bounceType,
      total: count(),
      uniqueContacts: countDistinct(emailEvents.contactId),
    })
    .from(emailEvents)
    .where(and(eq(emailEvents.campaignId, campaignId), eq(emailEvents.orgId, orgId)))
    .groupBy(emailEvents.eventType, emailEvents.bounceType);
  return rows.map((r) => ({
    eventType: String(r.eventType),
    bounceType: r.bounceType ? String(r.bounceType) : null,
    total: Number(r.total),
    uniqueContacts: Number(r.uniqueContacts),
  }));
}

export async function getCampaignStats(campaignId: string, orgId: string): Promise<CampaignStats> {
  await assertCampaignExists(campaignId, orgId);

  let rows: CampaignEventRow[];
  if (isClickHouseEnabled()) {
    try {
      rows = await chCampaignEventRows(campaignId, orgId);
    } catch {
      rows = await pgCampaignEventRows(campaignId, orgId); // ClickHouse down → Postgres
    }
  } else {
    rows = await pgCampaignEventRows(campaignId, orgId);
  }

  return computeCampaignStats(rows);
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

// ─── Email-client stats ─────────────────────────────────────────────────────────

export async function getCampaignClientStats(
  campaignId: string,
  orgId: string,
): Promise<ClientStat[]> {
  await assertCampaignExists(campaignId, orgId);

  const rows = await db
    .select({
      client: emailEvents.emailClient,
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
    .groupBy(emailEvents.emailClient);

  const total = rows.reduce((a, r) => a + r.cnt, 0);
  // Fold nulls into a single "unknown" bucket.
  const byClient = new Map<string, number>();
  for (const r of rows) {
    const key = r.client ?? 'unknown';
    byClient.set(key, (byClient.get(key) ?? 0) + r.cnt);
  }

  return [...byClient.entries()]
    .map(([client, opens]) => ({
      client,
      label: client === 'unknown' ? 'Unknown' : (EMAIL_CLIENT_LABELS[client] ?? client),
      opens,
      percentage: total > 0 ? Math.round((opens / total) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.opens - a.opens);
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

// ─── Positional heatmap ─────────────────────────────────────────────────────────

export interface PositionalHeatmapLink {
  url: string;
  clicks: number;
  uniqueClicks: number;
  /** 1-based order the link appears in the email body (by HTML offset). */
  ordinal: number;
  /** Vertical position 0..1 (0 = top of email, 1 = bottom), or null if unlocatable. */
  relativeY: number | null;
  /** Click intensity 0..1 relative to the most-clicked link. */
  intensity: number;
}

export interface PositionalHeatmap {
  links: PositionalHeatmapLink[];
  totalClicks: number;
  /** True when at least one link could be located in the HTML body. */
  hasPositions: boolean;
}

/**
 * Pure computation: map link click stats to positions within an HTML body.
 * Extracted from the DB function so it can be unit-tested directly.
 */
export function computePositionalHeatmap(
  links: Array<{ url: string; clicks: number; uniqueClicks: number }>,
  html: string,
): PositionalHeatmap {
  const htmlLen = html.length;
  const maxClicks = links.reduce((m, l) => Math.max(m, l.clicks), 0);

  const withPos = links.map((l) => {
    const offset = htmlLen > 0 ? html.indexOf(l.url) : -1;
    const relativeY =
      offset >= 0 && htmlLen > 0 ? Math.round((offset / htmlLen) * 1000) / 1000 : null;
    return {
      ...l,
      offset,
      relativeY,
      intensity: maxClicks > 0 ? Math.round((l.clicks / maxClicks) * 1000) / 1000 : 0,
    };
  });

  // Sort by document position (located links first, in order; unlocatable last).
  withPos.sort((a, b) => {
    if (a.offset < 0 && b.offset < 0) return b.clicks - a.clicks;
    if (a.offset < 0) return 1;
    if (b.offset < 0) return -1;
    return a.offset - b.offset;
  });

  return {
    links: withPos.map(({ offset: _offset, ...rest }, i) => ({ ...rest, ordinal: i + 1 })),
    totalClicks: links.reduce((a, l) => a + l.clicks, 0),
    hasPositions: withPos.some((l) => l.relativeY !== null),
  };
}

/**
 * Positional click heat-map: maps each clicked link to its vertical position in
 * the email body (derived from the link's byte offset in the stored HTML), so an
 * overlay can shade WHERE in the email people click — not just which URL.
 *
 * Works entirely from data already captured (click events + campaign HTML); no
 * send-path re-instrumentation required. Links not found in the HTML (e.g. from
 * a since-edited draft) get relativeY=null and sort to the end.
 */
export async function getCampaignPositionalHeatmap(
  campaignId: string,
  orgId: string,
): Promise<PositionalHeatmap> {
  await assertCampaignExists(campaignId, orgId);

  const [campaign] = await db
    .select({ content: campaigns.content })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .limit(1);

  const html = ((campaign?.content ?? {}) as { html?: string }).html ?? '';
  const base = await getCampaignHeatmapData(campaignId, orgId);
  return computePositionalHeatmap(base.links, html);
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
  if (campaignIds.length > 20)
    throw AppError.badRequest('Cannot compare more than 20 campaigns at once');

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

  const found = new Set(rows.map((r) => r.id));
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
  const index = new Map(results.map((r) => [r.campaign.id, r]));
  return campaignIds.map((id) => index.get(id)!);
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

async function pgOrgDailyRows(
  orgId: string,
  days: number,
): Promise<Array<{ date: string; eventType: string; cnt: number }>> {
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
  return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
    date: new Date(row.date as string).toISOString().slice(0, 10),
    eventType: String(row.event_type),
    cnt: Number(row.cnt),
  }));
}

export async function getOrgDailyStats(orgId: string, days: number): Promise<OrgDailyStats[]> {
  let rows: Array<{ date: string; eventType: string; cnt: number }>;
  if (isClickHouseEnabled()) {
    try {
      rows = await chOrgDailyRows(orgId, days);
    } catch {
      rows = await pgOrgDailyRows(orgId, days); // ClickHouse down → Postgres
    }
  } else {
    rows = await pgOrgDailyRows(orgId, days);
  }
  return aggregateOrgDaily(rows);
}
