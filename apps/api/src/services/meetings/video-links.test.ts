/**
 * A booking may not hand out a link the product cannot stand behind.
 *
 * The fabricated Google Meet code is already gone and has its own barrier in
 * no-fabricated-meet-links.test.ts. What is asserted here is the rest of the
 * same problem:
 *
 *   - Zoom and Teams answered `null` when their credentials were missing.
 *     The caller wraps createVideoLink in a .catch() that logs the reason and
 *     falls back to the event type's locationValue — and a resolved null runs
 *     neither. Nothing was logged and the fallback never applied.
 *   - 'custom' was promised in this file's docblock as a static URL
 *     pass-through, accepted by the route's enum and offered by
 *     availableLocationTypes(), and had no case in the switch. Every custom
 *     booking fell to `default: return null`, and because 'custom' is not a
 *     video location type, bookingWouldBeEmpty let it through: confirmed, with
 *     the host's configured URL dropped on the floor.
 *
 * The custom URL is validated rather than fetched. Nothing on our side ever
 * requests it — it goes into a page and an email for a person to click — so
 * what matters is what a browser would do with it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createVideoLink, customLink } from './video-links.js';

const INPUT = {
  title: 'Intro call',
  startAt: new Date('2026-09-01T10:00:00Z'),
  endAt: new Date('2026-09-01T10:30:00Z'),
  hostUserId: '00000000-0000-4000-8000-000000000001',
  inviteeEmail: 'invitee@example.test',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('google_meet is not a provider', () => {
  it('createVideoLink has no branch for it', async () => {
    // Kept beside the others so the three cases read together. The standing
    // barrier is no-fabricated-meet-links.test.ts.
    await expect(createVideoLink('google_meet', INPUT)).resolves.toBeNull();
  });

  it('and nothing in this module invents a meet.google.com address', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./video-links.ts', import.meta.url), 'utf8'),
    );
    // Only the docblock explaining why the option is gone may name the host.
    const code = source.slice(source.indexOf('export interface VideoLinkInput'));
    expect(code).not.toContain('meet.google.com');
    expect(code).not.toContain('Math.random');
  });
});

describe('an unconfigured video provider fails loudly', () => {
  it('zoom without credentials throws rather than answering null', async () => {
    vi.stubEnv('ZOOM_ACCOUNT_ID', undefined);
    vi.stubEnv('ZOOM_CLIENT_ID', undefined);
    vi.stubEnv('ZOOM_CLIENT_SECRET', undefined);
    // A resolved null skipped the caller's .catch entirely: no log, no
    // fallback to locationValue, and a booking that either lost its location
    // silently or was refused with a message that could not say why.
    await expect(createVideoLink('zoom', INPUT)).rejects.toThrow(/ZOOM_ACCOUNT_ID/);
  });

  it('teams without credentials throws rather than answering null', async () => {
    vi.stubEnv('MICROSOFT_TENANT_ID', undefined);
    vi.stubEnv('MICROSOFT_CLIENT_ID', undefined);
    vi.stubEnv('MICROSOFT_CLIENT_SECRET', undefined);
    await expect(createVideoLink('teams', INPUT)).rejects.toThrow(/MICROSOFT_TENANT_ID/);
  });
});

describe('custom is a validated pass-through', () => {
  const custom = (locationValue: string | null | undefined) =>
    createVideoLink('custom', { ...INPUT, locationValue });

  it('returns the host URL', async () => {
    await expect(custom('https://meet.example.test/room/abc')).resolves.toBe(
      'https://meet.example.test/room/abc',
    );
  });

  it('accepts http as well as https', async () => {
    await expect(custom('http://meet.example.test/room')).resolves.toBe(
      'http://meet.example.test/room',
    );
  });

  it('refuses javascript:', async () => {
    // An href a dashboard or an email renders. This is script execution, not a
    // meeting.
    await expect(custom('javascript:alert(1)')).rejects.toThrow(/http or https/);
  });

  it('refuses data:', async () => {
    await expect(custom('data:text/html,<script>alert(1)</script>')).rejects.toThrow(
      /http or https/,
    );
  });

  it('refuses a loopback address', async () => {
    await expect(custom('http://127.0.0.1:8080/room')).rejects.toThrow(/private or loopback/);
    await expect(custom('http://localhost:3000/room')).rejects.toThrow(/private or loopback/);
  });

  it('refuses a private range', async () => {
    await expect(custom('http://10.0.0.5/room')).rejects.toThrow(/private or loopback/);
    await expect(custom('http://192.168.1.10/room')).rejects.toThrow(/private or loopback/);
    await expect(custom('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
      /private or loopback/,
    );
  });

  it('refuses an IPv6 loopback', async () => {
    await expect(custom('http://[::1]:8080/room')).rejects.toThrow(/private or loopback/);
  });

  it('refuses nonsense and emptiness', async () => {
    await expect(custom('not a url')).rejects.toThrow(/not a URL/);
    await expect(custom('')).rejects.toThrow(/no URL configured/);
    await expect(custom(null)).rejects.toThrow(/no URL configured/);
  });

  it('is exported on its own so the rule is testable without a booking', () => {
    expect(typeof customLink).toBe('function');
  });
});
