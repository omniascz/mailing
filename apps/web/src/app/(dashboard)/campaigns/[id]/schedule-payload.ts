/**
 * The body POST /api/v1/campaigns/:id/schedule takes, built from what a
 * `datetime-local` input holds.
 *
 * A pure function for the same reason the other campaign payloads are
 * (#118, #119): a literal inside a click handler cannot be read, so the
 * campaign-field guard would never see that `scheduledAt` had acquired a
 * control — and `scheduledAt` is the field that guard flagged.
 *
 * TIME ZONE. `datetime-local` has no zone: it hands back wall-clock text like
 * `2026-09-02T09:00`. `new Date(...)` on that string reads it in the BROWSER's
 * zone, and `toISOString()` turns it into the absolute instant the column
 * stores (timestamptz). So the operator picks a time in the zone they are
 * sitting in, and it is stored as an instant — which is what a send needs.
 *
 * `campaigns.timezone` is deliberately not sent. The route would write it and
 * nothing anywhere reads it; sending it would put a value in a dead column and
 * make it look alive. See the note in the campaign-field guard.
 */

export type ScheduleResult =
  | { ok: true; payload: { scheduledAt: string } }
  | { ok: false; error: string };

/**
 * @param localValue the raw value of a `datetime-local` input
 * @param now injected so the boundary can be tested without waiting for a clock
 */
export function buildSchedulePayload(localValue: string, now: Date = new Date()): ScheduleResult {
  const trimmed = localValue.trim();
  if (!trimmed) return { ok: false, error: 'Pick a date and time first.' };

  const when = new Date(trimmed);
  if (Number.isNaN(when.getTime())) {
    return { ok: false, error: 'That is not a date this browser understands.' };
  }

  // Refused, not silently sent immediately. "Send it now" is what the Send now
  // button is for; turning a mistyped date into an immediate send to the whole
  // audience is the one mistake here that cannot be taken back. The server
  // refuses the same thing (scheduleCampaign, `scheduledAt must be in the
  // future`) and stays the authority — this only means the operator hears
  // about it before the request goes out, and on a machine whose clock is
  // wrong the server still has the last word.
  if (when.getTime() <= now.getTime()) {
    return { ok: false, error: 'That time has already passed. Pick a time in the future.' };
  }

  return { ok: true, payload: { scheduledAt: when.toISOString() } };
}

/** Every key this builder can send. Read by the campaign-field guard. */
export function schedulePayloadKeys(): string[] {
  const built = buildSchedulePayload('2999-01-01T09:00');
  if (!built.ok) throw new Error(`schedulePayloadKeys: ${built.error}`);
  return Object.keys(built.payload);
}

/**
 * A `datetime-local` value for the given instant, in the browser's own zone.
 *
 * `toISOString()` would be wrong here: it renders UTC, so the input would open
 * showing a time two hours off for anyone in Prague in summer.
 */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
