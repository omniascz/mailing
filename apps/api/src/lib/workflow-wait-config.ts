/**
 * Wait steps the executor cannot time are refused at save.
 *
 * executeWait (services/workflows/actions.ts:336-374) accepts three shapes:
 *
 *   { duration?: number, unit?: 'minutes' | 'hours' | 'days' }  — defaults 1, hours
 *   { until: string }   — an ISO date; an unparseable one fails the run
 *   { until: object }   — event-relative, resolved against the run's data;
 *                         unresolvable means the wait is skipped
 *
 * Anything else reached `duration * <ms>` as NaN. The New workflow form and the
 * editor both wrote `{ duration: { days, hours } }`, and a run on that step
 * failed with "Invalid time value" the moment it arrived — the save route took
 * it because `nodes` is validated as `{ id, type }` and nothing more.
 *
 * What is refused is only what cannot work: a duration that is not a finite
 * non-negative number, a unit the executor does not name, an `until` string
 * that is not a date. An `until` object is accepted whatever its keys, because
 * the executor never fails on one — and registry.ts ships templates with
 * `{ until: { event } }`, which this change is not the place to judge. Every
 * in-code template passes (workflow-wait-config.test.ts).
 *
 * Checked on POST and PUT /api/v1/workflows. Template forks and workflow import
 * write through other paths and are not covered here.
 */

import { AppError } from './app-error.js';

export const WAIT_UNITS = ['minutes', 'hours', 'days'] as const;

/** Why this wait config cannot be timed, or null when it can. */
export function waitConfigProblem(config: unknown): string | null {
  // executeWait reads `config.until` first, so a missing config throws there.
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    return 'config must be an object, for example { "duration": 1, "unit": "days" }';
  }
  const c = config as Record<string, unknown>;

  if (c.until !== undefined && c.until !== null) {
    if (typeof c.until === 'object') return null;
    if (typeof c.until === 'string') {
      return Number.isNaN(new Date(c.until).getTime()) ? `until "${c.until}" is not a date` : null;
    }
    return 'until must be a date string or an event-relative object';
  }

  if (c.duration !== undefined) {
    if (typeof c.duration !== 'number' || !Number.isFinite(c.duration) || c.duration < 0) {
      return (
        `duration must be a non-negative number, got ${JSON.stringify(c.duration)}` +
        ' — for example { "duration": 1, "unit": "days" }'
      );
    }
  }

  if (c.unit !== undefined && !(WAIT_UNITS as readonly unknown[]).includes(c.unit)) {
    return `unit must be one of ${WAIT_UNITS.join(', ')}, got ${JSON.stringify(c.unit)}`;
  }

  return null;
}

/** Throws a 400 naming the first wait node whose config cannot be timed. */
export function assertWaitConfigsValid(
  nodes: ReadonlyArray<{ id: string; type: string; config?: unknown }> | undefined,
): void {
  if (!nodes) return;
  for (const node of nodes) {
    if (node.type !== 'wait') continue;
    const problem = waitConfigProblem(node.config);
    if (problem) {
      throw new AppError({
        code: 'INVALID_WAIT_CONFIG',
        statusCode: 400,
        message: `Wait step "${node.id}": ${problem}.`,
      });
    }
  }
}
