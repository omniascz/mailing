/**
 * Newsletter analytics routes — subscriber growth, churn, revenue per subscriber.
 *
 *   GET /api/v1/newsletter-analytics/growth       — daily/weekly subscriber growth
 *   GET /api/v1/newsletter-analytics/churn        — unsubscribe + churn metrics
 *   GET /api/v1/newsletter-analytics/engagement   — open/click trend over time
 *   GET /api/v1/newsletter-analytics/revenue      — RPE (revenue per email), RPS (per subscriber)
 *   GET /api/v1/newsletter-analytics/overview     — all-in-one dashboard summary
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts, emailEvents } from '../../db/schema/index.js';
import { revenueEvents } from '../../db/schema/revenue.js';

/** Unwrap a db.execute result, which is already the row array. */
function toRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  return (result as { rows?: unknown[] })?.rows ?? [];
}

export default async function newsletterAnalyticsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // ── Subscriber growth ─────────────────────────────────────────────────────
  app.get('/api/v1/newsletter-analytics/growth', async (req) => {
    const q = z
      .object({
        granularity: z.enum(['day', 'week', 'month']).default('day'),
        days: z.coerce.number().int().min(7).max(365).default(30),
      })
      .parse(req.query);

    const since = new Date(Date.now() - q.days * 86_400_000);
    const dateTrunc =
      q.granularity === 'month' ? 'month' : q.granularity === 'week' ? 'week' : 'day';

    const rows = await db.execute(
      sql`SELECT date_trunc(${dateTrunc}, created_at)::date AS period,
             count(*) FILTER (WHERE status != 'unsubscribed') AS new_subscribers,
             count(*) FILTER (WHERE status = 'unsubscribed') AS unsubscribes
          FROM contacts
          WHERE org_id = ${req.user!.orgId} AND created_at >= ${since.toISOString()}::timestamptz
          GROUP BY period ORDER BY period ASC`,
    );

    // db.execute returns the row array itself with the postgres-js driver, not
    // a { rows } envelope. Reading `.rows` returned undefined, so this route
    // answered `{ data: undefined }` — a 200 with nothing in it. The Date
    // encoding bug hid this one: the query threw before anyone saw the shape.
    return { data: toRows(rows) };
  });

  // ── Churn metrics ──────────────────────────────────────────────────────────
  app.get('/api/v1/newsletter-analytics/churn', async (req) => {
    const q = z
      .object({ days: z.coerce.number().int().min(7).max(365).default(30) })
      .parse(req.query);
    const since = new Date(Date.now() - q.days * 86_400_000);

    const [totals] = await db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where ${contacts.status} = 'active')`,
        unsubscribed: sql<number>`count(*) filter (where ${contacts.status} = 'unsubscribed')`,
        bounced: sql<number>`count(*) filter (where ${contacts.status} = 'bounced')`,
        complained: sql<number>`count(*) filter (where ${contacts.status} = 'complained')`,
      })
      .from(contacts)
      .where(eq(contacts.orgId, req.user!.orgId));

    const [recentUnsubs] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contacts)
      .where(
        and(
          eq(contacts.orgId, req.user!.orgId),
          eq(contacts.status, 'unsubscribed'),
          gte(contacts.updatedAt, since),
        ),
      );

    const total = Number(totals?.total ?? 0);
    const active = Number(totals?.active ?? 0);
    const recentUnsubCount = Number(recentUnsubs?.count ?? 0);

    return {
      data: {
        totalContacts: total,
        activeSubscribers: active,
        unsubscribed: Number(totals?.unsubscribed ?? 0),
        bounced: Number(totals?.bounced ?? 0),
        complained: Number(totals?.complained ?? 0),
        churnRate: active > 0 ? Math.round((recentUnsubCount / active) * 10000) / 100 : 0,
        recentUnsubscribes: recentUnsubCount,
        period: `${q.days}d`,
      },
    };
  });

  // ── Engagement trend ───────────────────────────────────────────────────────
  app.get('/api/v1/newsletter-analytics/engagement', async (req) => {
    const q = z
      .object({ days: z.coerce.number().int().min(7).max(365).default(30) })
      .parse(req.query);
    const since = new Date(Date.now() - q.days * 86_400_000);

    const rows = await db.execute(
      sql`SELECT date_trunc('week', created_at)::date AS week,
             count(*) filter (where event_type='send') AS sends,
             count(*) filter (where event_type='open') AS opens,
             count(*) filter (where event_type='click') AS clicks,
             count(*) filter (where event_type='unsubscribe') AS unsubscribes
          FROM email_events
          WHERE org_id = ${req.user!.orgId} AND created_at >= ${since.toISOString()}::timestamptz
          GROUP BY week ORDER BY week ASC`,
    );

    // db.execute returns the row array itself with the postgres-js driver, not
    // a { rows } envelope. Reading `.rows` returned undefined, so this route
    // answered `{ data: undefined }` — a 200 with nothing in it. The Date
    // encoding bug hid this one: the query threw before anyone saw the shape.
    return { data: toRows(rows) };
  });

  // ── Revenue per email / per subscriber ────────────────────────────────────
  app.get('/api/v1/newsletter-analytics/revenue', async (req) => {
    const q = z
      .object({ days: z.coerce.number().int().min(7).max(365).default(90) })
      .parse(req.query);
    const since = new Date(Date.now() - q.days * 86_400_000);

    const [evtStats] = await db
      .select({
        sends: sql<number>`count(*) filter (where ${emailEvents.eventType} = 'send')`,
      })
      .from(emailEvents)
      .where(and(eq(emailEvents.orgId, req.user!.orgId), gte(emailEvents.createdAt, since)));

    const [revStats] = await db
      .select({ totalRev: sql<number>`coalesce(sum(amount::numeric), 0)` })
      .from(revenueEvents)
      .where(and(eq(revenueEvents.orgId, req.user!.orgId), gte(revenueEvents.occurredAt, since)));

    const [subStats] = await db
      .select({ active: sql<number>`count(*) filter (where ${contacts.status} = 'active')` })
      .from(contacts)
      .where(eq(contacts.orgId, req.user!.orgId));

    const sends = Number(evtStats?.sends ?? 0);
    const revenue = Number(revStats?.totalRev ?? 0);
    const subscribers = Number(subStats?.active ?? 0);

    const emailAttributedRevenue = revenue * 0.3;
    return {
      data: {
        period: `${q.days}d`,
        sends,
        activeSubscribers: subscribers,
        emailAttributedRevenue: Math.round(emailAttributedRevenue * 100) / 100,
        revenuePerEmail:
          sends > 0 ? Math.round((emailAttributedRevenue / sends) * 10000) / 10000 : 0,
        revenuePerSubscriber:
          subscribers > 0 ? Math.round((emailAttributedRevenue / subscribers) * 100) / 100 : 0,
      },
    };
  });

  // ── Overview summary ───────────────────────────────────────────────────────
  app.get('/api/v1/newsletter-analytics/overview', async (req) => {
    const orgId = req.user!.orgId;
    const since30d = new Date(Date.now() - 30 * 86_400_000);

    const [[subStats], [evtStats]] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)`,
          active: sql<number>`count(*) filter (where ${contacts.status} = 'active')`,
          newLast30d: sql<number>`count(*) filter (where ${contacts.createdAt} >= ${sql.param(since30d, contacts.createdAt)})`,
        })
        .from(contacts)
        .where(eq(contacts.orgId, orgId)),
      db
        .select({
          sends: sql<number>`count(*) filter (where ${emailEvents.eventType}='send')`,
          opens: sql<number>`count(*) filter (where ${emailEvents.eventType}='open')`,
          clicks: sql<number>`count(*) filter (where ${emailEvents.eventType}='click')`,
        })
        .from(emailEvents)
        .where(and(eq(emailEvents.orgId, orgId), gte(emailEvents.createdAt, since30d))),
    ]);

    const sends = Number(evtStats?.sends ?? 0);
    const opens = Number(evtStats?.opens ?? 0);
    const clicks = Number(evtStats?.clicks ?? 0);

    return {
      data: {
        totalSubscribers: Number(subStats?.total ?? 0),
        activeSubscribers: Number(subStats?.active ?? 0),
        newLast30d: Number(subStats?.newLast30d ?? 0),
        sends,
        openRate: sends > 0 ? Math.round((opens / sends) * 10000) / 100 : 0,
        clickRate: sends > 0 ? Math.round((clicks / sends) * 10000) / 100 : 0,
        clickToOpenRate: opens > 0 ? Math.round((clicks / opens) * 10000) / 100 : 0,
      },
    };
  });
}
