/**
 * Every group name the dashboard gates on is a group the API can register.
 *
 * A typo here fails silently in the worst way: `requiresGroup: 'loyalty'`
 * (the real name is `loyalty-program`) never matches anything the API reports,
 * so the link is hidden for ever and nobody finds out, because a hidden link
 * looks exactly like a group that is switched off. The API side refuses to boot
 * on an unknown name — #124 — but the web side has no boot to refuse, so this
 * test is the equivalent.
 *
 * ─── WHAT THIS SCAN CANNOT SEE ───────────────────────────────────────────────
 *
 * It reads the two component files as text and matches `requiresGroup: 'name'`
 * as a string literal. The matcher is proved against fixtures below rather than
 * trusted by eye — #118 shipped a scan that matched a literal path, called a
 * wired route dead, and nobody had checked the matcher.
 *
 * Blind to:
 *   - a name built at runtime. None exists; the union type would reject it, and
 *     the point of the literal is that it stays greppable.
 *   - whether the group is the RIGHT one for that page. That
 *     `/loyalty` needs `loyalty-program` and not `loyalty-reward` came from
 *     reading each page's API calls, and no scan can confirm it.
 *   - a page that SHOULD be gated and is not. A new beyond-core page with no
 *     `requiresGroup` is invisible here and would show in every deployment.
 *     The check below counts the gated entries against a pinned number so that
 *     adding one without a group at least moves a figure.
 *   - anything outside the two component files.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEYOND_CORE_GROUPS } from '@forgemsg/shared/beyond-core';

const here = dirname(fileURLToPath(import.meta.url));
const components = join(here, '../components/dashboard');

/** The matcher under test. */
function gatedNames(source: string): string[] {
  return [...source.matchAll(/requiresGroup:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]!);
}

describe('the matcher itself', () => {
  it('finds a name on a nav entry', () => {
    expect(gatedNames(`{ href: '/surveys', requiresGroup: 'survey' },`)).toEqual(['survey']);
  });

  it('finds several, in order', () => {
    expect(gatedNames(`requiresGroup: 'survey',\n  requiresGroup: 'loyalty-program',`)).toEqual([
      'survey',
      'loyalty-program',
    ]);
  });

  it('does not match the optional type declaration', () => {
    expect(gatedNames(`requiresGroup?: BeyondCoreGroupName;`)).toEqual([]);
  });

  it('does not match a name built at runtime — the documented blind spot', () => {
    expect(gatedNames(`requiresGroup: someName,`)).toEqual([]);
    expect(gatedNames('requiresGroup: `g-${x}`,')).toEqual([]);
  });

  it('tolerates extra whitespace', () => {
    expect(gatedNames(`requiresGroup:   'coupon'`)).toEqual(['coupon']);
  });
});

describe('the dashboard gates on names the API knows', () => {
  const sidebar = readFileSync(join(components, 'sidebar.tsx'), 'utf8');
  const palette = readFileSync(join(components, 'command-palette.tsx'), 'utf8');
  const used = [...gatedNames(sidebar), ...gatedNames(palette)];

  it('gates something at all', () => {
    expect(used.length).toBeGreaterThan(0);
  });

  it('every name is a real beyond-core group', () => {
    const known = new Set<string>(BEYOND_CORE_GROUPS);
    for (const name of used) {
      expect(known.has(name), `${name} is gated on but the API has no such group`).toBe(true);
    }
  });

  it('gates the eight pages the dashboard has, plus the palette entry', () => {
    // Eight sidebar links; the palette repeats ai-agent, so nine in total.
    expect(used).toHaveLength(9);
    expect(new Set(used).size).toBe(8);
  });

  it('the sidebar covers every beyond-core page the dashboard ships', () => {
    for (const g of [
      'ai-agent',
      'survey',
      'coupon',
      'loyalty-program',
      'reviews-v2',
      'meeting',
      'product-feed',
      'helpdesk',
    ]) {
      expect(gatedNames(sidebar), `${g} is not gated in the sidebar`).toContain(g);
    }
  });
});
