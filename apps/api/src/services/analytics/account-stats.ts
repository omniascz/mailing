/**
 * Account-level send statistics (SES GetSendStatistics / GetSendQuota-style).
 * Aggregates email events across the whole account over a rolling window.
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/index.js';

export interface SendCounts {
  sent: number;
  delivered: number;
  bounced: number;
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

/** Pure: derive rates from raw counts (newsletter conventions: rates over sent). */
export function computeSendRates(
  c: SendCounts,
): Omit<AccountSendStats, keyof SendCounts | 'windowDays'> {
  return {
    deliveryRate: pct(c.delivered, c.sent),
    bounceRate: pct(c.bounced, c.sent),
    complaintRate: pct(c.complained, c.sent),
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
    complained: row?.complained ?? 0,
    opened: row?.opened ?? 0,
    clicked: row?.clicked ?? 0,
    unsubscribed: row?.unsubscribed ?? 0,
  };
  return { windowDays: days, ...counts, ...computeSendRates(counts) };
}
