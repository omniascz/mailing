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
  });

  it('shows it again once the deployment meets it', () => {
    expect(isAvailable(ALL, 'inboxPreview')).toBe(true);
    expect(isAvailable(ALL, 'geoAnalytics')).toBe(true);
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
    });
  });
});
