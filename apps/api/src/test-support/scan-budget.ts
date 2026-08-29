/**
 * The time budget for a test that reads the whole source tree.
 *
 * A dozen tests in this package are source scanners: they walk `apps/api/src`
 * — upwards of twelve hundred TypeScript files — and read every one of them
 * looking for a shape that must not exist. They are cheap on an idle machine
 * and they are not cheap when the suite is running.
 *
 * The suite runs them in parallel. `vitest.config.ts` sets no `pool`,
 * `fileParallelism` or `maxWorkers`, so the defaults apply: the `forks` pool,
 * one fork per core less one. Every one of those forks may be reading the same
 * tree at the same time, and the scanners are the files that feel it.
 *
 * What that does to a scanner's wall clock, measured over ten consecutive runs
 * of this suite on one machine:
 *
 *   837 · 1132 · 1357 · 1309 · 1751 · 10345 · 1493 · 11382 · 9178 · 11599 ms
 *
 * The same test alone: about half a second. The distribution is bimodal —
 * either roughly a second, or roughly ten, nothing in between — and it shifts
 * wholesale with how loaded the machine is. On a busier machine the same suite
 * took two and a half times as long end to end and that test's floor moved up
 * with it. **This is contention, not a slow test.** Tuning the scanner does not
 * touch it; a lossless prefilter measured on one of them saved 487 ms against
 * a gap of several seconds.
 *
 * So the budget is not sized as a multiple of any measurement — those age, and
 * the number that looked like generous headroom on one machine was within a
 * few percent of the limit on another. It is sized to separate two things:
 *
 *   a scanner that is merely waiting its turn should finish
 *   a scanner that is genuinely stuck should still fail, and soon enough to
 *   be noticed
 *
 * A minute serves both. If a scanner starts crossing it, the answer is to
 * measure why — a hung read, a corpus that has outgrown a linear walk, a
 * machine doing something else — not to nudge this number up. Raising it to
 * make a red run green would be the same mistake as the ten scanners that sat
 * on the global 10 s until one of them started crossing that.
 *
 * Apply it to tests that read files **inside the test body**. A scanner whose
 * walk happens at describe scope pays that cost during collection, which this
 * does not govern, and its assertions stay on the global budget where they
 * belong.
 */
export const SCAN_TIMEOUT_MS = 60_000;
