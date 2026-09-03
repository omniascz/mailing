/**
 * The dashboard shows exactly the beyond-core groups the API says it
 * registered.
 *
 * The rule itself is unit-tested in lib/capabilities.test.ts. This file renders
 * the real Sidebar and CommandPalette, because the rule being right does not
 * prove it is wired: the old mechanism was a second filter applied before the
 * render, and a nav that forgot to call visibleSections would pass every test
 * of visibleSections.
 *
 * WHAT THIS TEST CANNOT SEE
 * -------------------------
 * - `environment: 'node'` has no DOM. Components are rendered for their initial
 *   markup only. The command palette renders nothing until it is opened, so it
 *   is exercised through its exported item list rather than its markup, and
 *   that is stated where it happens rather than papered over.
 * - It does not prove the API actually reports these names. That pairing is
 *   nav-groups.test.ts, which checks them against BEYOND_CORE_GROUPS.
 * - It does not prove the page behind a shown link works. A group can be
 *   registered and still be one of the twelve the probe found broken.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NOTHING_AVAILABLE, type Capabilities } from '@/lib/capabilities';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

const { Sidebar } = await import('./sidebar');

/** Capabilities with a chosen set of groups and nothing else switched on. */
function withGroups(...beyondCoreGroups: string[]): Capabilities {
  return { ...NOTHING_AVAILABLE, beyondCoreGroups };
}

const markup = (capabilities: Capabilities) =>
  renderToStaticMarkup(<Sidebar capabilities={capabilities} />);

/**
 * Every beyond-core link the sidebar can show, and the group that must be
 * enabled for it. Kept here, in the test, deliberately: if it were imported
 * from the component the test would agree with whatever the component does.
 */
const LINKS: ReadonlyArray<{ href: string; label: string; group: string }> = [
  { href: '/ai-agents', label: 'AI agents', group: 'ai-agent' },
  { href: '/surveys', label: 'Surveys &amp; NPS', group: 'survey' },
  { href: '/coupons', label: 'Coupons', group: 'coupon' },
  { href: '/loyalty', label: 'Loyalty', group: 'loyalty-program' },
  { href: '/reviews', label: 'Reviews', group: 'reviews-v2' },
  { href: '/meetings', label: 'Meetings', group: 'meeting' },
  { href: '/product-feeds', label: 'Product feeds', group: 'product-feed' },
  { href: '/helpdesk', label: 'Helpdesk', group: 'helpdesk' },
];

describe('the default deployment shows no beyond-core link', () => {
  const html = markup(NOTHING_AVAILABLE);

  it.each(LINKS)('hides $href when no group is enabled', ({ href }) => {
    expect(html).not.toContain(`href="${href}"`);
  });

  it('still shows the core navigation', () => {
    // The guard must hide the beyond-core links and nothing else. Without this
    // a filter that dropped everything would pass the eight cases above.
    expect(html).toContain('href="/campaigns"');
    expect(html).toContain('href="/contacts"');
  });

  it('shows exactly the number of links it shows today', () => {
    // Measured on 829bb69 by rendering the pre-change Sidebar with
    // NOTHING_AVAILABLE and the build-time flag unset — the production default.
    // Pinned rather than derived: a derived count would move with the nav and
    // could not catch a link appearing by accident, which is the failure this
    // whole change is meant to make impossible.
    const count = (html.match(/href="/g) ?? []).length;
    expect(count).toBe(29);
  });
});

describe('a link appears when, and only when, its group is enabled', () => {
  it.each(LINKS)('$href appears with $group', ({ href, group }) => {
    expect(markup(withGroups(group))).toContain(`href="${href}"`);
  });

  it.each(LINKS)('$href stays hidden when a DIFFERENT group is enabled', ({ href, group }) => {
    // The half that matters. A filter that shows everything once any group is
    // on would pass the case above and fail here.
    const other = group === 'survey' ? 'coupon' : 'survey';
    expect(markup(withGroups(other))).not.toContain(`href="${href}"`);
  });

  it('shows two links when two groups are on, and no more', () => {
    const html = markup(withGroups('survey', 'loyalty-program'));
    expect(html).toContain('href="/surveys"');
    expect(html).toContain('href="/loyalty"');
    expect(html).not.toContain('href="/coupons"');
    expect(html).not.toContain('href="/helpdesk"');
  });

  it('shows all eight when all eight groups are on', () => {
    const html = markup(withGroups(...LINKS.map((l) => l.group)));
    for (const { href } of LINKS) expect(html, href).toContain(`href="${href}"`);
  });
});

describe('a section with nothing left in it disappears', () => {
  it('drops the Support section rather than leaving an empty heading', () => {
    // #95's lesson: a panel with no controls is worse than no panel. Helpdesk
    // is the only item in its section, so the heading must go with it.
    const off = markup(NOTHING_AVAILABLE);
    const on = markup(withGroups('helpdesk'));
    expect(on).toContain('Helpdesk');
    expect(off).not.toContain('Helpdesk');
  });
});

describe('the command palette agrees with the sidebar', () => {
  it('gates its beyond-core entry on the same group', async () => {
    // The palette renders null until opened, and `environment: 'node'` cannot
    // open it, so this reads the source for the pairing rather than asserting
    // markup that would always be empty.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(here, 'command-palette.tsx'), 'utf8');

    expect(source).toContain("requiresGroup: 'ai-agent'");
    // And it must go through the shared filter rather than its own copy.
    expect(source).toContain('visibleEntries(ITEMS, capabilities)');
    expect(source).not.toContain('BEYOND_CORE_HREFS');
  });
});
