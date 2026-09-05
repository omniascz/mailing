/**
 * Quiet hours must keep having exactly one authority.
 *
 * The defect this guards against is not a typo — it is a shape. There were two
 * places that both looked like configuration for "don't message people at
 * night": the `quiet_hours` table (settable, displayed, unenforced) and
 * `org_frequency_rules.quiet_hours_start/_end` (enforced, unsettable by any
 * route). Whichever one an engineer found first was the one they believed.
 *
 * So this asserts the property rather than the fix: no source file outside the
 * quiet-hours service may read a quiet-hours window off some other table, and
 * the midnight-wrap comparison exists in exactly one implementation.
 *
 * THE MATCHER IS SELF-TESTED FIRST. A scanner that silently matches nothing
 * passes every test it is pointed at — #118 — so before it is trusted on the
 * repository it is run against snippets whose answers are known, including the
 * exact code that used to be here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = join(import.meta.dirname, '..', '..');

/** The one place allowed to own the rule. */
const AUTHORITY = join('services', 'quiet-hours');

/**
 * A quiet-hours window read off a table column.
 *
 * Deliberately matches the COLUMN shape (`quiet_hours_start`) and its Drizzle
 * camelCase (`quietHoursStart`), not the words "quiet hours" — a comment
 * explaining the rule is not a second authority, and flagging prose would make
 * the guard so noisy someone would delete it.
 */
const WINDOW_COLUMN =
  /\b(quiet_hours_(start|end)|quietHours(Start|End))\b|\.\s*quietHours(Start|End)\b/;

/**
 * The midnight-wrap comparison, written inline. This is the duplication that
 * actually hurts: two spellings of "does this hour fall in a window that may
 * cross midnight" drift by one hour and nobody notices until 03:00.
 */
const INLINE_WRAP = /startHour\s*<=\s*(\w+\.)*endHour|\bstart\s*<=\s*end\s*\?/;

interface Finding {
  file: string;
  line: number;
  text: string;
}

function scan(content: string, file: string, re: RegExp): Finding[] {
  const out: Finding[] = [];
  content.split('\n').forEach((text, i) => {
    // A line that is only a comment is documentation, not an authority.
    const code = text.replace(/^\s*(\/\/|\*|\/\*).*$/, '');
    if (re.test(code)) out.push({ file, line: i + 1, text: text.trim() });
  });
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) acc.push(full);
  }
  return acc;
}

// ─── The self-test. If this block is wrong, everything below is theatre. ─────

describe('the matcher itself', () => {
  const POSITIVE_WINDOW = [
    // The exact line the send path used to run.
    'start: rule.quietHoursStart ?? null,',
    'end: rule.quietHoursEnd ?? null,',
    "quietHoursStart: smallint('quiet_hours_start'),",
    'if (input.quietHoursEnd !== null) {',
  ];
  const NEGATIVE_WINDOW = [
    '// Quiet hours deliberately do NOT live here.',
    ' * window blocks the send, regardless of count.',
    'const quiet = await isQuiet(input.orgId, input.channel, new Date(now));',
    "reason: 'quiet_hours',",
    "await db.insert(quietHours).values({ orgId, channel: 'all' });",
  ];

  it('matches every known reintroduction of the second window', () => {
    for (const line of POSITIVE_WINDOW) {
      expect(scan(line, 'x.ts', WINDOW_COLUMN), line).toHaveLength(1);
    }
  });

  it('does not match prose, the reason string, or the authority’s own call', () => {
    for (const line of NEGATIVE_WINDOW) {
      expect(scan(line, 'x.ts', WINDOW_COLUMN), line).toHaveLength(0);
    }
  });

  it('matches an inline midnight wrap, and not a call to the shared helper', () => {
    expect(scan('rule.startHour <= rule.endHour ? a : b', 'x.ts', INLINE_WRAP)).toHaveLength(1);
    expect(scan('start <= end ? inclusive : wrapping', 'x.ts', INLINE_WRAP)).toHaveLength(1);
    expect(
      scan('return hourInWindow(localHour, rule.startHour, rule.endHour);', 'x.ts', INLINE_WRAP),
    ).toHaveLength(0);
  });

  it('actually reads files — the scan is not looking at an empty set', () => {
    const files = walk(SRC);
    expect(files.length, 'walking src found nothing').toBeGreaterThan(500);
    expect(files.some((f) => f.includes(AUTHORITY))).toBe(true);
  });
});

// ─── The property ────────────────────────────────────────────────────────────

describe('quiet hours have one authority', () => {
  it('no file outside services/quiet-hours reads a quiet window off a table', () => {
    const findings: Finding[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file);
      if (rel.split(sep).join(sep).includes(AUTHORITY)) continue;
      findings.push(...scan(readFileSync(file, 'utf8'), rel, WINDOW_COLUMN));
    }
    expect(
      findings,
      `a second quiet-hours window came back:\n${findings
        .map((f) => `  ${f.file}:${f.line}  ${f.text}`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('the midnight wrap is implemented once', () => {
    const findings: Finding[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file);
      // pure.ts owns the comparison; everyone else calls it.
      if (rel.endsWith(join('frequency-capping', 'pure.ts'))) continue;
      findings.push(...scan(readFileSync(file, 'utf8'), rel, INLINE_WRAP));
    }
    expect(
      findings,
      `the wrap was re-implemented:\n${findings
        .map((f) => `  ${f.file}:${f.line}  ${f.text}`)
        .join('\n')}`,
    ).toEqual([]);
  });
});
