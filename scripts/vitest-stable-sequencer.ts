import { BaseSequencer } from 'vitest/node';
import type { TestSpecification } from 'vitest/node';

/**
 * Run test files in a fixed order, so that running a suite twice is two
 * attempts at the same thing.
 *
 * ─── What vitest does by default ─────────────────────────────────────────────
 *
 * BaseSequencer.sort orders files like this (vitest 3.2.4):
 *
 *     if (!aState || !bState) {                    // no cached result
 *       if (!statsA || !statsB) return …           // run unknown first
 *       return statsB.size - statsA.size;          // run larger files first
 *     }
 *     if (aState.failed && !bState.failed) return -1;   // run failed first
 *     return bState.duration - aState.duration;         // run longer first
 *
 * The cache it reads is written to
 * `<pkg>/node_modules/.vite/vitest/<hash>/results.json` after every run. So the
 * order is a function of file size AND of what happened last time: a file that
 * failed moves to the front on the next run, and adding a file re-orders its
 * neighbours by size.
 *
 * For a unit suite that is a good trade — failing tests report sooner. For the
 * integration suites it is not, for two reasons:
 *
 *   - They set `fileParallelism: false`, so the packing that size-ordering
 *     exists to optimise never happens. There is nothing to gain.
 *   - They share one database. Order therefore has to be a property of the
 *     suite, not of the previous run's outcome — otherwise "run it again"
 *     silently means "run it in a different order", and a red run and the
 *     green rerun that follows are not comparable. That is precisely the
 *     evidence these suites are used to produce.
 *
 * Alphabetical by module id: stable across machines, across reruns, and
 * independent of whether the cache exists. `shard` is inherited unchanged, so
 * `--shard` keeps working.
 *
 * Note this fixes the ORDER, not the isolation. Files still share a database
 * and must not depend on each other — that is enforced separately by
 * apps/workers/src/lib/seed-org-read-only.test.ts.
 */
export class StableSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return [...files].sort((a, b) => {
      const ka = `${a.project.name}:${a.moduleId}`;
      const kb = `${b.project.name}:${b.moduleId}`;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  }
}
