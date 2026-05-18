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
  const [booking] = await db.select().from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.orgId, orgId))).limit(1);
  if (!booking) return;

  // Find contact by invitee email to resolve contactId for the workflow
  const [contact] = await db.select({ id: contacts.id }).from(contacts)
    .where(and(
      eq(contacts.orgId, orgId),
      eq(contacts.email, booking.inviteeEmail),
    )).limit(1);

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
  const [booking] = await db.select().from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.orgId, orgId))).limit(1);
  if (!booking || booking.status !== 'confirmed') return;

  const base = process.env.API_URL ?? 'http://localhost:3001';
  const startMs = booking.startAt.getTime();
  const now = Date.now();

  // 24h reminder
  const reminder24h = startMs - 24 * 60 * 60 * 1000;
  if (reminder24h > now) {
    await scheduleReminder(base, orgId, bookingId, reminder24h).catch(() => {});
  }

  // 1h reminder
  const reminder1h = startMs - 60 * 60 * 1000;
  if (reminder1h > now) {
    await scheduleReminder(base, orgId, bookingId, reminder1h).catch(() => {});
  }
}

async function scheduleReminder(
  base: string,
  orgId: string,
  bookingId: string,
  fireAtMs: number,
): Promise<void> {
  await fetch(`${base}/api/v1/internal/schedule-job`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      queue: 'meeting-reminders',
      payload: { orgId, bookingId, eventType: 'meeting_reminder' },
      runAt: new Date(fireAtMs).toISOString(),
    }),
  });
}
