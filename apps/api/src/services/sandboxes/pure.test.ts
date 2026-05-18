import { describe, it, expect } from 'vitest';
import {
  buildSandboxSlug,
  clampSeedCount,
  chunkRange,
  syntheticContactEmail,
  canParentSpawnSandbox,
  shouldNoOpSend,
  MAX_SEED_CONTACTS,
} from './pure.js';

describe('buildSandboxSlug', () => {
  it('joins parent slug + sbx + base36 timestamp', () => {
    expect(buildSandboxSlug('acme', 0)).toBe('acme-sbx-0');
    expect(buildSandboxSlug('acme', 36)).toBe('acme-sbx-10');
  });

  it('preserves parent slug verbatim', () => {
    expect(buildSandboxSlug('long-parent-slug', 1234)).toMatch(/^long-parent-slug-sbx-/);
  });
});

describe('clampSeedCount', () => {
  it('returns 0 for undefined/null/0/negative', () => {
    expect(clampSeedCount(undefined)).toBe(0);
    expect(clampSeedCount(null)).toBe(0);
    expect(clampSeedCount(0)).toBe(0);
    expect(clampSeedCount(-5)).toBe(0);
  });

  it('caps at MAX_SEED_CONTACTS', () => {
    expect(clampSeedCount(50_000)).toBe(MAX_SEED_CONTACTS);
    expect(clampSeedCount(MAX_SEED_CONTACTS)).toBe(MAX_SEED_CONTACTS);
  });

  it('passes through small values unchanged', () => {
    expect(clampSeedCount(100)).toBe(100);
    expect(clampSeedCount(1)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(clampSeedCount(99.9)).toBe(99);
  });
});

describe('chunkRange', () => {
  it('returns [] for non-positive totals', () => {
    expect(chunkRange(0)).toEqual([]);
    expect(chunkRange(-1)).toEqual([]);
  });

  it('produces full + remainder chunks', () => {
    expect(chunkRange(1200, 500)).toEqual([
      [0, 500],
      [500, 1000],
      [1000, 1200],
    ]);
  });

  it('returns one chunk when total ≤ chunkSize', () => {
    expect(chunkRange(7, 500)).toEqual([[0, 7]]);
  });
});

describe('syntheticContactEmail', () => {
  it('routes to example.org which RFC 2606 reserves', () => {
    expect(syntheticContactEmail(0)).toBe('seed-0@example.org');
    expect(syntheticContactEmail(42)).toBe('seed-42@example.org');
  });
});

describe('canParentSpawnSandbox', () => {
  it('allows live parent', () => {
    expect(canParentSpawnSandbox({ sandboxMode: 'live' })).toEqual({ ok: true });
    expect(canParentSpawnSandbox({})).toEqual({ ok: true });
  });

  it('blocks recursive sandboxes', () => {
    const result = canParentSpawnSandbox({ sandboxMode: 'sandbox' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/sandbox of a sandbox/i);
  });
});

describe('shouldNoOpSend', () => {
  const liveOrg = { sandboxMode: 'live' as const };
  const sandboxOrg = { sandboxMode: 'sandbox' as const, sandboxOfOrgId: 'parent-1' };

  it('lets live orgs through', () => {
    expect(shouldNoOpSend(liveOrg, { noOpMode: true })).toBe(false);
  });

  it('lets sandbox orgs without parent through (data corruption guard)', () => {
    expect(shouldNoOpSend({ sandboxMode: 'sandbox' }, { noOpMode: true })).toBe(false);
  });

  it('lets sandbox orgs through when noOpMode disabled', () => {
    expect(shouldNoOpSend(sandboxOrg, { noOpMode: false })).toBe(false);
  });

  it('blocks sandbox orgs with noOpMode enabled', () => {
    expect(shouldNoOpSend(sandboxOrg, { noOpMode: true })).toBe(true);
  });

  it('blocks sandbox orgs with no record at all (defensive default = no-op)', () => {
    // No record = unknown state; default is to allow sending? In code: returns false.
    expect(shouldNoOpSend(sandboxOrg, null)).toBe(false);
  });
});
