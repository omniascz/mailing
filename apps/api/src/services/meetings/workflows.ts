/**
 * Meeting workflow triggers (#260).
 *
 * Fires workflow trigger events for meeting lifecycle:
 *   meeting_booked    — new confirmed booking
 *   meeting_canceled  — booking canceled
 *   meeting_reminder  — scheduled reminder (24h / 1h before)
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { bookings } from '../../db/schema/calendar.js';
import { onApiEvent } from '../workflows/triggers.js';
import { contacts } from '../../db/schema/contacts.js';
import { and } from 'drizzle-orm';

export type MeetingEventType = 'meeting_booked' | 'meeting_canceled' | 'meeting_reminder';

export async function triggerMeetingEvent(
  orgId: string,
  eventType: MeetingEventType,
  bookingId: string,
): Promise<void> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.orgId, orgId)))
    .limit(1);
  if (!booking) return;

  // Find contact by invitee email to resolve contactId for the workflow
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.email, booking.inviteeEmail)))
    .limit(1);

  if (!contact) return;

  await onApiEvent(orgId, contact.id, eventType, {
    bookingId: booking.id,
    hostUserId: booking.hostUserId,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    title: booking.title,
    meetingUrl: booking.meetingUrl ?? undefined,
    timezone: booking.timezone ?? undefined,
    status: booking.status,
  });
}

// ─── Schedule reminders via internal HTTP ────────────────────────────────────

export async function scheduleMeetingReminders(bookingId: string, orgId: string): Promise<void> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.orgId, orgId)))
    .limit(1);
  if (!booking || booking.status !== 'confirmed') return;

  const base = process.env.API_URL ?? 'http://localhost:3001';
  const startMs = booking.startAt.getTime();
  const now = Date.now();

  // 24h reminder
  const reminder24h = startMs - 24 * 60 * 60 * 1000;
  if (reminder24h > now) {
    scheduleReminder(base, orgId, bookingId, reminder24h);
  }

  // 1h reminder
  const reminder1h = startMs - 60 * 60 * 1000;
  if (reminder1h > now) {
    scheduleReminder(base, orgId, bookingId, reminder1h);
  }
}

/**
 * The reminder scheduler does not exist, at any of the three places it needs to.
 *
 * This POSTed to /api/v1/internal/schedule-job, a path never registered in any
 * commit here, asking for a job on the queue `meeting-reminders`, which has no
 * consumer and is not in QUEUE_NAMES. scheduleMeetingReminders itself has no
 * caller anywhere in the repo. So the chain is dead at the route, at the queue
 * and at the entry point.
 *
 * Writing the endpoint would be worse than leaving it: a generic
 * "enqueue this payload on this queue" route reachable over HTTP is a poor
 * thing to own, and it would feed a queue nobody drains. So the phantom call
 * goes, the intent stays, and the gap is now stated rather than mimed.
 */
function scheduleReminder(_base: string, orgId: string, bookingId: string, fireAtMs: number): void {
  console.warn(
    `[meetings] reminder scheduling is not wired — no job queued for booking ${bookingId} ` +
      `(org ${orgId}, due ${new Date(fireAtMs).toISOString()})`,
  );
}
