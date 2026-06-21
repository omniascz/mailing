/**
 * Multi-touch attribution service.
 * Supports: first_touch, last_touch, linear, time_decay, u_shaped (position-based).
 */
import { and, asc, eq } from 'drizzle-orm';
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

/** Get all touch points for a contact before a purchase */
async function getContactTouchPoints(
  orgId: string,
  contactId: string,
  beforeDate: Date,
  lookbackDays = 90,
): Promise<TouchPoint[]> {
  const since = new Date(beforeDate.getTime() - lookbackDays * 86_400_000);
  const rows = await db
    .select({ campaignId: emailEvents.campaignId, createdAt: emailEvents.createdAt, eventType: emailEvents.eventType })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.orgId, orgId),
        eq(emailEvents.contactId, contactId),
      ),
    )
    .orderBy(asc(emailEvents.createdAt));

  return rows
    .filter((r) => r.campaignId && r.createdAt && r.createdAt >= since && r.createdAt <= beforeDate)
    .map((r) => ({ campaignId: r.campaignId!, touchedAt: r.createdAt!, eventType: r.eventType }));
}

/** Credit fractions for each touch point given a model */
function creditTouchPoints(
  touches: TouchPoint[],
  model: AttributionModel,
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
      // Exponential decay: more recent = more credit. Half-life = 7 days.
      const lastDate = touches[n - 1]!.touchedAt.getTime();
      const halfLife = 7 * 86_400_000;
      const weights = touches.map((t) => {
        const ageDays = (lastDate - t.touchedAt.getTime()) / 86_400_000;
        return Math.pow(2, -ageDays / 7) * Math.exp(-ageDays / (halfLife / Math.LN2 / 1000));
      });
      const totalW = weights.reduce((a, b) => a + b, 0) || 1;
      return touches.map((t, i) => ({ ...t, credit: weights[i]! / totalW }));
    }

    case 'u_shaped': {
      // First 40%, last 40%, middle 20% split equally
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

/** Compute multi-touch attribution for all revenue events in the org */
export async function computeAttribution(
  orgId: string,
  model: AttributionModel = 'u_shaped',
  _opts: { dateFrom?: Date; dateTo?: Date } = {},
): Promise<AttributionResult[]> {
  const conditions = [eq(revenueEvents.orgId, orgId)];

  const orders = await db.select().from(revenueEvents).where(and(...conditions));

  const creditMap = new Map<string, { revenue: number; orders: number; fraction: number }>();

  for (const order of orders) {
    if (!order.contactId) continue;
    const amount = Number(order.amount ?? 0);
    if (amount <= 0) continue;

    const touches = await getContactTouchPoints(orgId, order.contactId, order.occurredAt);
    const credited = creditTouchPoints(touches, model);

    for (const t of credited) {
      const prev = creditMap.get(t.campaignId) ?? { revenue: 0, orders: 0, fraction: 0 };
      creditMap.set(t.campaignId, {
        revenue: prev.revenue + amount * t.credit,
        orders: prev.orders + t.credit,
        fraction: prev.fraction + t.credit,
      });
    }
  }

  return Array.from(creditMap.entries()).map(([campaignId, v]) => ({
    campaignId,
    attributedRevenue: Math.round(v.revenue * 100) / 100,
    attributedOrders: Math.round(v.orders * 10) / 10,
    creditFraction: Math.round(v.fraction * 1000) / 1000,
    model,
  })).sort((a, b) => b.attributedRevenue - a.attributedRevenue);
}
