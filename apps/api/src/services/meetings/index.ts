/**
 * Meetings booking service (#256, #257).
 *
 * - getAvailableSlots: compute open time slots for an event type on a given date range
 * - createBooking: validate + persist booking, create calendar event, fire workflow trigger
 * - cancelBooking / rescheduleBooking: state transitions
 */

import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { eventTypes, bookingAvailability } from '../../db/schema/booking-pages.js';
import { bookings, calendarEvents } from '../../db/schema/calendar.js';
import { AppError } from '../../lib/app-error.js';
import { createVideoLink } from './video-links.js';
import { bookingWouldBeEmpty } from '../../lib/integration-capabilities.js';
import { triggerMeetingEvent } from './workflows.js';
import { pickNextHost } from './round-robin.js';

// ─── Slot computation ─────────────────────────────────────────────────────────

export interface Slot {
  startAt: string; // ISO-8601 UTC
  endAt: string;
}

export async function getAvailableSlots(
  eventTypeId: string,
  fromDate: Date,
  toDate: Date,
  requestedTimezone: string,
): Promise<Slot[]> {
  const [et] = await db.select().from(eventTypes).where(eq(eventTypes.id, eventTypeId)).limit(1);
  if (!et || !et.isActive) throw AppError.notFound('Event type');

  // Determine which user(s) to check
  const userIds =
    et.schedulingType === 'round-robin'
      ? et.teamMemberIds.length
        ? et.teamMemberIds
        : [et.ownerUserId]
      : [et.ownerUserId];

  // For each user, compute available windows then subtract busy blocks
  const allSlots: Slot[] = [];

  for (const userId of userIds) {
    const slots = await getSlotsForUser(userId, et, fromDate, toDate, requestedTimezone);
    allSlots.push(...slots);
  }

  // Deduplicate and sort by startAt
  const seen = new Set<string>();
  return allSlots
    .filter((s) => {
      const key = s.startAt;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

async function getSlotsForUser(
  userId: string,
  et: {
    durationMinutes: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    minNoticeMinutes: number;
    maxPerDay: number;
    bookingWindowDays: number;
  },
  fromDate: Date,
  toDate: Date,
  _timezone: string,
): Promise<Slot[]> {
  const [avail] = await db
    .select()
    .from(bookingAvailability)
    .where(eq(bookingAvailability.userId, userId))
    .limit(1);

  const schedule = avail?.schedule ?? defaultSchedule();
  const tz = avail?.timezone ?? 'UTC';
  const dateOverrides = avail?.dateOverrides ?? [];

  const now = new Date();
  const minNoticeMs = et.minNoticeMinutes * 60 * 1000;
  const slotDurationMs = et.durationMinutes * 60 * 1000;
  const bufferMs = (et.bufferBeforeMinutes + et.bufferAfterMinutes) * 60 * 1000;
  const stepMs = slotDurationMs + bufferMs;

  // Load busy blocks from calendar events
  const busyBlocks = await db
    .select({ startAt: calendarEvents.startAt, endAt: calendarEvents.endAt })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.orgId, sql`(SELECT org_id FROM users WHERE id = ${userId})`),
        gte(calendarEvents.startAt, fromDate),
        lte(calendarEvents.endAt, toDate),
        eq(calendarEvents.busy, true),
      ),
    );

  // Also count existing bookings per day for maxPerDay
  const existingBookings = await db
    .select({ startAt: bookings.startAt })
    .from(bookings)
    .where(
      and(
        eq(bookings.hostUserId, userId),
        gte(bookings.startAt, fromDate),
        lte(bookings.startAt, toDate),
        eq(bookings.status, 'confirmed'),
      ),
    );

  const bookingsPerDay = new Map<string, number>();
  for (const b of existingBookings) {
    const day = b.startAt.toISOString().slice(0, 10);
    bookingsPerDay.set(day, (bookingsPerDay.get(day) ?? 0) + 1);
  }

  const slots: Slot[] = [];
  const cursor = new Date(fromDate);

  while (cursor < toDate) {
    const dayOfWeek = getDayOfWeekInTz(cursor, tz);
    const dateStr = cursor.toISOString().slice(0, 10);
    const override = dateOverrides.find((d) => d.date === dateStr);

    if (override?.unavailable) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    const dayWindows = override
      ? [
          {
            dayOfWeek,
            startHour: override.startHour ?? 9,
            startMin: override.startMin ?? 0,
            endHour: override.endHour ?? 17,
            endMin: override.endMin ?? 0,
          },
        ]
      : schedule.filter((w) => w.dayOfWeek === dayOfWeek);

    for (const window of dayWindows) {
      const windowStart = toUtcMs(cursor, window.startHour, window.startMin, tz);
      const windowEnd = toUtcMs(cursor, window.endHour, window.endMin, tz);

      let t = windowStart;
      while (t + slotDurationMs <= windowEnd) {
        const slotStart = new Date(t);
        const slotEnd = new Date(t + slotDurationMs);

        const tooSoon = slotStart.getTime() - now.getTime() < minNoticeMs;
        const day = slotStart.toISOString().slice(0, 10);
        const tooMany = et.maxPerDay > 0 && (bookingsPerDay.get(day) ?? 0) >= et.maxPerDay;
        const busy = busyBlocks.some((b) => b.startAt < slotEnd && b.endAt > slotStart);

        if (!tooSoon && !tooMany && !busy) {
          slots.push({ startAt: slotStart.toISOString(), endAt: slotEnd.toISOString() });
        }
        t += stepMs;
      }
    }

    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }

  return slots;
}

// ─── Create booking ───────────────────────────────────────────────────────────

export interface BookingInput {
  eventTypeId: string;
  startAt: Date;
  inviteeEmail: string;
  inviteeName?: string;
  timezone?: string;
  answers?: Record<string, unknown>;
}

export async function createBooking(orgId: string, input: BookingInput) {
  const [et] = await db
    .select()
    .from(eventTypes)
    .where(and(eq(eventTypes.id, input.eventTypeId), eq(eventTypes.orgId, orgId)))
    .limit(1);
  if (!et || !et.isActive) throw AppError.notFound('Event type');

  const endAt = new Date(input.startAt.getTime() + et.durationMinutes * 60 * 1000);

  // Pick host for round-robin
  const hostUserId =
    et.schedulingType === 'round-robin'
      ? await pickNextHost(
          orgId,
          et.id,
          et.teamMemberIds.length ? et.teamMemberIds : [et.ownerUserId],
        )
      : et.ownerUserId;

  // Generate meeting link.
  //
  // The fallback to `et.locationValue` stays: a booking whose video provider is
  // unreachable is still a booking, and changing that is a separate decision.
  // What does not stay is the silence. `.catch(() => …)` discarded the reason,
  // so a misconfigured Zoom/Teams integration produced confirmed bookings with
  // no link and left nothing behind to explain why.
  const meetingUrl = await createVideoLink(et.locationType, {
    title: et.name,
    startAt: input.startAt,
    endAt,
    hostUserId,
    inviteeEmail: input.inviteeEmail,
  }).catch((err: unknown) => {
    console.error(
      `[meetings] video link for locationType='${et.locationType}' failed (eventType=${et.id}, org=${orgId}); booking falls back to locationValue:`,
      err,
    );
    return et.locationValue ?? null;
  });

  // A video event type that produced no link and has no fallback location
  // would be stored confirmed with meetingUrl: null and location: null — a
  // confirmation for a meeting that is nowhere. The slot gets blocked and the
  // invitee finds out at the start of the call.
  //
  // Chosen behaviour: refuse the booking, but only in that case. When the host
  // set a locationValue the meeting still has somewhere to be, and saving it
  // confirmed at that location is true — it simply has no video link.
  if (bookingWouldBeEmpty(et.locationType, meetingUrl, et.locationValue)) {
    throw new AppError({
      code: 'VIDEO_LINK_UNAVAILABLE',
      statusCode: 503,
      message:
        `This event type is set up for ${et.locationType}, which is not available right now. ` +
        `The booking was not made — please try again later or contact the organiser.`,
    });
  }

  const [booking] = await db
    .insert(bookings)
    .values({
      orgId,
      hostUserId,
      inviteeEmail: input.inviteeEmail,
      inviteeName: input.inviteeName ?? null,
      title: et.name,
      description: et.description ?? null,
      startAt: input.startAt,
      endAt,
      timezone: input.timezone ?? et.timezone,
      location: meetingUrl ?? et.locationValue ?? null,
      meetingUrl: meetingUrl ?? null,
      status: 'confirmed',
    })
    .returning();

  await triggerMeetingEvent(orgId, 'meeting_booked', booking!.id).catch(() => {});

  return booking!;
}

// ─── Cancel booking ───────────────────────────────────────────────────────────

export async function cancelBooking(orgId: string, bookingId: string): Promise<void> {
  const [row] = await db
    .update(bookings)
    .set({ status: 'canceled', updatedAt: new Date() })
    .where(and(eq(bookings.id, bookingId), eq(bookings.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('Booking');
  await triggerMeetingEvent(orgId, 'meeting_canceled', bookingId).catch(() => {});
}

// ─── Reschedule booking ───────────────────────────────────────────────────────

export async function rescheduleBooking(
  orgId: string,
  bookingId: string,
  newStartAt: Date,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.orgId, orgId)))
    .limit(1);
  if (!existing) throw AppError.notFound('Booking');

  const durationMs = existing.endAt.getTime() - existing.startAt.getTime();
  const newEndAt = new Date(newStartAt.getTime() + durationMs);

  await db
    .update(bookings)
    .set({ startAt: newStartAt, endAt: newEndAt, updatedAt: new Date() })
    .where(eq(bookings.id, bookingId));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultSchedule() {
  // Mon–Fri 9:00–17:00
  return [1, 2, 3, 4, 5].map((day) => ({
    dayOfWeek: day,
    startHour: 9,
    startMin: 0,
    endHour: 17,
    endMin: 0,
  }));
}

function getDayOfWeekInTz(date: Date, _tz: string): number {
  // Simplified: use JS day of week (0=Sun). Full impl would use Intl.DateTimeFormat.
  return date.getDay();
}

function toUtcMs(date: Date, hour: number, min: number, _tz: string): number {
  const d = new Date(date);
  d.setUTCHours(hour, min, 0, 0);
  return d.getTime();
}
