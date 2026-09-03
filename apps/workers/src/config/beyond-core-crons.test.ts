/**
 * A cron starts with its group, not before it and not after it.
 *
 * Each of these posts to an `/api/v1/internal/*` route that only exists when a
 * particular group is registered on the API side. Started without it, the job
 * 404s on every tick — the state subscription-billing has been in since it
 * shipped, and the reason nobody reads the worker log.
 *
 * The pairing is asserted by reading index.ts rather than by booting the
 * workers, which would need Redis, BullMQ and a reachable API. What is being
 * checked is a wiring decision, and the wiring is in the source.
 *
 * ─── What this cannot see ────────────────────────────────────────────────────
 *
 * It matches `groupOn('name')` and `BEYOND_CORE_ENABLED.has('name')` as literal
 * text near the worker's start call. It cannot tell whether the group named is
 * the RIGHT one — that `internal-social` is really what registers
 * /internal/social/dispatch-due — only that a cron is gated on something and
 * that the something is a real group. The mapping itself is stated in comments
 * next to each call and was checked by hand against index.ts.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEYOND_CORE_GROUPS } from '@forgemsg/shared/beyond-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const indexSrc = fs.readFileSync(path.resolve(here, '../index.ts'), 'utf8');
const schedulerSrc = fs.readFileSync(path.resolve(here, '../jobs/workflow-scheduler.ts'), 'utf8');

/** The matcher under test. */
function gatedGroups(source: string): string[] {
  return [...source.matchAll(/(?:groupOn|BEYOND_CORE_ENABLED\.has)\(\s*'([a-z0-9-]+)'\s*\)/g)].map(
    (m) => m[1]!,
  );
}

describe('the matcher itself', () => {
  it('finds a groupOn call', () => {
    expect(gatedGroups(`const seoOn = groupOn('internal-seo-rank-poll');`)).toEqual([
      'internal-seo-rank-poll',
    ]);
  });

  it('finds a direct set membership test', () => {
    expect(gatedGroups(`if (env.BEYOND_CORE_ENABLED.has('browse-abandonment') && x) {`)).toEqual([
      'browse-abandonment',
    ]);
  });

  it('ignores the helper definition and prose', () => {
    expect(
      gatedGroups(`const groupOn = (g: BeyondCoreGroup) => env.BEYOND_CORE_ENABLED.has(g);`),
    ).toEqual([]);
    expect(gatedGroups(` * gated with groupOn('example') in the comment above`)).toEqual([
      // A mention inside prose DOES match — the matcher cannot tell code from a
      // comment. Stated rather than pretended away: it makes the test slightly
      // permissive, never falsely red.
      'example',
    ]);
  });
});

describe('every beyond-core cron is gated on a real group', () => {
  const gated = [...gatedGroups(indexSrc), ...gatedGroups(schedulerSrc)];

  it('gates something at all', () => {
    expect(gated.length).toBeGreaterThan(0);
  });

  it('names only real groups', () => {
    const known = new Set<string>(BEYOND_CORE_GROUPS);
    for (const g of gated) {
      expect(known.has(g), `${g} is gated on but is not a group`).toBe(true);
    }
  });

  it('gates the four cron families the probe found', () => {
    expect(gated).toContain('internal-seo-rank-poll');
    expect(gated).toContain('internal-social');
    expect(gated).toContain('internal-commerce');
    expect(gated).toContain('browse-abandonment');
  });

  it('no longer decides any of them on the old single flag', () => {
    // The whole point: one boolean must not still be gating a cron that now has
    // a group of its own.
    expect(indexSrc).not.toMatch(/env\.FEATURE_BEYOND_CORE/);
    expect(schedulerSrc).not.toMatch(/env\.FEATURE_BEYOND_CORE/);
  });

  it('each start call sits next to its gate, not behind a shared boolean', () => {
    // `const beyondCore = env.FEATURE_BEYOND_CORE` was the shared boolean that
    // made all three start together. It must be gone.
    expect(indexSrc).not.toMatch(/const beyondCore\s*=/);
    for (const starter of [
      'startSeoRankPollWorker',
      'startSocialSchedulerWorker',
      'startInvoiceReminderWorker',
    ]) {
      expect(indexSrc, `${starter} must be conditional`).toMatch(
        new RegExp(`\\w+On \\? ${starter}\\(\\) : null`),
      );
    }
  });
});
