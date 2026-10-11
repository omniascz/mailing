import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db/client.js', () => ({ db: {} }));

const { effectiveKeyRole, keyRoleFor } = await import('./api-key-role.js');

describe('the role an API key acts with (Z130)', () => {
  it('is the creator role, and a platform system_admin key is an owner key', () => {
    expect(keyRoleFor('editor')).toBe('editor');
    expect(keyRoleFor('system_admin')).toBe('owner');
    expect(keyRoleFor(undefined)).toBe('viewer');
    expect(keyRoleFor('superuser')).toBe('viewer');
  });

  it('never more than the creator has now: a demotion demotes the key', () => {
    expect(effectiveKeyRole('admin', 'admin')).toBe('admin');
    expect(effectiveKeyRole('admin', 'viewer')).toBe('viewer');
    // ...and a promotion does not promote a key minted with less.
    expect(effectiveKeyRole('editor', 'owner')).toBe('editor');
  });

  it('a key from before the column takes the creator role, never admin by default', () => {
    expect(effectiveKeyRole(null, 'editor')).toBe('editor');
    expect(effectiveKeyRole(null, 'viewer')).toBe('viewer');
  });

  it('a creator who is no longer a member leaves the key with viewer', () => {
    expect(effectiveKeyRole('admin', null)).toBe('viewer');
  });

  it('a key with no member behind it keeps what it was issued with, or viewer', () => {
    expect(effectiveKeyRole('editor', undefined)).toBe('editor');
    expect(effectiveKeyRole(null, undefined)).toBe('viewer');
  });
});
