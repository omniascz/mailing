/**
 * Nobody constructs a Queue outside queues/index.ts.
 *
 * cron-retry.test.ts proves the queues that go through `cronQueue` have a
 * policy. It cannot see a queue that does not go through it — a fresh
 * `new Queue(name, { connection })` in a new job file is invisible to it, and
 * that is exactly the line of code this whole change exists to remove. So this
 * file reads the source.
 *
 * A source scan is the weakest kind of test in this repo: it has gone quietly
 * green six times, on a `\b` that was a backspace inside a template literal, a
 * comment truncated at the `//` inside an `https://`, a regex anchored to
 * end-of-line, a docstring quoting the specifier being searched for, a guard
 * checking a data shape that never occurs, and a comment claiming an assertion
 * that did not exist. The matcher is therefore exercised against text this
 * file writes itself, INCLUDING the exact shapes of those failures, before its
 * verdict on the real tree is believed.
 *
 * WHAT THIS TEST CANNOT SEE
 *  - It is text, not types. `const Q = Queue; new Q(...)`, a re-export, a
 *    dynamic import, or a queue built inside node_modules all pass.
 *  - It does not read apps/api, which has its own copy of the queue
 *    definitions (see the retention note in queues/index.ts). A `new Queue` on
 *    that side is out of this test's reach and out of this change's scope.
 *  - It says nothing about whether a queue that DOES go through cronQueue got
 *    the right profile. That is prose plus cron-retry.test.ts.
 *  - It cannot see a Queue constructed in a .js/.mjs file; it walks .ts only.
 *  - It SKIPS `*.test.ts`. Test files build queues on purpose, and two of the
 *    offenders it found on the first run were this file and its neighbour,
 *    matching `new Queue` inside their own self-test strings. The exemption is
 *    therefore load-bearing rather than convenient — and it is why `the scan
 *    input` below asserts the surviving set still reaches the job files.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(HERE, '..');

/** The only file allowed to say `new Queue`. */
const OWNER = join('queues', 'index.ts');

/**
 * Does this source text construct a BullMQ Queue?
 *
 * Deliberately a free function over a string. Every assertion below that
 * matters is preceded by one that feeds it text with a known answer, because a
 * matcher that cannot see a hit makes the real check vacuous and silent.
 */
export function constructsQueue(source: string): boolean {
  // `[^A-Za-z0-9_]` rather than \b before `new`: written as a character class
  // so it cannot become an escape sequence if this is ever moved into a
  // template literal, which is how one of the six failures happened.
  return /(^|[^A-Za-z0-9_])new\s+Queue\s*(<[^>]*>)?\s*\(/.test(source);
}

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsFilesUnder(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

describe('constructsQueue (matcher self-test)', () => {
  it('sees the plain form', () => {
    expect(constructsQueue("const q = new Queue('x', { connection });")).toBe(true);
  });

  it('sees the generic form, which is how blacklist-monitor was written', () => {
    expect(
      constructsQueue('export const q = new Queue<JobData>(\n  NAME,\n  { connection },\n);'),
    ).toBe(true);
    expect(constructsQueue('new Queue <Foo> (NAME, opts)')).toBe(true);
  });

  it('sees it on a line that is not the first', () => {
    // One of the six failures was a regex anchored to the end of a line; this
    // is the same class of mistake at the other end.
    expect(constructsQueue("import x from 'y';\nconst q = new Queue(NAME, o);\n")).toBe(true);
  });

  it('does not fire on cronQueue, which is the whole point', () => {
    expect(constructsQueue('const q = cronQueue(QUEUE_NAMES.WARMUP_ADVANCE);')).toBe(false);
  });

  it('does not fire on a word that merely ends in Queue', () => {
    expect(constructsQueue('renewQueue(name)')).toBe(false);
    expect(constructsQueue('const x = anewQueue(1);')).toBe(false);
  });

  it('does not fire on a mention that constructs nothing', () => {
    expect(constructsQueue('// prefer cronQueue over Queue')).toBe(false);
    expect(constructsQueue('type T = Queue<Foo>;')).toBe(false);
    expect(constructsQueue("import { Queue } from 'bullmq';")).toBe(false);
  });

  it('is not fooled by empty input', () => {
    expect(constructsQueue('')).toBe(false);
  });

  it('DOES fire inside a comment, and that is the honest behaviour', () => {
    // A previous scan in this repo truncated its input at `//` and lost the
    // rest of an https:// URL. Rather than parse comments — which is where
    // that class of bug comes from — this matcher does not try. A commented-out
    // `new Queue` will therefore fail the scan. That is a false positive, it
    // is loud, and it is fixed by deleting the dead line.
    expect(constructsQueue('// const q = new Queue(NAME, o);')).toBe(true);
  });
});

describe('the scan input', () => {
  it('finds a substantial number of source files, so the sweep is not empty', () => {
    // A walker that silently returns [] would make every assertion below pass.
    const files = tsFilesUnder(SRC);
    expect(files.length).toBeGreaterThan(20);
  });

  it('excludes tests, and nothing else', () => {
    const rel = tsFilesUnder(SRC).map((f) => relative(SRC, f).split(sep).join('/'));
    expect(rel.filter((f) => f.endsWith('.test.ts'))).toEqual([]);
    // The exemption must not have swallowed production code by accident.
    expect(rel.filter((f) => f.startsWith('jobs/')).length).toBeGreaterThan(10);
  });

  it('actually reaches the job files this change rewrote', () => {
    const rel = tsFilesUnder(SRC).map((f) => relative(SRC, f));
    expect(rel).toContain(join('jobs', 'warmup-advance.ts'));
    expect(rel).toContain(join('jobs', 'workflow-scheduler.ts'));
    expect(rel).toContain(OWNER);
  });

  it('the owner file is one the matcher fires on, so the exemption is real', () => {
    // If queues/index.ts stopped containing `new Queue`, the exemption below
    // would be dead weight and this test would be checking nothing.
    const owner = readFileSync(join(SRC, OWNER), 'utf8');
    expect(constructsQueue(owner)).toBe(true);
  });
});

describe('apps/workers', () => {
  it('constructs Queues in exactly one file', () => {
    const offenders = tsFilesUnder(SRC)
      .filter((f) => relative(SRC, f) !== OWNER)
      .filter((f) => constructsQueue(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f).split(sep).join('/'));

    expect(
      offenders,
      'these build a Queue directly, which carries no defaultJobOptions and so ' +
        'gets attempts: 0 — use cronQueue(name) from queues/index.ts instead:\n' +
        offenders.join('\n'),
    ).toEqual([]);
  });
});
