/**
 * Send-time / send-day optimisation + Timewarp helpers.
 *
 *  • Send Time Optimization (STO) — picks the hour-of-day where a contact is
 *    most likely to open. Uses a 24-bucket histogram maintained from open events.
 *  • Send Day Optimization — org-wide recommendation based on aggregate
 *    open_day_histogram. Defaults to Tuesday (2) if we don't have data yet.
 *  • Timewarp — given a "local hour" policy (e.g. 9AM), compute the UTC send
 *    time for each contact based on their IANA timezone.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contactEngagement, contacts, emailEvents } from '../../db/schema/index.js';

// ─── Histogram maintenance ───────────────────────────────────────────────────

export async function recordOpen(contactId: string, orgId: string, at: Date = new Date()): Promise<void> {
  const hour = at.getUTCHours();
  const day = at.getUTCDay();

  // Upsert contact_engagement row, bumping the correct histogram slot.
  await db.execute(sql`
    INSERT INTO contact_engagement (contact_id, org_id, open_hour_histogram, open_day_histogram, total_opens)
    VALUES (
      ${contactId}::uuid,
      ${orgId}::uuid,
      jsonb_set(
        '[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb,
        ARRAY[${hour}::text],
        to_jsonb(1)
      ),
      jsonb_set(
        '[0,0,0,0,0,0,0]'::jsonb,
        ARRAY[${day}::text],
        to_jsonb(1)
      ),
      1
    )
    ON CONFLICT (contact_id) DO UPDATE SET
      open_hour_histogram = jsonb_set(
        contact_engagement.open_hour_histogram,
        ARRAY[${hour}::text],
        to_jsonb(COALESCE((contact_engagement.open_hour_histogram->>${hour}::text)::int, 0) + 1)
      ),
      open_day_histogram = jsonb_set(
        contact_engagement.open_day_histogram,
        ARRAY[${day}::text],
        to_jsonb(COALESCE((contact_engagement.open_day_histogram->>${day}::text)::int, 0) + 1)
      ),
      total_opens = contact_engagement.total_opens + 1,
      updated_at = now()
  `);
}

// ─── Best-hour / best-day computation ────────────────────────────────────────

function argmax(histogram: number[], fallback: number): number {
  let best = fallback;
  let bestVal = -1;
  for (let i = 0; i < histogram.length; i++) {
    if ((histogram[i] ?? 0) > bestVal) {
      bestVal = histogram[i] ?? 0;
      best = i;
    }
  }
  return bestVal > 0 ? best : fallback;
}

/** Best hour to send to a specific contact (UTC). Falls back to 10 AM. */
export async function bestHourForContact(contactId: string): Promise<number> {
  const [row] = await db
    .select({ hist: contactEngagement.openHourHistogram })
    .from(contactEngagement)
    .where(eq(contactEngagement.contactId, contactId))
    .limit(1);

  if (!row?.hist) return 10;
  return argmax(row.hist as number[], 10);
}

/** Org-wide best day (0=Sunday). Defaults to Tuesday. */
export async function bestDayForOrg(orgId: string): Promise<{ day: number; confidence: number }> {
  const rows = await db.execute<{ day: number; opens: number }>(sql`
    SELECT EXTRACT(DOW FROM ${emailEvents.createdAt})::int AS day,
           COUNT(*)::int AS opens
    FROM ${emailEvents}
    WHERE ${emailEvents.orgId} = ${orgId}::uuid
      AND ${emailEvents.eventType} = 'open'
      AND ${emailEvents.createdAt} > now() - interval '90 days'
    GROUP BY 1
    ORDER BY 1
  `);

  const histogram = Array(7).fill(0) as number[];
  let total = 0;
  for (const r of rows as unknown as Array<{ day: number; opens: number }>) {
    histogram[r.day] = r.opens;
    total += r.opens;
  }

  if (total === 0) return { day: 2, confidence: 0 };

  const best = argmax(histogram, 2);
  const confidence = Math.round((histogram[best]! / total) * 100) / 100;
  return { day: best, confidence };
}

// ─── Timewarp ────────────────────────────────────────────────────────────────

/**
 * Compute the UTC instant corresponding to a local wall-clock time in the
 * given IANA timezone, for a given date.
 */
export function localHourToUtc(date: Date, hour: number, minute: number, timezone: string): Date {
  // Build an ISO string in the target timezone using Intl to extract offset.
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const assumed = new Date(Date.UTC(year, month, day, hour, minute));

  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    const parts = dtf.formatToParts(assumed);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const tzDate = Date.UTC(
      get('year'), get('month') - 1, get('day'),
      get('hour'), get('minute'), get('second'),
    );
    const offset = tzDate - assumed.getTime();
    return new Date(assumed.getTime() - offset);
  } catch {
    return assumed; // Unknown timezone — treat as UTC.
  }
}

/**
 * For each contactId, return the UTC Date when their "local hour" occurs.
 * Contacts without a known timezone fall back to the fallbackTimezone.
 */
export async function computeTimewarpSchedule(
  contactIds: string[],
  baseDate: Date,
  localHour: number,
  fallbackTimezone = 'UTC',
): Promise<Map<string, Date>> {
  const result = new Map<string, Date>();
  if (contactIds.length === 0) return result;

  const rs = await db.execute<{ id: string; tz: string | null }>(sql`
    SELECT contact_id AS id, timezone AS tz
    FROM contact_engagement
    WHERE contact_id = ANY(${contactIds}::uuid[])
  `);

  const tzMap = new Map<string, string>();
  for (const r of rs as unknown as Array<{ id: string; tz: string | null }>) {
    if (r.tz) tzMap.set(r.id, r.tz);
  }

  for (const id of contactIds) {
    const tz = tzMap.get(id) ?? fallbackTimezone;
    result.set(id, localHourToUtc(baseDate, localHour, 0, tz));
  }
  return result;
}

/** Infer timezone from a contact's phone country code (crude but free). */
export function inferTimezoneFromCountry(country: string | null): string | null {
  if (!country) return null;
  const map: Record<string, string> = {
    CZ: 'Europe/Prague', SK: 'Europe/Bratislava', DE: 'Europe/Berlin',
    AT: 'Europe/Vienna', PL: 'Europe/Warsaw', HU: 'Europe/Budapest',
    GB: 'Europe/London', IE: 'Europe/Dublin', FR: 'Europe/Paris',
    ES: 'Europe/Madrid', IT: 'Europe/Rome', NL: 'Europe/Amsterdam',
    BE: 'Europe/Brussels', CH: 'Europe/Zurich', SE: 'Europe/Stockholm',
    NO: 'Europe/Oslo', DK: 'Europe/Copenhagen', FI: 'Europe/Helsinki',
    US: 'America/New_York', CA: 'America/Toronto', MX: 'America/Mexico_City',
    BR: 'America/Sao_Paulo', AR: 'America/Argentina/Buenos_Aires',
    AU: 'Australia/Sydney', NZ: 'Pacific/Auckland',
    JP: 'Asia/Tokyo', KR: 'Asia/Seoul', CN: 'Asia/Shanghai',
    IN: 'Asia/Kolkata', SG: 'Asia/Singapore',
  };
  return map[country.toUpperCase()] ?? null;
}

/** Backfill missing timezones by joining contacts.phone_country. */
export async function backfillContactTimezones(orgId: string): Promise<number> {
  const rows = await db
    .select({ id: contacts.id, country: contacts.phoneCountry })
    .from(contacts)
    .where(eq(contacts.orgId, orgId));

  let n = 0;
  for (const c of rows) {
    const tz = inferTimezoneFromCountry(c.country);
    if (!tz) continue;
    await db.execute(sql`
      INSERT INTO contact_engagement (contact_id, org_id, timezone)
      VALUES (${c.id}::uuid, ${orgId}::uuid, ${tz})
      ON CONFLICT (contact_id) DO UPDATE SET
        timezone = COALESCE(contact_engagement.timezone, EXCLUDED.timezone),
        updated_at = now()
    `);
    n++;
  }
  return n;
}
