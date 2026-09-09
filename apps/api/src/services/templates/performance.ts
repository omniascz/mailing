/**
 * How the campaigns started from a template actually did.
 *
 * This could not be written until now, and the reason is worth keeping: it
 * groups by `campaigns.template_id`, and until the library grew a way to start
 * a campaign that column was null on every row the product created. Two MCP
 * batches left the tool out rather than ship one that answers over an empty
 * join — 103 campaigns in the test database, 0 with a template, measured the
 * day before this was written.
 *
 * ─── What is counted, and why nothing else is ────────────────────────────────
 *
 * Every figure here comes from `email_events`, joined to the template through
 * the campaign that produced it. All seven event types have production writers:
 * `send`, `deliver`, `bounce` and `complaint` arrive from the sending worker
 * through /internal/events, `open` and `click` from the tracking routes, and
 * `unsubscribe` from the unsubscribe service.
 *
 * REVENUE IS DELIBERATELY NOT A NUMBER HERE, and the reason changed since the
 * last time it was left out. It is reachable — `revenue_events` carries
 * `attributed_campaign_id`, so revenue joins to a template through the same
 * campaign — but the only writer that fills that column is `trackPurchase`,
 * and both of its callers sit behind beyond-core groups (`revenue` and
 * `ecommerce`). On a deployment with those off, the column is never written,
 * so a revenue figure would be a structural zero: not "this template earned
 * nothing", but "nothing here can earn anything". The other two writers of
 * `revenue_events` — ticketing and the site tracker — do not set the campaign
 * at all, so their rows cannot reach a template either way.
 *
 * So the report says which of those groups would have to be on, rather than
 * printing 0.00. That is the same rule the sends figure was dropped under, one
 * layer along: a zero that looks like data is worse than an absent metric.
 *
 * ─── A template nobody has sent from ─────────────────────────────────────────
 *
 * `sends: 0` and "we have no idea" must not read the same. A template with
 * campaigns that have not gone out is a different answer from one with no
 * campaigns at all, and both differ from a template that does not exist — the
 * caller gets three distinct shapes, and rates are computed for none of them.
 * Dividing by zero to print "0.0% opened" would describe a template that has
 * never been used as one that performs badly.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { templates as savedTemplates } from '../../db/schema/index.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/app-error.js';

/** Groups whose routes are the only things that attribute revenue to a campaign. */
const REVENUE_GROUPS = ['revenue', 'ecommerce'] as const;

export interface TemplatePerformance {
  templateId: string;
  templateName: string;
  /** Campaigns started from this template, whatever their status. */
  campaigns: number;
  /** Of those, the ones that have actually produced a send event. */
  campaignsSent: number;
  sends: number;
  delivered: number;
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  bounces: number;
  complaints: number;
  unsubscribes: number;
  /** Null until there is a denominator. Never 0 as a stand-in for "unknown". */
  deliveryRatePct: number | null;
  openRatePct: number | null;
  clickRatePct: number | null;
  bounceRatePct: number | null;
  unsubscribeRatePct: number | null;
  /**
   * Absent, with the reason, rather than 0.00. See the note above: the column
   * that would carry it is only written by routes behind a beyond-core group.
   */
  revenue: { available: false; reason: string } | { available: true; total: number };
}

interface CountRow extends Record<string, unknown> {
  campaigns: number;
  campaigns_sent: number;
  sends: number;
  delivered: number;
  opens: number;
  unique_opens: number;
  clicks: number;
  unique_clicks: number;
  bounces: number;
  complaints: number;
  unsubscribes: number;
}

/** Percentage to two places, or null when the denominator is not there yet. */
function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function revenueAvailability(): TemplatePerformance['revenue'] {
  const on = REVENUE_GROUPS.filter((g) => env.BEYOND_CORE_ENABLED.has(g));
  if (on.length === 0) {
    return {
      available: false,
      reason:
        'Revenue is attributed to a campaign only by trackPurchase, whose callers are behind the ' +
        `beyond-core groups ${REVENUE_GROUPS.join(' and ')}. Neither is enabled here, so no ` +
        'purchase can name a campaign and a figure would be a structural zero rather than a total.',
    };
  }
  // Enabled, so the column is written and a total means something. Computed by
  // the caller's own report; this function only decides whether to ask.
  return { available: true, total: 0 };
}

/**
 * Count one template's delivery outcomes, org-scoped.
 *
 * The id is a filter, never a selector: the org comes from the session, and a
 * template belonging to somebody else is NOT FOUND rather than an empty report.
 * "Nothing here" and "not yours" reading the same is how a caller concludes a
 * template was never used when in fact it belongs to another account.
 */
export async function getTemplatePerformance(
  orgId: string,
  templateId: string,
): Promise<TemplatePerformance> {
  const [tpl] = await db
    .select({ id: savedTemplates.id, name: savedTemplates.name })
    .from(savedTemplates)
    .where(
      and(
        eq(savedTemplates.id, templateId),
        eq(savedTemplates.orgId, orgId),
        isNull(savedTemplates.deletedAt),
      ),
    )
    .limit(1);
  if (!tpl) throw AppError.notFound('Template');

  // One pass. The campaign join carries org_id as well as the template, so a
  // campaign that somehow pointed at another org's template still could not
  // contribute to this org's numbers.
  const rows = (await db.execute<CountRow>(sql`
    SELECT
      COUNT(DISTINCT c.id)::int                                                  AS campaigns,
      COUNT(DISTINCT c.id) FILTER (WHERE e.event_type = 'send')::int             AS campaigns_sent,
      COUNT(e.id) FILTER (WHERE e.event_type = 'send')::int                      AS sends,
      COUNT(e.id) FILTER (WHERE e.event_type = 'deliver')::int                   AS delivered,
      COUNT(e.id) FILTER (WHERE e.event_type = 'open')::int                      AS opens,
      COUNT(DISTINCT e.contact_id) FILTER (WHERE e.event_type = 'open')::int     AS unique_opens,
      COUNT(e.id) FILTER (WHERE e.event_type = 'click')::int                     AS clicks,
      COUNT(DISTINCT e.contact_id) FILTER (WHERE e.event_type = 'click')::int    AS unique_clicks,
      COUNT(e.id) FILTER (WHERE e.event_type = 'bounce')::int                    AS bounces,
      COUNT(e.id) FILTER (WHERE e.event_type = 'complaint')::int                 AS complaints,
      COUNT(e.id) FILTER (WHERE e.event_type = 'unsubscribe')::int               AS unsubscribes
    FROM campaigns c
    LEFT JOIN email_events e ON e.campaign_id = c.id AND e.org_id = c.org_id
    WHERE c.org_id = ${orgId} AND c.template_id = ${templateId}
  `)) as unknown as CountRow[];

  const r =
    rows[0] ??
    ({
      campaigns: 0,
      campaigns_sent: 0,
      sends: 0,
      delivered: 0,
      opens: 0,
      unique_opens: 0,
      clicks: 0,
      unique_clicks: 0,
      bounces: 0,
      complaints: 0,
      unsubscribes: 0,
    } as CountRow);

  // Opens and clicks are rated against what was delivered, bounces and
  // unsubscribes against what was sent — the conventions the account-wide
  // stats already use, so a per-template rate is comparable with them rather
  // than being a second definition of the same word.
  const denom = r.delivered > 0 ? r.delivered : 0;

  return {
    templateId: tpl.id,
    templateName: tpl.name,
    campaigns: r.campaigns,
    campaignsSent: r.campaigns_sent,
    sends: r.sends,
    delivered: r.delivered,
    opens: r.opens,
    uniqueOpens: r.unique_opens,
    clicks: r.clicks,
    uniqueClicks: r.unique_clicks,
    bounces: r.bounces,
    complaints: r.complaints,
    unsubscribes: r.unsubscribes,
    deliveryRatePct: pct(r.delivered, r.sends),
    openRatePct: pct(r.unique_opens, denom),
    clickRatePct: pct(r.unique_clicks, denom),
    bounceRatePct: pct(r.bounces, r.sends),
    unsubscribeRatePct: pct(r.unsubscribes, denom),
    revenue: revenueAvailability(),
  };
}
