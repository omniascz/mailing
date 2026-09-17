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

/** The config patch the editor merges into a wait node. */
export function waitPatch(duration: number, unit: WaitUnit): TimedWait {
  const n = Number(duration);
  return { duration: Number.isFinite(n) && n > 0 ? n : 0, unit: isUnit(unit) ? unit : 'days' };
}
