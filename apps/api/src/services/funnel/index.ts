/**
 * Funnel analysis — count contacts that progressed through an ordered sequence
 * of events. Drop-off at each step is exposed for visualisation.
 */

import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { AppError } from '../../lib/app-error.js';

export interface FunnelStep {
  event: string;
  count: number;
  conversionFromStart: number;
  conversionFromPrev: number;
}

export interface FunnelResult {
  steps: FunnelStep[];
  windowDays: number;
  totalEntered: number;
}

/**
 * Compute funnel over the supplied event list.
 * Each step must occur strictly after the previous one and within `windowDays`.
 * Events are taken from `email_events.event_type` (sends, opens, clicks…) and
 * `revenue_events.event_type` (purchase, …) — caller can mix them freely.
 */
export async function computeFunnel(
  orgId: string,
  input: {
    events: string[];
    windowDays?: number;
    since?: Date;
  },
): Promise<FunnelResult> {
  if (input.events.length < 2) throw AppError.badRequest('Need at least 2 events');
  if (input.events.length > 8) throw AppError.badRequest('Maximum 8 funnel steps');
  const windowDays = input.windowDays ?? 30;
  const since = input.since ?? new Date(Date.now() - windowDays * 86_400_000);

  // Pull every relevant event for the org+window into one virtual table, then
  // walk through the funnel in JS. This is fast for typical e-commerce funnels
  // because the per-event row count stays modest.
  const rows = await db.execute<{ contact_id: string; event_type: string; created_at: Date }>(sql`
    SELECT contact_id, event_type, created_at FROM email_events
    WHERE org_id = ${orgId}::uuid AND created_at >= ${since}
      AND contact_id IS NOT NULL AND event_type = ANY(${input.events})
    UNION ALL
    SELECT contact_id, event_type, created_at FROM revenue_events
    WHERE org_id = ${orgId}::uuid AND created_at >= ${since}
      AND contact_id IS NOT NULL AND event_type = ANY(${input.events})
    ORDER BY created_at ASC
  `);

  const byContact = new Map<string, Array<{ type: string; at: Date }>>();
  for (const r of rows as unknown as Array<{
    contact_id: string;
    event_type: string;
    created_at: Date;
  }>) {
    if (!byContact.has(r.contact_id)) byContact.set(r.contact_id, []);
    byContact.get(r.contact_id)!.push({ type: r.event_type, at: new Date(r.created_at) });
  }

  const counts = new Array<number>(input.events.length).fill(0);
  const windowMs = windowDays * 86_400_000;

  for (const events of byContact.values()) {
    let stepIdx = 0;
    let stepStart: Date | null = null;
    for (const ev of events) {
      const wanted = input.events[stepIdx]!;
      if (ev.type === wanted) {
        if (stepIdx === 0 || (stepStart && ev.at.getTime() - stepStart.getTime() <= windowMs)) {
          counts[stepIdx] = (counts[stepIdx] ?? 0) + 1;
          stepStart = ev.at;
          stepIdx++;
          if (stepIdx >= input.events.length) break;
        }
      }
    }
  }

  const total = counts[0] ?? 0;
  const steps: FunnelStep[] = input.events.map((event, i) => {
    const c = counts[i] ?? 0;
    const prev = i === 0 ? c : (counts[i - 1] ?? 0);
    return {
      event,
      count: c,
      conversionFromStart: total > 0 ? Math.round((c / total) * 1000) / 10 : 0,
      conversionFromPrev: prev > 0 ? Math.round((c / prev) * 1000) / 10 : 0,
    };
  });

  return { steps, windowDays, totalEntered: total };
}
