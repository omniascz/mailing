import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  NOTHING_AVAILABLE,
  isAvailable,
  visibleEntries,
  visibleSections,
  type Capabilities,
} from './capabilities';

/**
 * The dashboard must not offer a feature this deployment cannot serve.
 *
 * Two of them looked finished when they were not: inbox preview reported
 * 'completed' against preview.mock.local without a Litmus key, and the campaign
 * geo panel was permanently empty with an empty state that named the missing
 * variable — an apology where a feature should be.
 *
 * One rule, shared by the sidebar's grouped nav and the command palette's flat
 * list, because two copies of "should this be visible" is how one of them ends
 * up still offering it.
 *
 * Both directions are asserted. A test that only proved the entry was hidden
 * would also pass if the entry had been deleted, and the requirement is that
 * setting the variable brings it back.
 */

const ALL: Capabilities = {
  meetingLocationTypes: ['physical', 'custom', 'zoom'],
  videoProviders: ['zoom'],
  inboxPreview: true,
  geoAnalytics: true,
  // Not something a deployment can turn on today — the API reports it false
  // unconditionally — but this fixture is "everything available", and the rule
  // under test is the visibility rule, not which flags are reachable.
  multivariateTests: true,
  // Every beyond-core group the dashboard has a page for. Same reasoning as
  // multivariateTests above: the fixture means "everything available", and the
  // rule under test is the visibility rule.
  beyondCoreGroups: [
    'ai-agent',
    'coupon',
    'ecommerce',
    'helpdesk',
    'loyalty-program',
    'meeting',
    'product-feed',
    'reviews-v2',
    'survey',
  ],
};

const NAV = [
  {
    label: 'Send',
    items: [
      { href: '/campaigns', label: 'Campaigns' },
      { href: '/inbox-preview', label: 'Inbox preview', requires: 'inboxPreview' as const },
    ],
  },
  {
    label: 'Preview only',
    items: [{ href: '/inbox-preview', label: 'Inbox preview', requires: 'inboxPreview' as const }],
  },
];

describe('isAvailable', () => {
  it('lets through anything with no requirement', () => {
    expect(isAvailable(NOTHING_AVAILABLE, undefined)).toBe(true);
  });

  it('hides a requirement the deployment does not meet', () => {
    expect(isAvailable(NOTHING_AVAILABLE, 'inboxPreview')).toBe(false);
    expect(isAvailable(NOTHING_AVAILABLE, 'geoAnalytics')).toBe(false);
    expect(isAvailable(NOTHING_AVAILABLE, 'multivariateTests')).toBe(false);
  });

  it('shows it again once the deployment meets it', () => {
    expect(isAvailable(ALL, 'inboxPreview')).toBe(true);
    expect(isAvailable(ALL, 'geoAnalytics')).toBe(true);
    expect(isAvailable(ALL, 'multivariateTests')).toBe(true);
  });
});

describe('visibleEntries — the command palette list', () => {
  it('drops the inbox preview entry by default', () => {
    const items = [
      { id: 'campaigns', requires: undefined },
      { id: 'inbox-preview', requires: 'inboxPreview' as const },
    ];
    expect(visibleEntries(items, NOTHING_AVAILABLE).map((i) => i.id)).toEqual(['campaigns']);
  });

  it('keeps it once Litmus is configured', () => {
    const items = [{ id: 'inbox-preview', requires: 'inboxPreview' as const }];
    expect(visibleEntries(items, ALL).map((i) => i.id)).toEqual(['inbox-preview']);
  });
});

describe('visibleSections — the sidebar', () => {
  it('drops the entry, and any section it emptied', () => {
    const out = visibleSections(NAV, NOTHING_AVAILABLE);
    expect(
      out.map((s) => s.label),
      'a section with nothing left in it is not a heading',
    ).toEqual(['Send']);
    expect(out[0]!.items.map((i) => i.label)).toEqual(['Campaigns']);
  });

  it('keeps everything once configured', () => {
    const out = visibleSections(NAV, ALL);
    expect(out.map((s) => s.label)).toEqual(['Send', 'Preview only']);
    expect(out[0]!.items).toHaveLength(2);
  });
});

describe('the fallback when the API cannot be reached', () => {
  it('is everything off', () => {
    // A dashboard that hides a working feature is a nuisance. One that offers a
    // broken feature is the bug being fixed.
    expect(NOTHING_AVAILABLE).toEqual({
      meetingLocationTypes: [],
      videoProviders: [],
      inboxPreview: false,
      geoAnalytics: false,
      multivariateTests: false,
      // No group is enabled either. Same reasoning as the flags above: a
      // dashboard that hides a working page is a nuisance, one that links to a
      // page whose routes were never registered is the bug being fixed.
      beyondCoreGroups: [],
    });
  });
});

/**
 * The /ab-tests entry is hidden, pinned where it can actually drift.
 *
 * Two halves make the proof, because this suite runs in a node environment
 * with no renderer:
 *
 *   1. `visibleSections` drops entries whose requirement is unmet — asserted
 *      above, against NOTHING_AVAILABLE.
 *   2. the real sidebar entry carries that requirement — asserted here, by
 *      reading the file, the same way apps/api's wiring guards do.
 *
 * Together: with `multivariateTests: false` (which is what the API always
 * reports) the entry is filtered out before render. The dashboard layout does
 * fetch capabilities and pass them to Sidebar, so the filter is really applied.
 *
 * A test that only asserted the first half would pass with the requirement
 * missing from the entry; one that only asserted the second would pass if the
 * filter were removed.
 */
describe('the A/B tests nav entry', () => {
  const sidebar = readFileSync(join(__dirname, '../components/dashboard/sidebar.tsx'), 'utf8');

  it('is declared with a multivariateTests requirement', () => {
    const entry = /\{[^{}]*href:\s*'\/ab-tests'[\s\S]{0,200}?\}/.exec(sidebar)?.[0] ?? '';
    expect(entry, 'the /ab-tests nav entry was not found in sidebar.tsx').not.toBe('');
    expect(entry).toContain("requires: 'multivariateTests'");
  });

  it('is dropped by the filter under the capabilities the API actually reports', () => {
    const nav = [
      {
        label: 'Send',
        items: [
          { href: '/campaigns', label: 'Campaigns' },
          { href: '/ab-tests', label: 'A/B tests', requires: 'multivariateTests' as const },
        ],
      },
    ];
    const out = visibleSections(nav, NOTHING_AVAILABLE);
    expect(out[0]!.items.map((i) => i.href)).toEqual(['/campaigns']);
  });
});

/**
 * The beyond-core nav is decided at RUNTIME now, and this pins that it stays so.
 *
 * It used to be a build-time boolean: Next.js inlines NEXT_PUBLIC_* into the
 * client bundle, so `NEXT_PUBLIC_FEATURE_BEYOND_CORE` was fixed when the image
 * was built. Revealing a page meant rebuilding and redeploying the web app, and
 * docker-compose.prod.yml never passed the build arg — the value was right by
 * absence rather than by decision. It was also one boolean against the API's
 * list of groups, so it could not show /surveys and hide /loyalty.
 *
 * The answer now comes from GET /api/v1/capabilities (`beyondCoreGroups`), the
 * same route the dashboard already asks about Litmus and geo, read fresh per
 * request by the process that made the decision.
 *
 * These three assert the old mechanism is GONE rather than merely unused. A
 * leftover `ARG` that nothing reads is a switch an operator will eventually
 * set, and then wonder why nothing happened.
 */
describe('the beyond-core nav is not decided at build time any more', () => {
  const dockerfile = readFileSync(join(__dirname, '../../Dockerfile'), 'utf8');

  it('the Dockerfile declares no such build arg', () => {
    expect(dockerfile).not.toMatch(/^ARG NEXT_PUBLIC_FEATURE_BEYOND_CORE/m);
    expect(dockerfile).not.toMatch(/^ENV NEXT_PUBLIC_FEATURE_BEYOND_CORE/m);
  });

  it('and no component reads the variable', () => {
    for (const file of [
      '../components/dashboard/sidebar.tsx',
      '../components/dashboard/command-palette.tsx',
    ]) {
      const source = readFileSync(join(__dirname, file), 'utf8');
      expect(source, `${file} still reads the build-time flag`).not.toContain(
        'NEXT_PUBLIC_FEATURE_BEYOND_CORE',
      );
    }
  });

  it('both components gate on the group reported by the API instead', () => {
    for (const file of [
      '../components/dashboard/sidebar.tsx',
      '../components/dashboard/command-palette.tsx',
    ]) {
      const source = readFileSync(join(__dirname, file), 'utf8');
      expect(source, `${file} must carry requiresGroup`).toContain('requiresGroup');
    }
  });
});
