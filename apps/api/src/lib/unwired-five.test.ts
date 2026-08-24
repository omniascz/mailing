/**
 * Five findings from docs/audit/UNWIRED-2026-08-19.md, and the assertion that
 * would have caught each one.
 *
 * They are one file because they share a shape: code that is finished, wired
 * to nothing or to nowhere, and silent about it. None of them throws, none
 * logs, and four of the five are visible only as an empty panel or a number
 * that looks measured. A test per finding is the cheapest way to keep that
 * shape from coming back one item at a time.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { substituteMergeTags, dropUnresolvedLinks } from '../services/workflows/actions.js';
import { SEED_DEFS } from '../services/ticketing/seed-workflows.js';
import { summarizeSubaccountReputation } from '../services/dedicated-ips/index.js';
import { mockProvider, selectProvider } from '../services/preview/providers.js';
import { isGeoConfigured, resolveGeo } from './geo.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─── 5. {{cart_url}} / {{review_url}} in the ticketing templates ─────────────

describe('a merge tag that does not resolve never becomes a link', () => {
  const contact = {
    id: 'c1',
    firstName: 'Jan',
    lastName: 'Novák',
    email: 'jan@example.test',
    phone: null,
    customFields: {},
    tags: [],
    listIds: [],
  };

  it('drops the anchor and keeps the words', () => {
    const html = '<p><a href="{{cart_url}}">Dokončit objednávku →</a></p>';
    const rendered = dropUnresolvedLinks(substituteMergeTags(html, contact, {}));
    expect(rendered).not.toContain('<a');
    expect(rendered).toContain('Dokončit objednávku →');
  });

  it('keeps the link when the value is there', () => {
    const html = '<p><a href="{{cart_url}}">Dokončit objednávku →</a></p>';
    const rendered = dropUnresolvedLinks(
      substituteMergeTags(html, contact, { cart_url: 'https://tickets.example.test/cart/9' }),
    );
    expect(rendered).toContain('href="https://tickets.example.test/cart/9"');
  });

  it('drops an empty href too — the other renderer substitutes unknowns with ""', () => {
    expect(dropUnresolvedLinks('<a href="">Ohodnotit →</a>')).toBe('Ohodnotit →');
    expect(dropUnresolvedLinks('<a href="  ">Ohodnotit →</a>')).toBe('Ohodnotit →');
  });

  it('leaves the rest of the document alone', () => {
    const html = '<p>Ahoj</p><a href="https://ok.test">ok</a><img src="{{x}}">';
    expect(dropUnresolvedLinks(html)).toBe(html);
  });

  it('no seeded ticketing template can emit a link to a literal merge tag', () => {
    // The two the audit named are the two whose events only the customer's own
    // system fires, so their URL is routinely absent. Asserting over the whole
    // catalog rather than those two keeps the next seed honest as well.
    const offenders: string[] = [];
    for (const def of SEED_DEFS) {
      const rendered = dropUnresolvedLinks(substituteMergeTags(def.html ?? '', contact, {}));
      for (const m of rendered.matchAll(/<a[^>]*\shref="([^"]*)"/gi)) {
        const href = m[1]!.trim();
        if (href === '' || /^\{\{.*\}\}$/.test(href)) offenders.push(`${def.key} → "${href}"`);
      }
    }
    expect(
      offenders,
      `Seeded templates rendering a dead link:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});

// ─── 3. Dedicated-IP reputation ─────────────────────────────────────────────

describe('an unmeasured reputation is not reported as a measurement', () => {
  it('averages nothing when nothing has been measured', () => {
    // Every IP in the product is in this state: updateReputation is the only
    // writer of reputation_score and it has no caller, so the column sits at
    // its '0' default. Averaging it produced a confident 0.00 per subaccount —
    // which reads as "measured, and terrible".
    const [row] = summarizeSubaccountReputation([
      { subaccountId: 'sub-1', reputationScore: '0', reputationUpdatedAt: null, todaySent: 120 },
      { subaccountId: 'sub-1', reputationScore: '0', reputationUpdatedAt: null, todaySent: 80 },
    ]);
    expect(row!.avgReputation).toBeNull();
    expect(row!.measuredIpCount).toBe(0);
    expect(row!.ipCount).toBe(2);
    expect(row!.totalSentToday).toBe(200);
  });

  it('averages only the measured ones once something writes a score', () => {
    const [row] = summarizeSubaccountReputation([
      {
        subaccountId: 'sub-1',
        reputationScore: '90',
        reputationUpdatedAt: new Date('2026-08-24T00:00:00Z'),
        todaySent: 10,
      },
      { subaccountId: 'sub-1', reputationScore: '0', reputationUpdatedAt: null, todaySent: 10 },
    ]);
    expect(row!.avgReputation).toBe(90);
    expect(row!.measuredIpCount).toBe(1);
    expect(row!.ipCount).toBe(2);
  });
});

// ─── 1. Geo enrichment ──────────────────────────────────────────────────────

describe('geo enrichment says when it is switched off', () => {
  beforeEach(() => {
    vi.stubEnv('GEOIP_API_URL', undefined);
  });

  it('reports itself unconfigured rather than merely returning nothing', () => {
    // resolveGeo returning null is the same answer for "no provider" and for
    // "this IP is not in the database". The panel could not tell the two apart,
    // so an unconfigured deployment drew an empty map that looked like a real
    // result — and GEOIP_API_URL is in neither compose file.
    expect(isGeoConfigured()).toBe(false);
  });

  it('resolves nothing, loudly, when unconfigured', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(resolveGeo('8.8.8.8')).resolves.toBeNull();
    expect(warn.mock.calls.flat().join(' ')).toMatch(/GEOIP_API_URL/);
    warn.mockRestore();
  });

  it('reports itself configured once a provider is set', () => {
    vi.stubEnv('GEOIP_API_URL', 'https://geo.example.test/{ip}');
    expect(isGeoConfigured()).toBe(true);
  });
});

// ─── 2. Inbox preview ───────────────────────────────────────────────────────

describe('a simulated inbox preview admits it is simulated', () => {
  beforeEach(() => {
    vi.stubEnv('LITMUS_API_KEY', undefined);
    vi.stubEnv('INBOX_PREVIEW_PROVIDER', undefined);
  });

  it('marks every mock render as simulated', async () => {
    // The screen renders <img src={r.thumbnailUrl}> against preview.mock.local,
    // a domain that does not resolve. Three broken images and no caption is
    // indistinguishable from a real render that failed to load.
    const job = await mockProvider.startJob({
      html: '<p>x</p>',
      clients: ['gmail_chrome'],
    } as never);
    const polled = await mockProvider.pollJob(job.providerJobId);
    expect(polled.results!.length).toBeGreaterThan(0);
    expect(polled.results!.every((r) => r.simulated === true)).toBe(true);
  });

  it('is only reachable by asking for it by name', () => {
    // selectProvider still falls back to the mock, but createPreviewJob refuses
    // with 501 before it gets there unless the mock was requested explicitly.
    // Asserting the opt-in is what keeps that gate meaningful.
    vi.stubEnv('INBOX_PREVIEW_PROVIDER', 'mock');
    expect(selectProvider().name).toBe(mockProvider.name);
  });
});

// ─── 4. The archive cron ────────────────────────────────────────────────────

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const JOBS_DIR = path.join(REPO, 'apps', 'workers', 'src', 'jobs');

describe('a job that says it runs on a schedule has one', () => {
  it('every worker module claiming a cron exports a scheduler index.ts calls', () => {
    // archive-email-events.ts opened with "Runs nightly (scheduled via BullMQ
    // cron)" and there was no scheduleArchive() to call — index.ts started the
    // consumer and nothing ever queued a job. email_events grew without a
    // ceiling and ARCHIVE_CUTOFF_DAYS did nothing, which is the one finding in
    // the audit marked hidden rather than visible: an unbounded table surfaces
    // as slow queries months later, not as a broken screen today.
    //
    // Scoped to modules whose own header claims a schedule. Most queues here
    // are event-driven — the API enqueues a send when a send happens — and
    // demanding a cron of those would be wrong.
    const index = fs.readFileSync(path.join(REPO, 'apps', 'workers', 'src', 'index.ts'), 'utf8');
    const called = new Set([...index.matchAll(/(schedule\w*)\s*\(/g)].map((m) => m[1]!));

    const offenders: string[] = [];
    for (const file of fs.readdirSync(JOBS_DIR)) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
      const text = fs.readFileSync(path.join(JOBS_DIR, file), 'utf8');

      const starts = [...text.matchAll(/export function (start\w*Worker[s]?)/g)].map((m) => m[1]!);
      if (!starts.some((fn) => index.includes(fn))) continue;

      const header = text.slice(0, Math.max(0, text.indexOf('*/') + 2));
      if (!/runs\s+(nightly|daily|hourly|every)|scheduled via|cron/i.test(header)) continue;

      const schedulers = [...text.matchAll(/export async function (schedule\w*)/g)].map(
        (m) => m[1]!,
      );
      if (!schedulers.length) offenders.push(`${file} — claims a schedule, exports no scheduler`);
      else if (!schedulers.some((fn) => called.has(fn)))
        offenders.push(`${file} — exports ${schedulers.join('/')}, index.ts calls none of them`);
    }

    expect(
      offenders,
      offenders.length
        ? `Workers whose header promises a schedule they do not have: ${offenders.join(' · ')}`
        : undefined,
    ).toEqual([]);
  });

  it('the archive job is queued nightly, on its own slot', () => {
    const text = fs.readFileSync(path.join(JOBS_DIR, 'archive-email-events.ts'), 'utf8');
    expect(text).toMatch(/repeat:\s*\{\s*pattern:\s*'20 3 \* \* \*'/);
  });
});
