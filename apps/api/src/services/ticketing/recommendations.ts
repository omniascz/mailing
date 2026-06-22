/**
 * Event recommendations — item-based collaborative filtering over co-attendance
 * ("people who attended X also attended Y"). Powers the personalized "Discover"
 * digest and post-event cross-sell. Pure cores are unit-tested; the service
 * wrapper reads attendance from the DB.
 */
import { and, eq, gte } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { eventAttendance } from '../../db/schema/ticketing.js';

export interface AttendancePair {
  contactId: string;
  eventId: string;
}

/**
 * Co-occurrence matrix: for each event, how many shared attendees it has with
 * every other event. Symmetric. O(sum of per-contact event-count^2).
 */
export function coOccurrence(pairs: AttendancePair[]): Map<string, Map<string, number>> {
  const byContact = new Map<string, string[]>();
  for (const p of pairs) {
    const list = byContact.get(p.contactId) ?? [];
    if (!list.includes(p.eventId)) list.push(p.eventId);
    byContact.set(p.contactId, list);
  }

  const co = new Map<string, Map<string, number>>();
  const bump = (a: string, b: string) => {
    const m = co.get(a) ?? new Map<string, number>();
    m.set(b, (m.get(b) ?? 0) + 1);
    co.set(a, m);
  };

  for (const events of byContact.values()) {
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        bump(events[i]!, events[j]!);
        bump(events[j]!, events[i]!);
      }
    }
  }
  return co;
}

export interface Recommendation {
  eventId: string;
  score: number;
}

/**
 * Recommend events for a contact: sum co-occurrence from the events they
 * attended, excluding events they already attended. Ranked desc.
 */
export function recommendForContact(
  attendedEventIds: string[],
  co: Map<string, Map<string, number>>,
  opts: { limit?: number; eligibleEvents?: Set<string> } = {},
): Recommendation[] {
  const attended = new Set(attendedEventIds);
  const scores = new Map<string, number>();
  for (const ev of attendedEventIds) {
    const neighbours = co.get(ev);
    if (!neighbours) continue;
    for (const [other, count] of neighbours) {
      if (attended.has(other)) continue;
      if (opts.eligibleEvents && !opts.eligibleEvents.has(other)) continue;
      scores.set(other, (scores.get(other) ?? 0) + count);
    }
  }
  const ranked = [...scores.entries()]
    .map(([eventId, score]) => ({ eventId, score }))
    .sort((a, b) => b.score - a.score);
  return opts.limit ? ranked.slice(0, opts.limit) : ranked;
}

/** Build the org's co-occurrence matrix from recent attendance. */
export async function buildOrgCoOccurrence(orgId: string, sinceDays = 730) {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const rows = await db
    .select({ contactId: eventAttendance.contactId, eventId: eventAttendance.externalEventId })
    .from(eventAttendance)
    .where(
      and(
        eq(eventAttendance.orgId, orgId),
        eq(eventAttendance.status, 'purchased'),
        gte(eventAttendance.occurredAt, since),
      ),
    );
  return coOccurrence(rows);
}

/** Events a contact has already attended/purchased. */
export async function attendedByContact(orgId: string, contactId: string): Promise<string[]> {
  const rows = await db
    .select({ eventId: eventAttendance.externalEventId })
    .from(eventAttendance)
    .where(and(eq(eventAttendance.orgId, orgId), eq(eventAttendance.contactId, contactId)));
  return [...new Set(rows.map((r) => r.eventId))];
}
