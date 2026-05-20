/**
 * Revenue attribution — ingest purchase events and attribute them to the
 * most recent campaign/channel that the contact interacted with inside the
 * configured conversion window (default: 30 days).
 */

import { and, eq, gte, sql, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  revenueEvents,
  emailEvents,
  contactEngagement,
  type NewRevenueEvent,
  type RevenueEvent,
} from '../../db/schema/index.js';

const DEFAULT_WINDOW_DAYS = 30;

export interface TrackPurchaseInput {
  orgId: string;
  contactId?: string | null;
  orderId?: string;
  amount: number;
  currency?: string;
  items?: NewRevenueEvent['items'];
  utm?: { source?: string; medium?: string; campaign?: string };
  occurredAt?: Date;
  attributionModel?: 'last_touch' | 'first_touch' | 'linear';
  conversionWindowDays?: number;
}

export async function trackPurchase(input: TrackPurchaseInput): Promise<RevenueEvent> {
  const model = input.attributionModel ?? 'last_touch';
  const windowDays = input.conversionWindowDays ?? DEFAULT_WINDOW_DAYS;
  const occurredAt = input.occurredAt ?? new Date();

  let campaignId: string | null = null;

  if (input.contactId) {
    const since = new Date(occurredAt.getTime() - windowDays * 86_400_000);
    const events = await db
      .select({ campaignId: emailEvents.campaignId, createdAt: emailEvents.createdAt })
      .from(emailEvents)
      .where(
        and(
          eq(emailEvents.contactId, input.contactId),
          eq(emailEvents.orgId, input.orgId),
          gte(emailEvents.createdAt, since),
        ),
      )
      .orderBy(desc(emailEvents.createdAt));

    const withCampaign = events.filter((e) => e.campaignId);
    if (withCampaign.length > 0) {
      campaignId = (
        model === 'first_touch' ? withCampaign[withCampaign.length - 1]! : withCampaign[0]!
      ).campaignId;
    }
  }

  // UTM campaign name → campaign id (best-effort) is skipped; left as metadata.
  const [row] = await db
    .insert(revenueEvents)
    .values({
      orgId: input.orgId,
      contactId: input.contactId ?? null,
      orderId: input.orderId,
      amount: input.amount.toFixed(2),
      currency: input.currency ?? 'USD',
      items: input.items ?? [],
      utmSource: input.utm?.source,
      utmMedium: input.utm?.medium,
      utmCampaign: input.utm?.campaign,
      attributedCampaignId: campaignId,
      attributionModel: model,
      occurredAt,
    })
    .returning();

  // Update per-contact engagement aggregates.
  if (input.contactId) {
    await db.execute(sql`
      INSERT INTO contact_engagement (contact_id, org_id, total_orders, total_revenue, first_order_at, last_order_at)
      VALUES (${input.contactId}::uuid, ${input.orgId}::uuid, 1, ${input.amount}, ${occurredAt}, ${occurredAt})
      ON CONFLICT (contact_id) DO UPDATE SET
        total_orders  = contact_engagement.total_orders + 1,
        total_revenue = contact_engagement.total_revenue + ${input.amount},
        first_order_at = COALESCE(contact_engagement.first_order_at, EXCLUDED.first_order_at),
        last_order_at  = EXCLUDED.last_order_at,
        updated_at = now()
    `);
  }
  void contactEngagement;
  return row!;
}

export async function campaignRevenueReport(
  orgId: string,
  opts: { since?: Date } = {},
): Promise<
  Array<{
    campaignId: string | null;
    orders: number;
    revenue: number;
    currency: string;
  }>
> {
  const since = opts.since ?? new Date(Date.now() - 90 * 86_400_000);
  const rs = await db.execute<{
    cid: string | null;
    orders: string;
    revenue: string;
    currency: string;
  }>(sql`
    SELECT attributed_campaign_id AS cid,
           COUNT(*)::text AS orders,
           SUM(amount)::text AS revenue,
           MAX(currency) AS currency
    FROM revenue_events
    WHERE org_id = ${orgId}::uuid AND occurred_at >= ${since}
    GROUP BY attributed_campaign_id
    ORDER BY SUM(amount) DESC NULLS LAST
  `);
  return (
    rs as unknown as Array<{
      cid: string | null;
      orders: string;
      revenue: string;
      currency: string;
    }>
  ).map((r) => ({
    campaignId: r.cid,
    orders: Number(r.orders),
    revenue: Number(r.revenue),
    currency: r.currency,
  }));
}
