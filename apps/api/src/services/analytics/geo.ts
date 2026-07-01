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
export async function enrichEventGeo(eventId: string, ip: string | null | undefined): Promise<void> {
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
