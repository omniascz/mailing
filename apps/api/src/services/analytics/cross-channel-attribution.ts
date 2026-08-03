/**
 * Cross-channel attribution — which channel (email / SMS / push / WhatsApp)
 * gets credit for a conversion based on last-touch / linear / custom weighting.
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { revenueEvents } from '../../db/schema/revenue.js';
import { emailEvents } from '../../db/schema/email-events.js';

export type CrossChannelModel = 'last_touch' | 'first_touch' | 'linear' | 'email_boost';

export interface ChannelAttribution {
  channel: string;
  attributedRevenue: number;
  attributedOrders: number;
  creditFraction: number;
  avgTimeToConversionHours: number | null;
}

export interface CrossChannelReport {
  model: CrossChannelModel;
  channels: ChannelAttribution[];
  totalRevenue: number;
  period: string;
}

// Channel weights for "email_boost" model (email gets 50%, rest split linearly)
const EMAIL_BOOST_WEIGHTS: Record<string, number> = {
  email: 0.5,
  sms: 0.2,
  push: 0.15,
  whatsapp: 0.15,
};

export async function computeCrossChannelAttribution(
  orgId: string,
  model: CrossChannelModel,
  dateFrom: Date,
  dateTo: Date,
): Promise<CrossChannelReport> {
  // Get all revenue events in period
  const revenues = await db
    .select({
      contactId: revenueEvents.contactId,
      amount: revenueEvents.amount,
      createdAt: revenueEvents.occurredAt,
    })
    .from(revenueEvents)
    .where(
      and(
        eq(revenueEvents.orgId, orgId),
        gte(revenueEvents.occurredAt, dateFrom),
        sql`occurred_at <= ${dateTo.toISOString()}`,
      ),
    );

  const totalRevenue = revenues.reduce((s, r) => s + Number(r.amount), 0);

  // Get email touch points for these contacts
  const contactIds = [...new Set(revenues.map((r) => r.contactId).filter(Boolean) as string[])];

  // Channel touch counts per contact (simplified: email events are our main data source)
  // For a real cross-channel system, you'd join SMS/push send logs here
  const emailTouches =
    contactIds.length > 0
      ? await db
          .select({
            contactId: emailEvents.contactId,
            touchCount: sql<number>`count(*)::int`,
          })
          .from(emailEvents)
          .where(
            and(
              eq(emailEvents.orgId, orgId),
              sql`contact_id = any(${contactIds})`,
              sql`event_type = 'deliver'`,
              gte(emailEvents.createdAt, dateFrom),
            ),
          )
          .groupBy(emailEvents.contactId)
      : [];

  const emailTouchMap = new Map(emailTouches.map((r) => [r.contactId, Number(r.touchCount)]));

  // Simplified: attribute revenue proportionally to channels
  // In a full implementation, SMS/push would also be queried
  const channelRevenue: Record<string, number> = { email: 0, sms: 0, push: 0, whatsapp: 0 };
  const channelOrders: Record<string, number> = { email: 0, sms: 0, push: 0, whatsapp: 0 };

  for (const rev of revenues) {
    const amount = Number(rev.amount);
    const hasEmailTouch = rev.contactId ? (emailTouchMap.get(rev.contactId) ?? 0) > 0 : false;

    if (model === 'last_touch' || model === 'first_touch') {
      // Simplified: attribute 100% to email if email touch exists
      const channel = hasEmailTouch ? 'email' : 'unknown';
      channelRevenue[channel] = (channelRevenue[channel] ?? 0) + amount;
      channelOrders[channel] = (channelOrders[channel] ?? 0) + 1;
    } else if (model === 'linear') {
      const activeChannels = hasEmailTouch ? ['email'] : ['unknown'];
      const split = amount / activeChannels.length;
      for (const ch of activeChannels) {
        channelRevenue[ch] = (channelRevenue[ch] ?? 0) + split;
        channelOrders[ch] = (channelOrders[ch] ?? 0) + 1 / activeChannels.length;
      }
    } else if (model === 'email_boost') {
      for (const [ch, weight] of Object.entries(EMAIL_BOOST_WEIGHTS)) {
        channelRevenue[ch] = (channelRevenue[ch] ?? 0) + amount * weight;
        channelOrders[ch] = (channelOrders[ch] ?? 0) + weight;
      }
    }
  }

  const channels: ChannelAttribution[] = Object.entries(channelRevenue)
    .filter(([, rev]) => rev > 0)
    .map(([channel, rev]) => ({
      channel,
      attributedRevenue: rev,
      attributedOrders: Math.round(channelOrders[channel] ?? 0),
      creditFraction: totalRevenue > 0 ? rev / totalRevenue : 0,
      avgTimeToConversionHours: null, // requires join with send time
    }))
    .sort((a, b) => b.attributedRevenue - a.attributedRevenue);

  return {
    model,
    channels,
    totalRevenue,
    period: `${dateFrom.toISOString().slice(0, 10)} – ${dateTo.toISOString().slice(0, 10)}`,
  };
}
