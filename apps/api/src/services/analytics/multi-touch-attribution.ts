/**
 * Multi-touch attribution service.
 * Supports: first_touch, last_touch, linear, time_decay, u_shaped (position-based).
 */
import { and, asc, eq, gte, lte, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { revenueEvents } from '../../db/schema/revenue.js';
import { emailEvents } from '../../db/schema/email-events.js';

export type AttributionModel = 'first_touch' | 'last_touch' | 'linear' | 'time_decay' | 'u_shaped';

export interface TouchPoint {
  campaignId: string;
  touchedAt: Date;
  eventType: string;
}

export interface AttributionResult {
  campaignId: string;
  attributedRevenue: number;
  attributedOrders: number;
  creditFraction: number;
  model: AttributionModel;
}

const DEFAULT_LOOKBACK_DAYS = 90;
const DEFAULT_HALF_LIFE_DAYS = 7;

/**
 * Credit fractions for each touch point given a model. Pure + unit-tested.
 * Touches must be in ascending time order.
 */
export function creditTouchPoints(
  touches: TouchPoint[],
  model: AttributionModel,
  opts: { halfLifeDays?: number } = {},
): Array<TouchPoint & { credit: number }> {
  if (touches.length === 0) return [];
  const n = touches.length;

  switch (model) {
    case 'first_touch':
      return touches.map((t, i) => ({ ...t, credit: i === 0 ? 1 : 0 }));

    case 'last_touch':
      return touches.map((t, i) => ({ ...t, credit: i === n - 1 ? 1 : 0 }));

    case 'linear': {
      const each = 1 / n;
      return touches.map((t) => ({ ...t, credit: each }));
    }

    case 'time_decay': {
      // Clean exponential decay keyed to the last touch: a touch one half-life
      // older gets half the weight. (The previous implementation multiplied a
      // correct 2^(-age/7) by a ms-vs-days unit-mixed exp() ≈ 1 — garbage.)
      const halfLifeDays = opts.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
      const lastDate = touches[n - 1]!.touchedAt.getTime();
      const weights = touches.map((t) => {
        const ageDays = (lastDate - t.touchedAt.getTime()) / 86_400_000;
        return Math.pow(2, -ageDays / halfLifeDays);
      });
      const totalW = weights.reduce((a, b) => a + b, 0) || 1;
      return touches.map((t, i) => ({ ...t, credit: weights[i]! / totalW }));
    }

    case 'u_shaped': {
      // First 40%, last 40%, middle 20% split equally.
      if (n === 1) return [{ ...touches[0]!, credit: 1 }];
      if (n === 2) return touches.map((t) => ({ ...t, credit: 0.5 }));
      const middleCount = n - 2;
      const middleCredit = middleCount > 0 ? 0.2 / middleCount : 0;
      return touches.map((t, i) => ({
        ...t,
        credit: i === 0 ? 0.4 : i === n - 1 ? 0.4 : middleCredit,
      }));
    }
  }
}

/** Slice a contact's ascending touch list to the attribution window of one order. */
export function touchesInWindow(
  all: TouchPoint[],
  orderAt: Date,
  lookbackDays: number,
): TouchPoint[] {
  const since = orderAt.getTime() - lookbackDays * 86_400_000;
  return all.filter((t) => {
    const ms = t.touchedAt.getTime();
    return ms >= since && ms <= orderAt.getTime();
  });
}

/**
 * Compute multi-touch attribution for all revenue events in the org.
 * Batches all touch-point lookups into a single query (was N+1: one query per
 * order) and honours the dateFrom/dateTo window (previously ignored).
 */
export async function computeAttribution(
  orgId: string,
  model: AttributionModel = 'u_shaped',
  opts: { dateFrom?: Date; dateTo?: Date; lookbackDays?: number; halfLifeDays?: number } = {},
): Promise<AttributionResult[]> {
  const lookbackDays = opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;

  const orderConds = [eq(revenueEvents.orgId, orgId)];
  if (opts.dateFrom) orderConds.push(gte(revenueEvents.occurredAt, opts.dateFrom));
  if (opts.dateTo) orderConds.push(lte(revenueEvents.occurredAt, opts.dateTo));

  const orders = (await db.select().from(revenueEvents).where(and(...orderConds))).filter(
    (o) => o.contactId && Number(o.amount ?? 0) > 0,
  );
  if (orders.length === 0) return [];

  // Single batched touch-point load for every contact + the full window.
  const contactIds = [...new Set(orders.map((o) => o.contactId!).filter(Boolean))];
  const minOrderMs = Math.min(...orders.map((o) => o.occurredAt.getTime()));
  const maxOrderMs = Math.max(...orders.map((o) => o.occurredAt.getTime()));
  const windowStart = new Date(minOrderMs - lookbackDays * 86_400_000);
  const windowEnd = new Date(maxOrderMs);

  const touchesByContact = new Map<string, TouchPoint[]>();
  const CHUNK = 1000;
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const chunk = contactIds.slice(i, i + CHUNK);
    const rows = await db
      .select({
        contactId: emailEvents.contactId,
        campaignId: emailEvents.campaignId,
        createdAt: emailEvents.createdAt,
        eventType: emailEvents.eventType,
      })
      .from(emailEvents)
      .where(
        and(
          eq(emailEvents.orgId, orgId),
          inArray(emailEvents.contactId, chunk),
          gte(emailEvents.createdAt, windowStart),
          lte(emailEvents.createdAt, windowEnd),
        ),
      )
      .orderBy(asc(emailEvents.createdAt));

    for (const r of rows) {
      if (!r.contactId || !r.campaignId || !r.createdAt) continue;
      const list = touchesByContact.get(r.contactId) ?? [];
      list.push({ campaignId: r.campaignId, touchedAt: r.createdAt, eventType: r.eventType });
      touchesByContact.set(r.contactId, list);
    }
  }

  const creditMap = new Map<string, { revenue: number; orders: number; fraction: number }>();

  for (const order of orders) {
    const amount = Number(order.amount ?? 0);
    const all = touchesByContact.get(order.contactId!) ?? [];
    const touches = touchesInWindow(all, order.occurredAt, lookbackDays);
    const credited = creditTouchPoints(touches, model, { halfLifeDays: opts.halfLifeDays });

    for (const t of credited) {
      const prev = creditMap.get(t.campaignId) ?? { revenue: 0, orders: 0, fraction: 0 };
      creditMap.set(t.campaignId, {
        revenue: prev.revenue + amount * t.credit,
        orders: prev.orders + t.credit,
        fraction: prev.fraction + t.credit,
      });
    }
  }

  return Array.from(creditMap.entries())
    .map(([campaignId, v]) => ({
      campaignId,
      attributedRevenue: Math.round(v.revenue * 100) / 100,
      attributedOrders: Math.round(v.orders * 10) / 10,
      creditFraction: Math.round(v.fraction * 1000) / 1000,
      model,
    }))
    .sort((a, b) => b.attributedRevenue - a.attributedRevenue);
}
