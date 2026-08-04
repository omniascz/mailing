/**
 * Fill-the-house — yield engine for unsold seats. Ranks the org's audience for
 * a specific event and builds a progressive discount cascade that escalates as
 * the show approaches and seats remain. Pure cores are unit-tested; the service
 * wrapper loads candidates and enqueues sends via the normal campaign path.
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { externalEvents, eventAttendance } from '../../db/schema/ticketing.js';
import { contacts } from '../../db/schema/contacts.js';

export interface AudienceCandidate {
  contactId: string;
  city?: string | null;
  /** Categories the contact has attended before. */
  attendedCategories: string[];
  /** Days since the contact's last purchase (Infinity = never). */
  lapsedDays: number;
  /** Lifetime paid orders (frequency proxy). */
  orders: number;
}

export interface RankedCandidate extends AudienceCandidate {
  score: number;
}

/**
 * Score a candidate's fit for an event. Higher = send earlier / less discount.
 *  + same city as the venue
 *  + has attended the event's category before (affinity)
 *  + active recency (engaged but not dead) — peaks around recent buyers, decays
 *  + frequency
 * Excludes contacts who already hold a ticket for THIS event (passed pre-filtered).
 */
export function scoreCandidate(
  c: AudienceCandidate,
  event: { venueCity?: string | null; category?: string | null },
): number {
  let s = 0;
  if (event.venueCity && c.city && c.city.toLowerCase() === event.venueCity.toLowerCase()) s += 40;
  if (event.category && c.attendedCategories.some((cat) => cat === event.category)) s += 35;
  // recency: full credit ≤30d, linear decay to 0 by 365d, small floor for very lapsed
  if (Number.isFinite(c.lapsedDays)) {
    s += c.lapsedDays <= 30 ? 20 : Math.max(0, 20 * (1 - (c.lapsedDays - 30) / 335));
  }
  s += Math.min(15, c.orders * 3); // frequency, capped
  return Math.round(s * 100) / 100;
}

export function rankAudienceForEvent(
  candidates: AudienceCandidate[],
  event: { venueCity?: string | null; category?: string | null },
): RankedCandidate[] {
  return candidates
    .map((c) => ({ ...c, score: scoreCandidate(c, event) }))
    .sort((a, b) => b.score - a.score);
}

export interface CascadeStep {
  wave: number;
  /** Fraction of the ranked audience this wave targets (cumulative top-N). */
  audienceFraction: number;
  discountPct: number;
  /** Days before the event this wave should fire. */
  daysBeforeEvent: number;
  label: string;
}

/**
 * Build the discount cascade. Earlier waves = best-fit audience, no/low discount;
 * later waves widen reach and deepen discount as the event nears and seats remain.
 * Scales the number of waves to how much inventory must move.
 */
export function buildCascadeSteps(
  unsoldSeats: number,
  audienceSize: number,
  opts: { maxDiscountPct?: number } = {},
): CascadeStep[] {
  if (unsoldSeats <= 0 || audienceSize <= 0) return [];
  const maxDiscount = Math.min(50, opts.maxDiscountPct ?? 30);

  // Rough fill pressure: how big is the unsold pool vs the addressable audience.
  const pressure = Math.min(1, unsoldSeats / Math.max(1, audienceSize));

  const steps: CascadeStep[] = [
    {
      wave: 1,
      audienceFraction: 0.2,
      discountPct: 0,
      daysBeforeEvent: 14,
      label: 'Best-fit early access',
    },
    {
      wave: 2,
      audienceFraction: 0.5,
      discountPct: Math.round(maxDiscount / 3),
      daysBeforeEvent: 7,
      label: 'Affinity + light discount',
    },
    {
      wave: 3,
      audienceFraction: 0.85,
      discountPct: Math.round((maxDiscount * 2) / 3),
      daysBeforeEvent: 3,
      label: 'Wider reach',
    },
    {
      wave: 4,
      audienceFraction: 1.0,
      discountPct: maxDiscount,
      daysBeforeEvent: 1,
      label: 'Last-minute fill',
    },
  ];

  // Under low pressure, drop the deepest-discount last waves (no need to give it away).
  if (pressure < 0.1) return steps.slice(0, 2);
  if (pressure < 0.3) return steps.slice(0, 3);
  return steps;
}

/** Load addressable candidates for an event (excludes existing ticket-holders). */
export async function loadCandidates(
  orgId: string,
  externalEventId: string,
  limit = 5000,
): Promise<AudienceCandidate[]> {
  const since = new Date(Date.now() - 365 * 86_400_000);
  const rows = await db
    .select({
      contactId: contacts.id,
      // City is synced into custom_fields (no dedicated column on contacts).
      city: sql<string | null>`${contacts.customFields}->>'city'`,
      lastSeen: sql<string | null>`max(${eventAttendance.occurredAt})`,
      orders: sql<number>`count(*) filter (where ${eventAttendance.status} = 'purchased')::int`,
      cats: sql<string[]>`array_agg(distinct ${externalEvents.category})`,
    })
    .from(contacts)
    .innerJoin(eventAttendance, eq(eventAttendance.contactId, contacts.id))
    .innerJoin(externalEvents, eq(externalEvents.id, eventAttendance.externalEventId))
    .where(and(eq(contacts.orgId, orgId), gte(eventAttendance.occurredAt, since)))
    .groupBy(contacts.id)
    .limit(limit);

  // Exclude contacts already holding a ticket for THIS event.
  const holders = new Set(
    (
      await db
        .select({ contactId: eventAttendance.contactId })
        .from(eventAttendance)
        .where(
          and(
            eq(eventAttendance.orgId, orgId),
            eq(eventAttendance.externalEventId, externalEventId),
          ),
        )
    ).map((r) => r.contactId),
  );

  const now = Date.now();
  return rows
    .filter((r) => !holders.has(r.contactId))
    .map((r) => ({
      contactId: r.contactId,
      city: r.city,
      attendedCategories: (r.cats ?? []).filter((c): c is string => !!c),
      lapsedDays: r.lastSeen
        ? Math.floor((now - new Date(r.lastSeen).getTime()) / 86_400_000)
        : Infinity,
      orders: Number(r.orders ?? 0),
    }));
}

/** City of an event (for ranking). */
export async function getEventForYield(orgId: string, externalEventId: string) {
  const [e] = await db
    .select({
      id: externalEvents.id,
      category: externalEvents.category,
      venueCity: externalEvents.venueCity,
      unsoldSeats: externalEvents.unsoldSeats,
      startsAt: externalEvents.startsAt,
    })
    .from(externalEvents)
    .where(and(eq(externalEvents.orgId, orgId), eq(externalEvents.id, externalEventId)))
    .limit(1);
  return e ?? null;
}
