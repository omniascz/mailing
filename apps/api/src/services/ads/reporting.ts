/**
 * Ad performance reporting (#305).
 * Fetches daily metrics from each platform, stores unified snapshots.
 */

import { eq, and, gte, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { adAccounts, adPerformanceSnapshots } from '../../db/schema/index.js';

import type { AdPlatform } from '../../db/schema/ad-accounts.js';

interface AdMetrics {
  campaignId: string;
  campaignName: string;
  adSetId?: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
}

// ── Platform fetchers ─────────────────────────────────────────────────────────

async function fetchFacebookMetrics(account: typeof adAccounts.$inferSelect, date: string): Promise<AdMetrics[]> {
  const fields = 'campaign_id,campaign_name,adset_id,impressions,clicks,spend,actions,action_values';
  const res = await fetch(
    `https://graph.facebook.com/v19.0/act_${account.platformAccountId}/insights?fields=${fields}&time_range[since]=${date}&time_range[until]=${date}&level=adset&access_token=${account.accessToken}`,
  );
  if (!res.ok) return [];
  const json = await res.json() as { data?: Array<Record<string, unknown>> };
  return (json.data ?? []).map(row => {
    const actions = (row.actions as Array<{ action_type: string; value: string }>) ?? [];
    const actionValues = (row.action_values as Array<{ action_type: string; value: string }>) ?? [];
    const conversions = actions.filter(a => a.action_type === 'purchase').reduce((s, a) => s + parseFloat(a.value ?? '0'), 0);
    const revenue = actionValues.filter(a => a.action_type === 'purchase').reduce((s, a) => s + parseFloat(a.value ?? '0'), 0);
    return {
      campaignId: String(row.campaign_id ?? ''),
      campaignName: String(row.campaign_name ?? ''),
      adSetId: String(row.adset_id ?? ''),
      impressions: parseInt(String(row.impressions ?? '0')),
      clicks: parseInt(String(row.clicks ?? '0')),
      spend: parseFloat(String(row.spend ?? '0')),
      conversions,
      revenue,
    };
  });
}

async function fetchGoogleAdsMetrics(account: typeof adAccounts.$inferSelect, date: string): Promise<AdMetrics[]> {
  const query = `SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date = '${date}'`;
  const res = await fetch(
    `https://googleads.googleapis.com/v16/customers/${account.platformAccountId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.accessToken}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  );
  if (!res.ok) return [];
  const lines = await res.json() as Array<{ results?: Array<Record<string, unknown>> }>;
  return (lines[0]?.results ?? []).map(row => {
    const campaign = row.campaign as Record<string, unknown>;
    const metrics = row.metrics as Record<string, unknown>;
    return {
      campaignId: String(campaign?.id ?? ''),
      campaignName: String(campaign?.name ?? ''),
      impressions: parseInt(String(metrics?.impressions ?? '0')),
      clicks: parseInt(String(metrics?.clicks ?? '0')),
      spend: parseInt(String(metrics?.costMicros ?? metrics?.cost_micros ?? '0')) / 1_000_000,
      conversions: parseFloat(String(metrics?.conversions ?? '0')),
      revenue: parseFloat(String(metrics?.conversionsValue ?? metrics?.conversions_value ?? '0')),
    };
  });
}

async function fetchLinkedInMetrics(account: typeof adAccounts.$inferSelect, date: string): Promise<AdMetrics[]> {
  const res = await fetch(
    `https://api.linkedin.com/v2/adAnalyticsV2?q=analytics&pivot=CAMPAIGN&dateRange.start.year=${date.slice(0,4)}&dateRange.start.month=${parseInt(date.slice(5,7))}&dateRange.start.day=${parseInt(date.slice(8,10))}&dateRange.end.year=${date.slice(0,4)}&dateRange.end.month=${parseInt(date.slice(5,7))}&dateRange.end.day=${parseInt(date.slice(8,10))}&accounts=urn:li:sponsoredAccount:${account.platformAccountId}`,
    { headers: { Authorization: `Bearer ${account.accessToken}` } },
  );
  if (!res.ok) return [];
  const json = await res.json() as { elements?: Array<Record<string, unknown>> };
  return (json.elements ?? []).map(row => ({
    campaignId: String((row.pivotValue as string)?.split(':').pop() ?? ''),
    campaignName: '',
    impressions: parseInt(String(row.impressions ?? '0')),
    clicks: parseInt(String(row.clicks ?? '0')),
    spend: parseFloat(String((row.costInLocalCurrency as number) ?? 0)),
    conversions: parseInt(String(row.externalWebsiteConversions ?? '0')),
    revenue: 0,
  }));
}

// ── Sync & store ──────────────────────────────────────────────────────────────

export async function syncAdPerformance(orgId: string, date?: string) {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  const accounts = await db
    .select()
    .from(adAccounts)
    .where(and(eq(adAccounts.orgId, orgId), eq(adAccounts.active, true)));

  let total = 0;
  for (const account of accounts) {
    try {
      let metrics: AdMetrics[] = [];
      switch (account.platform as AdPlatform) {
        case 'facebook_ads': metrics = await fetchFacebookMetrics(account, targetDate); break;
        case 'google_ads':   metrics = await fetchGoogleAdsMetrics(account, targetDate); break;
        case 'linkedin_ads': metrics = await fetchLinkedInMetrics(account, targetDate); break;
        default: continue;
      }

      for (const m of metrics) {
        await db
          .insert(adPerformanceSnapshots)
          .values({
            orgId,
            adAccountId: account.id,
            date: targetDate,
            platform: account.platform,
            campaignId: m.campaignId,
            campaignName: m.campaignName,
            adSetId: m.adSetId,
            impressions: m.impressions,
            clicks: m.clicks,
            spend: String(m.spend),
            conversions: m.conversions,
            revenue: String(m.revenue),
            rawData: m as never,
          })
          .onConflictDoNothing();
        total++;
      }
    } catch { /* skip failed accounts */ }
  }
  return { date: targetDate, rowsInserted: total };
}

export async function getAdPerformance(orgId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return db
    .select()
    .from(adPerformanceSnapshots)
    .where(and(eq(adPerformanceSnapshots.orgId, orgId), gte(adPerformanceSnapshots.date, since)))
    .orderBy(desc(adPerformanceSnapshots.date));
}

export async function getAdPerformanceSummary(orgId: string, days = 30) {
  const rows = await getAdPerformance(orgId, days);
  const totals = rows.reduce(
    (acc, r) => ({
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      spend: acc.spend + parseFloat(String(r.spend)),
      conversions: acc.conversions + r.conversions,
      revenue: acc.revenue + parseFloat(String(r.revenue)),
    }),
    { impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0 },
  );
  const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
  const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  return { ...totals, ctr, cpc, roas, days };
}
