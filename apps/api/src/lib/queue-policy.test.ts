/**
 * Every queue this package builds carries a retry policy, and it builds them
 * all in one file.
 *
 * apps/api is the OTHER producer. It has its own copy of the queue definitions
 * and writes into the same physical Redis queues as apps/workers —
 * `campaign-splitter`, `mta-other` and `batch-sender-triggered` are written
 * from both sides, and BullMQ takes a job's options from whoever added it. So
 * a queue defined here without `defaultJobOptions` would hand jobs
 * `attempts: 0` on a queue the other package thinks is covered.
 *
 * `attempts: 0` is what bullmq 5 fills in for a queue built as
 * `new Queue(name, { connection })`, and its retry check is
 * `attemptsMade + 1 < opts.attempts` — `0 + 1 < 0`, false. No retry, no
 * message.
 *
 * The queues are BUILT here, not described: `new Queue()` needs no reachable
 * Redis to construct — measured, importing this module with nothing listening
 * returns in well under a second and every `opts.defaultJobOptions` reads back
 * intact. The unit suite stays infrastructure-free.
 *
 * Enumeration is by module export rather than by a list, because a list is the
 * thing that drifts. Add an exported queue and it is covered without touching
 * this file.
 *
 * WHAT THIS TEST CANNOT SEE
 *  - It does not check apps/workers. That package has its own guard; this one
 *    cannot import it (no workspace dependency) and would not want to — the
 *    point is that each side carries its own.
 *  - It therefore CANNOT catch the two sides disagreeing about a shared queue,
 *    which is the drift `queues.ts` warns about in its retention comment. Both
 *    sides having *a* policy is what is checked; that the policies match is
 *    still prose on both sides.
 *  - It never runs a job, so it proves what a queue was built with, not that
 *    bullmq honours it.
 *  - Options passed per `add()` override these and are invisible here.
 *  - A queue that is constructed but never exported is invisible to the
 *    enumeration. That is what the source scan at the bottom is for.
 *  - The scan needs BOTH a `new Queue(` in the text and a `Queue` imported
 *    from bullmq. A file that gets the class by some other route — a
 *    re-export, `require`, a dynamic import — constructs a queue this cannot
 *    see. That is the price of not exempting files by name.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(HERE, '..');

/** The only file in apps/api allowed to say `new Queue`. */
const OWNER = join('lib', 'queues.ts');

interface QueueLike {
  name: string;
  opts?: { defaultJobOptions?: { attempts?: number } };
  close: () => Promise<void>;
}

/**
 * Is this export a BullMQ queue?
 *
 * A free function over an arbitrary value so the assertions can feed it things
 * with known answers. A predicate that says "no" to everything would make the
 * enumeration empty and every check below vacuous — which is precisely how a
 * guard in this repo goes quietly green.
 */
export function isQueueLike(value: unknown): value is QueueLike {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.name === 'string' && typeof v.close === 'function' && 'opts' in v;
}

/**
 * Does this source text construct a BullMQ Queue?
 *
 * `[^A-Za-z0-9_]` rather than `\b`, written as a character class so it cannot
 * turn into an escape sequence if this ever moves inside a template literal —
 * a `\b` that was a backspace is one of the ways a scan in this repo went
 * green while seeing nothing.
 */
export function constructsQueue(source: string): boolean {
  return /(^|[^A-Za-z0-9_])new\s+Queue\s*(<[^>]*>)?\s*\(/.test(source);
}

/**
 * Does this file import `Queue` from bullmq?
 *
 * The second signal, and the reason there is no exemption list.
 * `constructsQueue` deliberately does not try to skip comments — stripping
 * them is how a scan in this repo lost the rest of an `https://` — so it fires
 * on prose. `lib/queue-contracts.ts` documents the guard by writing
 * "the raw `new Queue(...)` is passed straight in here", and on text alone
 * that is indistinguishable from the real thing.
 *
 * Requiring the import instead of exempting the file makes the check
 * STRONGER, not weaker: a file that never imports Queue cannot construct one,
 * and an exemption would still have been passing the file even after somebody
 * added a real construction to it. queue-contracts.ts imports nothing from
 * bullmq at all — verified, and asserted below.
 */
export function importsQueue(source: string): boolean {
  // `import { ..., Queue, ... } from 'bullmq'`, alias or not, plus the
  // namespace form. Multi-line import blocks are why this is not line-based.
  //
  // The boundaries around Queue are character classes, not a backslash-b escape, on purpose.
  // Writing this file through a shell heredoc turned a backslash-b into a literal
  // backspace and left the pattern matching nothing useful — the same failure
  // that has made scans in this repo go green six times. The self-test below
  // is what caught it.
  const named =
    /import\s*(type\s+)?\{[^}]*(^|[^A-Za-z0-9_])Queue([^A-Za-z0-9_]|$)[^}]*\}\s*from\s*['"]bullmq['"]/;
  const namespace = /import\s*\*\s*as\s+\w+\s*from\s*['"]bullmq['"]/;
  return named.test(source) || namespace.test(source);
}

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsFilesUnder(full));
    // Tests build queues on purpose and quote `new Queue` in their own
    // assertions; mailing-e2e.test.ts does exactly that. Production code is
    // what this scan is about.
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const opened: QueueLike[] = [];

/**
 * The queues, imported ONCE and outside any test body.
 *
 * This used to be `await import('./queues.js')` inside each case that needed
 * it. That import is not cheap and it is not pure: queues.ts constructs its
 * queues at module scope — `new Queue('email', …)`, sms, webhook, viber-send
 * and the rest — so resolving it opens a dozen-plus ioredis connections to
 * REDIS_URL. Paying for that inside `it()` puts it against `testTimeout`,
 * which is 10_000 ms, and under sixteen busy workers that is not always
 * enough: measured here as one `Test timed out in 10000ms` in five suite runs,
 * on a file whose tests otherwise finish in under a second.
 *
 * It is the same shape that made this suite flaky before — a dynamic import in
 * a function body, charged to a budget sized for assertions.
 *
 * `beforeAll` rather than a top-level import, deliberately. A static import
 * would move the cost to collection, which vitest runs for every file in the
 * suite at once — the moment of heaviest contention, and one with no timeout
 * to report if it goes wrong. It would also open those Redis connections even
 * for a run that selected only the source-scanning cases in this file, which
 * need no queues at all. In a hook the cost is paid once, lazily, against
 * `hookTimeout` (30_000 ms), and it stays symmetrical with the `afterAll`
 * below that closes what it opened.
 *
 * No SCAN_TIMEOUT_MS here: the scanning half of this file has roughly twenty
 * times the headroom it needs. The import was the problem, not the scan.
 */
let queues: [string, QueueLike][] | null = null;

beforeAll(async () => {
  const mod = (await import('./queues.js')) as Record<string, unknown>;
  queues = Object.entries(mod).filter((e): e is [string, QueueLike] => isQueueLike(e[1]));
  for (const [, q] of queues) if (!opened.includes(q)) opened.push(q);
});

afterAll(async () => {
  await Promise.all(opened.map((q) => q.close().catch(() => {})));
});

/**
 * Synchronous by design. If the hook above did not run — a `.only` elsewhere, a
 * refactor that drops it — this says so instead of quietly enumerating nothing
 * and letting every per-queue assertion pass over an empty list.
 */
function loadQueues(): [string, QueueLike][] {
  if (queues === null) throw new Error('queues were not loaded: the beforeAll hook did not run');
  return queues;
}

describe('isQueueLike (predicate self-test)', () => {
  it('accepts the shape a BullMQ Queue has', () => {
    expect(isQueueLike({ name: 'x', opts: {}, close: async () => {} })).toBe(true);
  });

  it('rejects things that merely look queue-ish', () => {
    expect(isQueueLike({ name: 'x', close: async () => {} })).toBe(false); // no opts
    expect(isQueueLike({ opts: {}, close: async () => {} })).toBe(false); // no name
    expect(isQueueLike({ name: 'x', opts: {} })).toBe(false); // no close
  });

  it('rejects the values a module export actually holds', () => {
    // PRIORITY, the `queues` map, a plain function — all exported from
    // queues.ts, none of them a queue.
    expect(isQueueLike({ TRANSACTIONAL: 1 })).toBe(false);
    expect(isQueueLike(() => {})).toBe(false);
    expect(isQueueLike('campaign-splitter')).toBe(false);
    expect(isQueueLike(null)).toBe(false);
    expect(isQueueLike(undefined)).toBe(false);
    expect(isQueueLike(42)).toBe(false);
  });
});

describe('constructsQueue (matcher self-test)', () => {
  it('sees the plain and the guarded form', () => {
    expect(constructsQueue("export const q = new Queue('email', queueOpts);")).toBe(true);
    expect(constructsQueue("guardQueue(new Queue('sms', queueOpts), 'sms')")).toBe(true);
  });

  it('sees the generic and the multi-line form', () => {
    expect(constructsQueue('new Queue<Data>(\n  NAME,\n  opts,\n)')).toBe(true);
    expect(constructsQueue("import x from 'y';\nconst q = new Queue(N, o);\n")).toBe(true);
  });

  it('does not fire on a mention that constructs nothing', () => {
    expect(constructsQueue('type T = Queue<Foo>;')).toBe(false);
    expect(constructsQueue("import { Queue } from 'bullmq';")).toBe(false);
    expect(constructsQueue('renewQueue(name)')).toBe(false);
  });

  it('is not fooled by empty input', () => {
    expect(constructsQueue('')).toBe(false);
  });

  it('fires on prose, which is why it is not used alone', () => {
    // Not a defect to fix by stripping comments — that is how the `//` inside
    // an `https://` truncated an earlier scan in this repo. It is handled by
    // requiring importsQueue as well.
    expect(constructsQueue(' * the raw `new Queue(...)` is passed straight in')).toBe(true);
  });
});

describe('importsQueue (matcher self-test)', () => {
  it('sees the named import, aliased or not', () => {
    expect(importsQueue("import { Queue } from 'bullmq';")).toBe(true);
    expect(importsQueue("import { Queue, Worker } from 'bullmq';")).toBe(true);
    expect(importsQueue("import { Worker, Queue as Q } from 'bullmq';")).toBe(true);
    // Multi-line block, written with String.raw so the escapes survive.
    expect(importsQueue(['import {', '  Queue,', "} from 'bullmq';"].join('\n'))).toBe(true);
  });

  it('sees the namespace import', () => {
    expect(importsQueue("import * as bullmq from 'bullmq';")).toBe(true);
  });

  it('does not fire on bullmq imports that bring no Queue', () => {
    expect(importsQueue("import { Worker } from 'bullmq';")).toBe(false);
    expect(importsQueue("import type { Job } from 'bullmq';")).toBe(false);
  });

  it('does not fire on a Queue imported from somewhere else', () => {
    expect(importsQueue("import { Queue } from './my-queue.js';")).toBe(false);
  });

  it('is not fooled by empty input', () => {
    expect(importsQueue('')).toBe(false);
  });
});

describe('every queue apps/api exports', () => {
  it('there are at least as many as the module defines today', () => {
    // A floor. An enumeration that silently returned [] would make the
    // per-queue checks below pass without looking at anything.
    expect(loadQueues().length).toBeGreaterThanOrEqual(12);
  });

  it('carries a non-zero attempts', async () => {
    const failures: string[] = [];
    for (const [exportName, q] of loadQueues()) {
      const attempts = q.opts?.defaultJobOptions?.attempts;
      if (typeof attempts !== 'number' || attempts < 1) {
        failures.push(`${exportName} (queue "${q.name}") has attempts: ${String(attempts)}`);
      }
    }
    expect(
      failures,
      'a queue built without defaultJobOptions gets attempts: 0 from bullmq, ' +
        'which means no retry at all:\n' +
        failures.join('\n'),
    ).toEqual([]);
  });

  it('covers the three queues apps/workers also writes to', async () => {
    // Named rather than derived: these are the ones where a missing policy on
    // this side would be invisible from the other. If they leave queues.ts,
    // this goes red and somebody has to think about it.
    const names = new Set(loadQueues().map(([, q]) => q.name));
    for (const shared of ['campaign-splitter', 'mta-other', 'batch-sender-triggered']) {
      expect(names, `${shared} is no longer defined here`).toContain(shared);
    }
  });

  it('has a name, so a nameless queue cannot pass the checks above', async () => {
    for (const [exportName, q] of loadQueues()) {
      expect(q.name.trim().length, `${exportName} has a blank name`).toBeGreaterThan(0);
    }
  });
});

describe('the scan input', () => {
  it('finds a substantial number of source files', () => {
    expect(tsFilesUnder(SRC).length).toBeGreaterThan(50);
  });

  it('excludes tests, and nothing else', () => {
    const rel = tsFilesUnder(SRC).map((f) => relative(SRC, f).split(sep).join('/'));
    expect(rel.filter((f) => f.endsWith('.test.ts'))).toEqual([]);
    expect(rel).toContain('lib/queues.ts');
    expect(rel.filter((f) => f.startsWith('routes/')).length).toBeGreaterThan(10);
  });

  it('the owner file trips both signals, so the exemption is load-bearing', () => {
    // Without this, the exemption could be excluding a file that never matched
    // anyway, and the sweep would be checking nothing.
    const owner = readFileSync(join(SRC, OWNER), 'utf8');
    expect(constructsQueue(owner)).toBe(true);
    expect(importsQueue(owner)).toBe(true);
  });

  it('queue-contracts.ts trips the text signal and not the import one', () => {
    // The file that made the second signal necessary. It writes
    // "the raw `new Queue(...)`" in a docblock and imports nothing from
    // bullmq. If it ever does import Queue, this goes red and the sweep starts
    // judging it on its code — which is the correct outcome, not a regression.
    const src = readFileSync(join(SRC, 'lib', 'queue-contracts.ts'), 'utf8');
    expect(constructsQueue(src)).toBe(true);
    expect(importsQueue(src)).toBe(false);
  });
});

describe('apps/api', () => {
  it('constructs Queues in exactly one file', () => {
    const offenders = tsFilesUnder(SRC)
      .filter((f) => relative(SRC, f) !== OWNER)
      .filter((f) => {
        const src = readFileSync(f, 'utf8');
        // Both signals. Either alone gives a false positive: the text alone
        // fires on a docstring, the import alone fires on a type-only use.
        return constructsQueue(src) && importsQueue(src);
      })
      .map((f) => relative(SRC, f).split(sep).join('/'));

    expect(
      offenders,
      'these build a Queue outside lib/queues.ts, so it carries neither the ' +
        'shared retry policy nor guardQueue:\n' +
        offenders.join('\n'),
    ).toEqual([]);
  });
});
