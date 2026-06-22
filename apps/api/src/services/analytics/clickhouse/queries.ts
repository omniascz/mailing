/**
 * ClickHouse-backed read queries for analytics. Each returns the SAME row shape
 * the Postgres path produces, so callers run identical downstream aggregation.
 * Reads from the email_events_daily rollup (SummingMergeTree) for speed.
 */
import { chQuery, chEscape } from './client.js';

export interface CampaignEventRow {
  eventType: string;
  bounceType: string | null;
  total: number;
  uniqueContacts: number;
}

export async function chCampaignEventRows(
  campaignId: string,
  orgId: string,
): Promise<CampaignEventRow[]> {
  const rows = await chQuery<{
    eventType: string;
    bounceType: string;
    total: string;
    uniqueContacts: string;
  }>(
    `SELECT event_type AS eventType, bounce_type AS bounceType,
            sum(events) AS total, uniqMerge(unique_contacts) AS uniqueContacts
     FROM email_events_daily
     WHERE org_id = '${chEscape(orgId)}' AND campaign_id = '${chEscape(campaignId)}'
     GROUP BY event_type, bounce_type`,
  );
  return rows.map((r) => ({
    eventType: r.eventType,
    bounceType: r.bounceType || null,
    total: Number(r.total),
    uniqueContacts: Number(r.uniqueContacts),
  }));
}

export interface OrgDailyRow {
  date: string; // YYYY-MM-DD
  eventType: string;
  cnt: number;
}

export async function chOrgDailyRows(orgId: string, days: number): Promise<OrgDailyRow[]> {
  const rows = await chQuery<{ date: string; eventType: string; cnt: string }>(
    `SELECT toString(day) AS date, event_type AS eventType, sum(events) AS cnt
     FROM email_events_daily
     WHERE org_id = '${chEscape(orgId)}' AND day >= toDate(now()) - ${Math.max(0, Math.floor(days))}
     GROUP BY day, event_type
     ORDER BY day`,
  );
  return rows.map((r) => ({ date: r.date, eventType: r.eventType, cnt: Number(r.cnt) }));
}
