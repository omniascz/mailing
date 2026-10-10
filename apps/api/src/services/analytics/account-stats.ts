/**
 * Account-level send statistics (SES GetSendStatistics / GetSendQuota-style).
 * Aggregates email events across the whole account over a rolling window.
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/index.js';
import { deliveryDenominators } from '../deliverability/pure.js';

export interface SendCounts {
  sent: number;
  delivered: number;
  bounced: number;
  /** Transport failures that ran out of retries — neither delivered nor bounced. */
  failed: number;
  complained: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
}

export interface AccountSendStats extends SendCounts {
  windowDays: number;
  deliveryRate: number;
  bounceRate: number;
  complaintRate: number;
  openRate: number;
  clickRate: number;
}

const pct = (num: number, den: number): number =>
  den > 0 ? Math.round((num / den) * 10000) / 100 : 0;

/**
 * Pure: derive rates from raw counts.
 *
 * Delivery, bounce and complaint rates are fractions of delivery outcomes
 * (`deliveryDenominators`), not of 'sent'. 'sent' counts the billing 'send'
 * rows, which mta-sender writes only for campaign mail it delivered and
 * nothing writes for a password reset — so over 'sent' an account sending
 * resets had a 0 % bounce rate at any real one, and a delivery rate above
 * 100 %. Open and click rates keep their convention.
 */
export function computeSendRates(
  c: SendCounts,
): Omit<AccountSendStats, keyof SendCounts | 'windowDays'> {
  const o = deliveryDenominators({ delivered: c.delivered, bounces: c.bounced, failed: c.failed });
  return {
    deliveryRate: pct(c.delivered, o.resolved),
    bounceRate: pct(c.bounced, o.attempted),
    complaintRate: pct(c.complained, o.delivered),
    openRate: pct(c.opened, c.delivered || c.sent),
    clickRate: pct(c.clicked, c.delivered || c.sent),
  };
}

export async function getAccountSendStats(orgId: string, days = 30): Promise<AccountSendStats> {
  const since = new Date(Date.now() - days * 86_400_000);
  const [row] = await db
    .select({
      sent: sql<number>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'send')::int`,
      delivered: sql<number>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'deliver')::int`,
      bounced: sql<number>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'bounce')::int`,
      failed: sql<number>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'failed')::int`,
      complained: sql<number>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'complaint')::int`,
      opened: sql<number>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'open')::int`,
      clicked: sql<number>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'click')::int`,
      unsubscribed: sql<number>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'unsubscribe')::int`,
    })
    .from(emailEvents)
    .where(and(eq(emailEvents.orgId, orgId), gte(emailEvents.createdAt, since)));

  const counts: SendCounts = {
    sent: row?.sent ?? 0,
    delivered: row?.delivered ?? 0,
    bounced: row?.bounced ?? 0,
    failed: row?.failed ?? 0,
    complained: row?.complained ?? 0,
    opened: row?.opened ?? 0,
    clicked: row?.clicked ?? 0,
    unsubscribed: row?.unsubscribed ?? 0,
  };
  return { windowDays: days, ...counts, ...computeSendRates(counts) };
}
