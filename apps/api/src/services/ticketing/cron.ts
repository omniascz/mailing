/**
 * Ticketing cron orchestration — the timing/audience engines that fire
 * `ticketing.*` api_events for the seeded workflows to act on.
 *   - day-of      (per minute): reminders relative to event start
 *   - fill-house  (daily):      yield cascade waves for unsold seats
 *   - discover    (weekly):     personalized recommendation digest
 *
 * These pick WHO + WHEN; the seeded workflows define the MESSAGE.
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { externalEvents, eventAttendance } from '../../db/schema/ticketing.js';
import { onApiEvent } from '../workflows/triggers.js';
import { stepsDueNow } from './day-of.js';
import { loadCandidates, rankAudienceForEvent, buildCascadeSteps } from './fill-the-house.js';
import { buildOrgCoOccurrence, recommendForContact } from './recommendations.js';

const DAY = 86_400_000;
const PER_EVENT_CAP = 5000;

/** Day-of reminders: fire for attendees of events whose -24h email step is due. */
export async function runDayOfTick(nowMs = Date.now()): Promise<{ events: number; fired: number }> {
  const now = new Date(nowMs);
  // Events starting within the next 48h or ended ≤24h ago (covers all steps).
  const events = await db
    .select({
      id: externalEvents.id,
      orgId: externalEvents.orgId,
      title: externalEvents.title,
      url: externalEvents.url,
      startsAt: externalEvents.startsAt,
    })
    .from(externalEvents)
    .where(
      and(
        gte(externalEvents.startsAt, new Date(nowMs - DAY)),
        lte(externalEvents.startsAt, new Date(nowMs + 2 * DAY)),
      ),
    );

  // email step → ticketing.day_of_reminder, sms step → ticketing.day_of_sms.
  const TRIGGER: Record<string, string> = {
    email: 'ticketing.day_of_reminder',
    sms: 'ticketing.day_of_sms',
  };

  let fired = 0;
  for (const e of events) {
    if (!e.startsAt) continue;
    const due = stepsDueNow(e.startsAt, now, 1); // 1-min window matches the per-minute cron
    if (due.length === 0) continue;

    const attendees = await db
      .select({ contactId: eventAttendance.contactId })
      .from(eventAttendance)
      .where(and(eq(eventAttendance.orgId, e.orgId), eq(eventAttendance.externalEventId, e.id), eq(eventAttendance.status, 'purchased')))
      .limit(PER_EVENT_CAP);

    for (const step of due) {
      const trigger = TRIGGER[step.channel];
      if (!trigger) continue;
      for (const a of attendees) {
        await onApiEvent(e.orgId, a.contactId, trigger, {
          externalEventId: e.id,
          eventTitle: e.title,
          event_url: e.url ?? undefined,
          ticket_url: e.url ?? undefined,
        }).catch(() => {});
        fired++;
      }
    }
  }
  return { events: events.length, fired };
}

/** Fill-the-house: for unsold on-sale events, fire the cascade wave due today. */
export async function runFillTheHouseTick(nowMs = Date.now()): Promise<{ events: number; fired: number }> {
  const events = await db
    .select({
      id: externalEvents.id,
      orgId: externalEvents.orgId,
      category: externalEvents.category,
      venueCity: externalEvents.venueCity,
      url: externalEvents.url,
      unsoldSeats: externalEvents.unsoldSeats,
      startsAt: externalEvents.startsAt,
    })
    .from(externalEvents)
    .where(
      and(
        eq(externalEvents.status, 'on_sale'),
        gte(externalEvents.startsAt, new Date(nowMs)),
        sql`${externalEvents.unsoldSeats} > 0`,
      ),
    );

  let fired = 0;
  for (const e of events) {
    if (!e.startsAt || !e.unsoldSeats) continue;
    const daysUntil = Math.round((e.startsAt.getTime() - nowMs) / DAY);

    const candidates = await loadCandidates(e.orgId, e.id);
    if (candidates.length === 0) continue;

    const steps = buildCascadeSteps(e.unsoldSeats, candidates.length);
    const wave = steps.find((s) => s.daysBeforeEvent === daysUntil);
    if (!wave) continue; // no wave due today

    const ranked = rankAudienceForEvent(candidates, { venueCity: e.venueCity, category: e.category });
    const take = Math.max(1, Math.floor(ranked.length * wave.audienceFraction));
    for (const c of ranked.slice(0, take)) {
      await onApiEvent(e.orgId, c.contactId, 'ticketing.fill_the_house_offer', {
        externalEventId: e.id,
        wave: wave.wave,
        discountPct: wave.discountPct,
        event_url: e.url ?? undefined,
        buy_url: e.url ?? undefined,
      }).catch(() => {});
      fired++;
    }
  }
  return { events: events.length, fired };
}

/** Discover digest: per active contact, recommend co-attended events. */
export async function runDiscoverTick(): Promise<{ orgs: number; fired: number }> {
  const orgRows = (await db.execute<{ org_id: string }>(
    sql`SELECT DISTINCT org_id FROM event_attendance`,
  )) as unknown as Array<{ org_id: string }>;

  let fired = 0;
  for (const { org_id: orgId } of orgRows) {
    const co = await buildOrgCoOccurrence(orgId);
    // Active contacts: attended in the last 365 days.
    const contactsRows = await db
      .select({ contactId: eventAttendance.contactId, eventId: eventAttendance.externalEventId })
      .from(eventAttendance)
      .where(and(eq(eventAttendance.orgId, orgId), gte(eventAttendance.occurredAt, new Date(Date.now() - 365 * DAY))))
      .limit(50_000);

    const byContact = new Map<string, string[]>();
    for (const r of contactsRows) {
      const list = byContact.get(r.contactId) ?? [];
      if (!list.includes(r.eventId)) list.push(r.eventId);
      byContact.set(r.contactId, list);
    }

    for (const [contactId, attended] of byContact) {
      const recs = recommendForContact(attended, co, { limit: 5 });
      if (recs.length === 0) continue;
      await onApiEvent(orgId, contactId, 'ticketing.discover_digest', {
        recommendations: recs.map((r) => r.eventId),
      }).catch(() => {});
      fired++;
    }
  }
  return { orgs: orgRows.length, fired };
}
