import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  availableVideoProviders,
  availableLocationTypes,
  inboxPreviewAvailable,
  geoAnalyticsAvailable,
  capabilities,
  assertLocationTypeAvailable,
  bookingWouldBeEmpty,
} from './integration-capabilities.js';

/**
 * Availability is derived from configuration, never hardcoded.
 *
 * Each of these features answered requests whether or not its integration
 * existed, producing something that looked like a result: a booking confirmed
 * with no meeting link, an inbox preview "completed" against
 * preview.mock.local, a geo panel permanently empty. This is the single place
 * the API and the frontend agree on what is actually offerable.
 *
 * Both directions are asserted deliberately. A test that only proves the
 * feature is hidden would also pass if the feature had been deleted, and
 * deleting it is not what was asked for.
 */

const ORIGINAL = { ...process.env };
const ZOOM = {
  ZOOM_ACCOUNT_ID: 'acct',
  ZOOM_CLIENT_ID: 'id',
  ZOOM_CLIENT_SECRET: 'secret',
};
const TEAMS = {
  MICROSOFT_TENANT_ID: 'tenant',
  MICROSOFT_CLIENT_ID: 'id',
  MICROSOFT_CLIENT_SECRET: 'secret',
};

beforeEach(() => {
  process.env = {};
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('video providers', () => {
  it('offers none by default', () => {
    expect(availableVideoProviders()).toEqual([]);
    expect(availableLocationTypes()).toEqual(['physical', 'custom']);
  });

  it('offers zoom once its three credentials are set', () => {
    process.env = { ...ZOOM };
    expect(availableVideoProviders()).toEqual(['zoom']);
    expect(availableLocationTypes()).toContain('zoom');
  });

  it('offers teams once its three credentials are set, independently of zoom', () => {
    process.env = { ...TEAMS };
    expect(availableVideoProviders()).toEqual(['teams']);
  });

  it('needs all three: a partial set is not configured', () => {
    process.env = { ZOOM_ACCOUNT_ID: 'acct', ZOOM_CLIENT_ID: 'id' };
    expect(availableVideoProviders()).toEqual([]);
  });

  it('treats an empty or whitespace value as unset', () => {
    // The shape a deployment produces when it passes every variable through
    // unconditionally: present, empty, and useless.
    process.env = { ...ZOOM, ZOOM_CLIENT_SECRET: '   ' };
    expect(availableVideoProviders()).toEqual([]);
  });

  it('never offers google_meet, configured or not', () => {
    process.env = { ...ZOOM, ...TEAMS, GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y' };
    expect(availableLocationTypes()).not.toContain('google_meet');
  });
});

describe('inbox preview', () => {
  it('is unavailable by default', () => {
    expect(inboxPreviewAvailable()).toBe(false);
  });

  it('becomes available with a Litmus key', () => {
    process.env = { LITMUS_API_KEY: 'key' };
    expect(inboxPreviewAvailable()).toBe(true);
  });

  it('counts an explicit mock opt-in as available', () => {
    // Asking for the mock by name is a decision. Getting it because nothing
    // else was configured is the bug.
    process.env = { INBOX_PREVIEW_PROVIDER: 'mock' };
    expect(inboxPreviewAvailable()).toBe(true);
  });
});

describe('geo analytics', () => {
  it('is unavailable by default', () => {
    expect(geoAnalyticsAvailable()).toBe(false);
  });

  it('becomes available with GEOIP_API_URL', () => {
    process.env = { GEOIP_API_URL: 'https://geo.example.test/{ip}' };
    expect(geoAnalyticsAvailable()).toBe(true);
  });
});

describe('the payload the frontend reads', () => {
  it('reports everything off in an unconfigured deployment', () => {
    expect(capabilities()).toEqual({
      meetingLocationTypes: ['physical', 'custom'],
      videoProviders: [],
      inboxPreview: false,
      geoAnalytics: false,
    });
  });

  it('reports everything on once configured — hidden, not removed', () => {
    process.env = {
      ...ZOOM,
      ...TEAMS,
      LITMUS_API_KEY: 'key',
      GEOIP_API_URL: 'https://geo.example.test/{ip}',
    };
    expect(capabilities()).toEqual({
      meetingLocationTypes: ['physical', 'custom', 'zoom', 'teams'],
      videoProviders: ['zoom', 'teams'],
      inboxPreview: true,
      geoAnalytics: true,
    });
  });
});

describe('assertLocationTypeAvailable — the event type cannot be created with a provider we lack', () => {
  it('refuses zoom by default, naming the provider and what is left', () => {
    let message = '';
    try {
      assertLocationTypeAvailable('zoom');
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message, 'an unconfigured provider must be refused, not silently accepted').toMatch(
      /zoom is not configured/,
    );
    expect(message).toMatch(/physical, custom/);
  });

  it('refuses teams by default', () => {
    expect(() => assertLocationTypeAvailable('teams')).toThrow(/teams is not configured/);
  });

  it('allows zoom once configured — hidden, not removed', () => {
    process.env = { ...ZOOM };
    expect(() => assertLocationTypeAvailable('zoom')).not.toThrow();
  });

  it('never blocks the options that need no integration', () => {
    for (const t of ['physical', 'custom', undefined]) {
      expect(() => assertLocationTypeAvailable(t)).not.toThrow();
    }
  });
});

describe('bookingWouldBeEmpty — no confirmed booking with nowhere to go', () => {
  it('refuses a video booking with no link and no fallback', () => {
    expect(
      bookingWouldBeEmpty('zoom', null, null),
      'this is the booking stored confirmed with meetingUrl null and location null',
    ).toBe(true);
  });

  it('allows it when the host set a fallback location', () => {
    // Still a real meeting, just without video. Saving it is true.
    expect(bookingWouldBeEmpty('zoom', null, 'Kavárna Slavia, Praha')).toBe(false);
  });

  it('allows it when a link was produced', () => {
    expect(bookingWouldBeEmpty('zoom', 'https://zoom.us/j/123', null)).toBe(false);
  });

  it('leaves non-video event types alone', () => {
    expect(bookingWouldBeEmpty('physical', null, null)).toBe(false);
    expect(bookingWouldBeEmpty('custom', null, null)).toBe(false);
  });
});
