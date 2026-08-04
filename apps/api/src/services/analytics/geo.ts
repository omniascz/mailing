/**
 * Geo analytics — enrichment + per-campaign opens/clicks by country.
 *
 * `enrichEventGeo` is called fire-and-forget from the tracking handlers after
 * the event row is written, so it never blocks the pixel/redirect response.
 */

import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/index.js';
import { resolveGeo } from '../../lib/geo.js';

/** Resolve an event's IP to country/city and persist it. No-op if unresolved. */
export async function enrichEventGeo(
  eventId: string,
  ip: string | null | undefined,
): Promise<void> {
  const loc = await resolveGeo(ip);
  if (!loc || (!loc.country && !loc.city)) return;
  await db
    .update(emailEvents)
    .set({ geoCountry: loc.country, geoCity: loc.city })
    .where(eq(emailEvents.id, eventId))
    .catch(() => {});
}

export interface GeoStatRow {
  country: string;
  opens: number;
  clicks: number;
}

/** Opens/clicks grouped by country for a campaign (rows with geo only). */
export async function getCampaignGeoStats(
  campaignId: string,
  orgId: string,
): Promise<GeoStatRow[]> {
  const rows = await db
    .select({
      country: emailEvents.geoCountry,
      opens: sql<number>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'open')::int`,
      clicks: sql<number>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'click')::int`,
    })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.orgId, orgId),
        eq(emailEvents.campaignId, campaignId),
        isNotNull(emailEvents.geoCountry),
      ),
    )
    .groupBy(emailEvents.geoCountry)
    .orderBy(sql`2 DESC`);

  return rows.map((r) => ({ country: r.country ?? 'XX', opens: r.opens, clicks: r.clicks }));
}

export interface GeoCityStatRow {
  country: string;
  city: string;
  opens: number;
  clicks: number;
}

/** Opens/clicks grouped by country + city for a campaign (city rows only). */
export async function getCampaignGeoCityStats(
  campaignId: string,
  orgId: string,
  limit = 100,
): Promise<GeoCityStatRow[]> {
  const rows = await db
    .select({
      country: emailEvents.geoCountry,
      city: emailEvents.geoCity,
      opens: sql<number>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'open')::int`,
      clicks: sql<number>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'click')::int`,
    })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.orgId, orgId),
        eq(emailEvents.campaignId, campaignId),
        isNotNull(emailEvents.geoCity),
      ),
    )
    .groupBy(emailEvents.geoCountry, emailEvents.geoCity)
    .orderBy(sql`3 DESC`)
    .limit(limit);

  return rows.map((r) => ({
    country: r.country ?? 'XX',
    city: r.city ?? '',
    opens: r.opens,
    clicks: r.clicks,
  }));
}

export interface GeoMapPoint {
  /** ISO-3166 alpha-2 country code. */
  country: string;
  opens: number;
  clicks: number;
  /** Share of total opens 0..1 — use as choropleth intensity. */
  intensity: number;
}

/**
 * Map-ready country aggregation: opens/clicks per country plus a normalized
 * intensity (share of the max opens) so a choropleth can shade each country.
 */
export async function getCampaignGeoMap(campaignId: string, orgId: string): Promise<GeoMapPoint[]> {
  const rows = await getCampaignGeoStats(campaignId, orgId);
  const maxOpens = rows.reduce((m, r) => Math.max(m, r.opens), 0);
  return rows.map((r) => ({
    country: r.country,
    opens: r.opens,
    clicks: r.clicks,
    intensity: maxOpens > 0 ? Math.round((r.opens / maxOpens) * 1000) / 1000 : 0,
  }));
}
