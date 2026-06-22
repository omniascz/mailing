/**
 * Day-of journey — schedules channel-appropriate touches relative to an event's
 * start: a reminder the day before (email), the ticket QR a couple hours before
 * (SMS), and a review prompt afterwards (push). Computed by ForgeMsg from the
 * synced event start time — the ticketing app doesn't have to push these.
 */

export type DayOfChannel = 'email' | 'sms' | 'push';

export interface DayOfStep {
  channel: DayOfChannel;
  /** Hours relative to event start (negative = before). */
  offsetHours: number;
  sendAt: Date;
  label: string;
}

const DEFAULT_STEPS: Array<{ channel: DayOfChannel; offsetHours: number; label: string }> = [
  { channel: 'email', offsetHours: -24, label: 'Reminder + how to get there' },
  { channel: 'sms', offsetHours: -2, label: 'Your ticket QR + doors info' },
  { channel: 'push', offsetHours: 18, label: 'How was it? Leave a review' },
];

/** Full schedule for an event; only steps still in the future are returned. */
export function computeDayOfSchedule(
  startsAt: Date,
  now: Date = new Date(),
  steps = DEFAULT_STEPS,
): DayOfStep[] {
  return steps
    .map((s) => ({ ...s, sendAt: new Date(startsAt.getTime() + s.offsetHours * 3_600_000) }))
    .filter((s) => s.sendAt.getTime() > now.getTime())
    .sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime());
}

/**
 * Steps whose sendAt falls inside the current cron tick window
 * [now - windowMinutes, now]. Used by a per-minute scheduler to fire due touches
 * exactly once.
 */
export function stepsDueNow(
  startsAt: Date,
  now: Date = new Date(),
  windowMinutes = 5,
  steps = DEFAULT_STEPS,
): DayOfStep[] {
  const windowStart = now.getTime() - windowMinutes * 60_000;
  return steps
    .map((s) => ({ ...s, sendAt: new Date(startsAt.getTime() + s.offsetHours * 3_600_000) }))
    .filter((s) => s.sendAt.getTime() > windowStart && s.sendAt.getTime() <= now.getTime());
}
