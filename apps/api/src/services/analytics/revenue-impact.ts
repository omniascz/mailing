/**
 * Pre-send revenue impact prediction.
 * Estimates the expected revenue uplift before a campaign is sent,
 * based on historical performance of similar campaigns.
 */
import { and, count, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/email-events.js';
import { revenueEvents } from '../../db/schema/revenue.js';
import { campaigns } from '../../db/schema/index.js';

export interface RevenuePrediction {
  estimatedRevenue: number;
  estimatedOrders: number;
  estimatedOpenRate: number;
  estimatedClickRate: number;
  estimatedConversionRate: number;
  confidenceLevel: 'low' | 'medium' | 'high';
  basedOnCampaigns: number;
  recipientCount: number;
}

export async function predictRevenueImpact(
  orgId: string,
  opts: {
    recipientCount: number;
    tags?: string[];
    listId?: string;
    lookbackDays?: number;
  },
): Promise<RevenuePrediction> {
  const lookback = opts.lookbackDays ?? 90;
  const since = new Date(Date.now() - lookback * 86_400_000);

  // Get historical campaigns for baseline
  const historicalCampaigns = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.orgId, orgId), gte(campaigns.createdAt, since)))
    .limit(50);

  const campaignIds = historicalCampaigns.map((c) => c.id);

  if (campaignIds.length === 0) {
    return {
      estimatedRevenue: 0,
      estimatedOrders: 0,
      estimatedOpenRate: 0.2,
      estimatedClickRate: 0.025,
      estimatedConversionRate: 0.01,
      confidenceLevel: 'low',
      basedOnCampaigns: 0,
      recipientCount: opts.recipientCount,
    };
  }

  // Compute avg open/click rates from historical email events
  const stats = await db
    .select({
      sends: sql<number>`count(*) filter (where ${emailEvents.eventType} = 'send')`,
      opens: sql<number>`count(*) filter (where ${emailEvents.eventType} = 'open')`,
      clicks: sql<number>`count(*) filter (where ${emailEvents.eventType} = 'click')`,
    })
    .from(emailEvents)
    .where(eq(emailEvents.orgId, orgId));

  const [evtStats] = stats;
  const totalSends = Number(evtStats?.sends ?? 0);
  const totalOpens = Number(evtStats?.opens ?? 0);
  const totalClicks = Number(evtStats?.clicks ?? 0);

  const openRate = totalSends > 0 ? totalOpens / totalSends : 0.2;
  const clickRate = totalSends > 0 ? totalClicks / totalSends : 0.025;

  // Revenue per email from historical data
  const revStats = await db
    .select({ totalRev: sql<number>`sum(${revenueEvents.amount}::numeric)`, orderCount: count() })
    .from(revenueEvents)
    .where(and(eq(revenueEvents.orgId, orgId), gte(revenueEvents.occurredAt, since)));

  const [rev] = revStats;
  const totalRev = Number(rev?.totalRev ?? 0);
  const orderCount = Number(rev?.orderCount ?? 0);

  // Revenue per send (conservative: attribute 30% of revenue to email)
  const emailAttributedRev = totalRev * 0.3;
  const revenuePerSend = totalSends > 0 ? emailAttributedRev / totalSends : 0;
  const conversionRate = totalSends > 0 ? orderCount / totalSends : 0.01;

  const estimatedRevenue = Math.round(revenuePerSend * opts.recipientCount * 100) / 100;
  const estimatedOrders = Math.round(conversionRate * opts.recipientCount * 10) / 10;

  const confidenceLevel: RevenuePrediction['confidenceLevel'] =
    campaignIds.length >= 10 ? 'high' : campaignIds.length >= 3 ? 'medium' : 'low';

  return {
    estimatedRevenue,
    estimatedOrders,
    estimatedOpenRate: Math.round(openRate * 1000) / 1000,
    estimatedClickRate: Math.round(clickRate * 1000) / 1000,
    estimatedConversionRate: Math.round(conversionRate * 1000) / 1000,
    confidenceLevel,
    basedOnCampaigns: campaignIds.length,
    recipientCount: opts.recipientCount,
  };
}
