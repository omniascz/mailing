import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
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
 * Pay for the module graph in a hook, not in the first test.
 *
 * These files import the module under test lazily — after vi.mock and after the
 * env for the case is in place — so the whole graph (queues, bullmq, the db
 * client, …) is transformed and executed inside whichever test ran first, and
 * charged to its 10s budget. Measured on an idle machine this file needed
 * 8-22s in the full suite while taking under 2s alone: the cost is contention
 * during that first load, not the assertions.
 *
 * Loading it once here moves that to setup, where it belongs. vitest caches the
 * transform, so the per-test vi.resetModules() re-executes a warm graph
 * (measured: 1719ms cold, 309ms after a reset) and the tests time what they
 * are actually about.
 *
 * The explicit budget is on this hook alone. Loading a module graph under
 * contention is setup and needs room; the tests keep the suite's strict 10s,
 * because a test that needs longer than that is telling you something.
 */
beforeAll(async () => {
  await import('../services/preview/inbox-preview.js');
}, 60_000);

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

/**
 * Only the keys this module reads are touched.
 *
 * These hooks used to assign `process.env = {}` and restore a copy afterwards.
 * That replaces the object itself — for the whole forked worker, not just this
 * file — and vitest reuses a fork across test files, so whatever ran next in it
 * inherited a plain object in place of the real one. It also wiped DATABASE_URL,
 * REDIS_URL and everything else for the duration of each test, which is a very
 * wide blast radius for a module that reads nine keys.
 *
 * vi.stubEnv sets and deletes individual keys on the real process.env and
 * vi.unstubAllEnvs puts them back, so identity survives and nothing outside
 * this list is affected.
 */
const CAPABILITY_KEYS = [
  'ZOOM_ACCOUNT_ID',
  'ZOOM_CLIENT_ID',
  'ZOOM_CLIENT_SECRET',
  'MICROSOFT_TENANT_ID',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'LITMUS_API_KEY',
  'INBOX_PREVIEW_PROVIDER',
  'GEOIP_API_URL',
] as const;

/** Clears the capability keys, then applies the ones this case wants set. */
function onlyEnv(set: Record<string, string> = {}) {
  for (const key of CAPABILITY_KEYS) vi.stubEnv(key, undefined);
  for (const [key, value] of Object.entries(set)) vi.stubEnv(key, value);
}

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
  onlyEnv();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('video providers', () => {
  it('offers none by default', () => {
    expect(availableVideoProviders()).toEqual([]);
    expect(availableLocationTypes()).toEqual(['physical', 'custom']);
  });

  it('offers zoom once its three credentials are set', () => {
    onlyEnv({ ...ZOOM });
    expect(availableVideoProviders()).toEqual(['zoom']);
    expect(availableLocationTypes()).toContain('zoom');
  });

  it('offers teams once its three credentials are set, independently of zoom', () => {
    onlyEnv({ ...TEAMS });
    expect(availableVideoProviders()).toEqual(['teams']);
  });

  it('needs all three: a partial set is not configured', () => {
    onlyEnv({ ZOOM_ACCOUNT_ID: 'acct', ZOOM_CLIENT_ID: 'id' });
    expect(availableVideoProviders()).toEqual([]);
  });

  it('treats an empty or whitespace value as unset', () => {
    // The shape a deployment produces when it passes every variable through
    // unconditionally: present, empty, and useless.
    onlyEnv({ ...ZOOM, ZOOM_CLIENT_SECRET: '   ' });
    expect(availableVideoProviders()).toEqual([]);
  });

  it('never offers google_meet, configured or not', () => {
    onlyEnv({ ...ZOOM, ...TEAMS, GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y' });
    expect(availableLocationTypes()).not.toContain('google_meet');
  });
});

describe('inbox preview', () => {
  it('is unavailable by default', () => {
    expect(inboxPreviewAvailable()).toBe(false);
  });

  it('becomes available with a Litmus key', () => {
    onlyEnv({ LITMUS_API_KEY: 'key' });
    expect(inboxPreviewAvailable()).toBe(true);
  });

  it('counts an explicit mock opt-in as available', () => {
    // Asking for the mock by name is a decision. Getting it because nothing
    // else was configured is the bug.
    onlyEnv({ INBOX_PREVIEW_PROVIDER: 'mock' });
    expect(inboxPreviewAvailable()).toBe(true);
  });
});

describe('geo analytics', () => {
  it('is unavailable by default', () => {
    expect(geoAnalyticsAvailable()).toBe(false);
  });

  it('becomes available with GEOIP_API_URL', () => {
    onlyEnv({ GEOIP_API_URL: 'https://geo.example.test/{ip}' });
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
    onlyEnv({
      ...ZOOM,
      ...TEAMS,
      LITMUS_API_KEY: 'key',
      GEOIP_API_URL: 'https://geo.example.test/{ip}',
    });
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
    onlyEnv({ ...ZOOM });
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

describe('inbox preview is refused, not mocked, when unconfigured', () => {
  it('createPreviewJob throws instead of returning a preview.mock.local render', async () => {
    onlyEnv({});
    const { createPreviewJob } = await import('../services/preview/inbox-preview.js');
    await expect(
      createPreviewJob('00000000-0000-0000-0000-0000000000ff', {
        html: '<p>x</p>',
        clients: ['gmail'],
      } as never),
    ).rejects.toThrow(/not available in this deployment/);
  });

  it('does not throw once a Litmus key is set — hidden, not removed', async () => {
    onlyEnv({ LITMUS_API_KEY: 'key' });
    const { createPreviewJob } = await import('../services/preview/inbox-preview.js');
    // It will fail later reaching the DB; what matters is that it got past the
    // availability gate rather than being refused by it.
    await expect(
      createPreviewJob('00000000-0000-0000-0000-0000000000ff', {
        html: '<p>x</p>',
        clients: ['gmail'],
      } as never),
    ).rejects.not.toThrow(/not available in this deployment/);
  });
});
