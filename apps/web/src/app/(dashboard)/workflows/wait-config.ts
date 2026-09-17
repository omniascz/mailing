/**
 * The wait step, in the shape the executor times.
 *
 * apps/api services/workflows/actions.ts executeWait reads
 * `{ duration: number, unit: 'minutes' | 'hours' | 'days' }` — or an `until`,
 * which this page does not author. The form and the editor used to write
 * `{ duration: { days, hours } }`; `duration * 86_400_000` was NaN and every run
 * failed on that step with "Invalid time value". The API now refuses that shape
 * (apps/api lib/workflow-wait-config.ts), so both sides have to agree on this
 * one.
 *
 * No `@/` imports: apps/api's integration suite loads this file by path to
 * build the exact config the editor saves.
 */

export const WAIT_UNITS = ['minutes', 'hours', 'days'] as const;
export type WaitUnit = (typeof WAIT_UNITS)[number];

// A type alias, not an interface: the editor passes it where a
// Record<string, unknown> config patch is expected.
export type TimedWait = {
  duration: number;
  unit: WaitUnit;
};

/** What the "New workflow" form seeds: one day. */
export const DEFAULT_WAIT: TimedWait = { duration: 1, unit: 'days' };

const isUnit = (v: unknown): v is WaitUnit => WAIT_UNITS.includes(v as WaitUnit);

/**
 * How long the executor will wait for this config, for display and editing.
 * `null` for an `until` wait, which is timed from the run's data and is not
 * editable here.
 *
 * A config saved before this change may still hold `{ days, hours }`; it is
 * read as the time it was meant to be, so saving it from the editor repairs it.
 */
export function readWait(config: Record<string, unknown>): TimedWait | null {
  if (config.until !== undefined && config.until !== null) return null;

  const raw = config.duration;
  if (raw && typeof raw === 'object') {
    const { days = 0, hours = 0 } = raw as { days?: number; hours?: number };
    const d = Number(days) || 0;
    const h = Number(hours) || 0;
    return h === 0 ? { duration: d, unit: 'days' } : { duration: d * 24 + h, unit: 'hours' };
  }

  // The executor's own defaults: a missing duration is 1, a missing unit is hours.
  const duration = typeof raw === 'number' && Number.isFinite(raw) ? raw : 1;
  const unit = config.unit === undefined ? 'hours' : isUnit(config.unit) ? config.unit : 'days';
  return { duration, unit };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** 1530 minutes → "1 day 1 hour 30 minutes". */
function span(totalMinutes: number): string {
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = Math.round(totalMinutes % 60);
  const parts = [];
  if (days) parts.push(plural(days, 'day'));
  if (hours) parts.push(plural(hours, 'hour'));
  if (minutes) parts.push(plural(minutes, 'minute'));
  return parts.join(' ');
}

/**
 * How long this wait step waits, in words — read the way executeWait
 * (apps/api services/workflows/actions.ts:336-374) reads it, in the same order:
 * an `until` object, then an `until` string, then duration and unit.
 *
 * Shapes the executor cannot use say so instead of pretending: the old
 * `{ duration: { days, hours } }` object, which may sit in the database until
 * the workflow is saved again, fails every run on this step, and an `until`
 * object without a date `field` is skipped.
 */
export function describeWait(config: Record<string, unknown>): string {
  const until = config.until;

  if (until && typeof until === 'object') {
    const u = until as {
      field?: unknown;
      offsetDays?: number;
      offsetHours?: number;
      offsetMinutes?: number;
    };
    if (typeof u.field !== 'string') return 'Skipped — no date field to wait for';
    const offset =
      (Number(u.offsetDays) || 0) * 1440 +
      (Number(u.offsetHours) || 0) * 60 +
      (Number(u.offsetMinutes) || 0);
    if (offset === 0) return `At ${u.field}`;
    return `${span(Math.abs(offset))} ${offset < 0 ? 'before' : 'after'} ${u.field}`;
  }

  if (typeof until === 'string') {
    const at = new Date(until);
    if (Number.isNaN(at.getTime())) return 'Until an invalid date — runs fail on this step';
    return `Until ${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  }

  const raw = config.duration;
  if (raw && typeof raw === 'object') {
    const { days = 0, hours = 0 } = raw as { days?: number; hours?: number };
    const meant = span((Number(days) || 0) * 1440 + (Number(hours) || 0) * 60) || 'No delay';
    return `${meant} — old format; runs fail on this step until it is saved again in the editor`;
  }

  // The executor's defaults: duration 1, unit hours; any other unit counts as days.
  const duration = raw === undefined ? 1 : Number(raw);
  if (!Number.isFinite(duration)) return 'Invalid duration — runs fail on this step';
  const unit =
    config.unit === undefined
      ? 'hours'
      : config.unit === 'minutes' || config.unit === 'hours'
        ? config.unit
        : 'days';
  if (duration === 0) return 'No delay';
  return plural(duration, unit.slice(0, -1));
}

/** The config patch the editor merges into a wait node. */
export function waitPatch(duration: number, unit: WaitUnit): TimedWait {
  const n = Number(duration);
  return { duration: Number.isFinite(n) && n > 0 ? n : 0, unit: isUnit(unit) ? unit : 'days' };
}
