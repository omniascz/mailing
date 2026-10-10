/**
 * Every link that tells a customer where to fix a pre-send criterion leads to
 * a page that exists in this app — and a criterion the customer cannot fix
 * themselves has no link, only words.
 *
 * Two sources of links, both checked in full:
 *  - the server's `fixHref` on each check (apps/api/.../go-no-go-pure.ts),
 *    read straight out of the source so a link added there later is covered
 *    without anyone remembering this test;
 *  - the panel's own remedy for each blocking criterion (remedyFor).
 *
 * "Exists" means a page.tsx under src/app whose path matches, with route
 * groups dropped and [param] segments matching any one segment — the same
 * rules Next uses to route.
 *
 * Before (Z127 probe): /settings/domains, /campaigns/settings/batch-delivery,
 * /editor/preferences and /settings/dedicated-ips had no page, and /editor was
 * a page but not this campaign's.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { remedyFor, SUPPORT_EMAIL } from './pre-send-report';

const APP = fileURLToPath(new URL('../../../', import.meta.url));
const PURE = fileURLToPath(
  new URL('../../../../../../api/src/services/pre-send/go-no-go-pure.ts', import.meta.url),
);

function pages(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) pages(p, out);
    else if (name === 'page.tsx') out.push(p);
  }
  return out;
}

/** Each page as a matcher: route groups dropped, [param] = one segment. */
const ROUTES = pages(APP).map((file) => {
  const segs = relative(APP, file)
    .split(sep)
    .slice(0, -1)
    .filter((s) => !(s.startsWith('(') && s.endsWith(')')));
  const path = '/' + segs.join('/');
  const re = new RegExp(
    '^/' +
      segs
        .map((s) => (s.startsWith('[') ? '[^/]+' : s.replace(/[.*+?^${}()|\\]/g, '\\$&')))
        .join('/') +
      '$',
  );
  return { path, re };
});

const routeFor = (href: string) => ROUTES.find((r) => r.re.test(href.split(/[?#]/)[0]!));

/** Every fixHref the server source writes, with template parts given a value. */
function serverFixHrefs(): string[] {
  const src = readFileSync(PURE, 'utf8');
  const found: string[] = [];
  for (const m of src.matchAll(/fixHref:\s*(['`])([^'`]+)\1/g)) {
    found.push(m[2]!.replace(/\$\{[^}]+\}/g, '00000000-0000-0000-0000-000000000001'));
  }
  return found;
}

const CRITERIA = [
  'domain-auth',
  'audience-empty',
  'audience-size',
  'suppression-match',
  'frequency-cap',
  'subject',
  'merge-tags',
  'unsubscribe-link',
  'preference-center-tag',
  'spam-score',
  'plain-text-alt',
  'ip-warmup',
  'bounce-rate',
  'complaint-rate',
  'schedule-time',
  'blacklist',
];

describe('matcher self-test', () => {
  it('the route list is real and the matcher tells pages apart', () => {
    expect(ROUTES.length).toBeGreaterThan(50);
    expect(routeFor('/domains')?.path).toBe('/domains');
    expect(routeFor('/campaigns/abc/edit')?.path).toBe('/campaigns/[id]/edit');
    expect(routeFor('/settings/domains')).toBeUndefined();
    expect(routeFor('/campaigns/abc/nope')).toBeUndefined();
  });

  it('the server source is read and its links are found', () => {
    expect(serverFixHrefs().length).toBeGreaterThan(0);
  });
});

describe('every fix link leads to a page that exists', () => {
  it('the server’s fixHref, every one of them', () => {
    const report = serverFixHrefs().map((h) => `${h} → ${routeFor(h)?.path ?? 'NO PAGE'}`);
    console.log(`[z127] server fixHref: ${JSON.stringify(report)}`);
    for (const h of serverFixHrefs()) expect(routeFor(h), `${h} leads to no page`).toBeDefined();
  });

  it('the panel’s remedy for every criterion', () => {
    const report = CRITERIA.map((id) => {
      const r = remedyFor(id, 'c1');
      return `${id}: ${r.href ? `${r.href} → ${routeFor(r.href)?.path ?? 'NO PAGE'}` : 'no link'}`;
    });
    console.log(`[z127] panel remedies: ${JSON.stringify(report)}`);
    for (const id of CRITERIA) {
      const r = remedyFor(id, 'c1');
      if (r.href) expect(routeFor(r.href), `${id}: ${r.href} leads to no page`).toBeDefined();
    }
  });
});

describe('a criterion the customer cannot fix has words, not a link', () => {
  it('blacklist: no link, and it says to contact support', () => {
    const r = remedyFor('blacklist', 'c1');
    expect(r.href).toBeUndefined();
    expect(r.text).toContain(SUPPORT_EMAIL);
    // And the server sends none either.
    const src = readFileSync(PURE, 'utf8');
    const blacklist = src.slice(src.indexOf('export function classifyBlacklist'));
    const FIX_HREF = /fixHref:\s*['`]/;
    // The pattern does catch a real one (and not this file's own comments).
    expect("      fixHref: '/settings/dedicated-ips',").toMatch(FIX_HREF);
    expect(blacklist).not.toMatch(FIX_HREF);
    expect(blacklist).toContain('support@mailforge.cz');
  });

  it('ip-warmup: no link, it says what to do', () => {
    const r = remedyFor('ip-warmup', 'c1');
    expect(r.href).toBeUndefined();
    expect(r.text).toMatch(/Naplánujte/);
  });
});
