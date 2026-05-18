import { describe, it, expect } from 'vitest';
import {
  resolveEffectivePermissions,
  hasPermission,
  findInvalidPermission,
  canonicalisePermissions,
  ROLE_PERMISSIONS,
} from './pure.js';

describe('ROLE_PERMISSIONS', () => {
  it('owner gets the wildcard', () => {
    expect(ROLE_PERMISSIONS.owner).toEqual(['*']);
  });

  it('viewer has only :read scopes', () => {
    expect(ROLE_PERMISSIONS.viewer.every((p) => p === 'org:read' || p.endsWith(':read'))).toBe(true);
  });
});

describe('resolveEffectivePermissions', () => {
  it('returns a sorted, deduped union of role + sets', () => {
    const out = resolveEffectivePermissions('viewer', [
      { permissions: ['campaigns:write'] },
      { permissions: ['campaigns:write', 'webhooks:read'] },
    ]);
    expect(out).toContain('campaigns:read'); // from role
    expect(out).toContain('campaigns:write'); // from set, deduped
    expect(out).toContain('webhooks:read');
    // Sorted
    expect([...out]).toEqual([...out].sort());
  });

  it('owner short-circuits to ["*"]', () => {
    const out = resolveEffectivePermissions('owner', []);
    expect(out).toContain('*');
  });

  it('drops empty / non-string entries from sets', () => {
    const out = resolveEffectivePermissions('viewer', [
      { permissions: ['', 'real:perm'] as readonly string[] },
    ]);
    expect(out).toContain('real:perm');
    expect(out).not.toContain('');
  });

  it('returns the role baseline when no sets are assigned', () => {
    const editor = resolveEffectivePermissions('editor', []);
    expect(editor).toContain('campaigns:write');
    expect(editor).toContain('templates:read');
    // No admin-only scopes leak in
    expect(editor).not.toContain('members:write');
  });
});

describe('hasPermission', () => {
  it('matches literally', () => {
    expect(hasPermission(['campaigns:read'], 'campaigns:read')).toBe(true);
    expect(hasPermission(['campaigns:read'], 'campaigns:write')).toBe(false);
  });

  it('respects the total wildcard', () => {
    expect(hasPermission(['*'], 'anything:goes')).toBe(true);
  });

  it('respects resource wildcards', () => {
    expect(hasPermission(['campaigns:*'], 'campaigns:read')).toBe(true);
    expect(hasPermission(['campaigns:*'], 'campaigns:write')).toBe(true);
    expect(hasPermission(['campaigns:*'], 'webhooks:read')).toBe(false);
  });

  it('rejects empty / non-string inputs', () => {
    expect(hasPermission(['*'], '')).toBe(false);
    expect(hasPermission(['*'], null as unknown as string)).toBe(false);
  });

  it('returns false when permission list is empty', () => {
    expect(hasPermission([], 'anything')).toBe(false);
  });
});

describe('findInvalidPermission', () => {
  it('accepts well-formed strings', () => {
    expect(findInvalidPermission(['*', 'campaigns:read', 'webhooks:*', 'org:write'])).toBeNull();
  });

  it('rejects empty strings', () => {
    expect(findInvalidPermission(['campaigns:read', ''])).toBe('');
  });

  it('rejects whitespace-only', () => {
    expect(findInvalidPermission(['  '])).toBe('  ');
  });

  it('rejects malformed wildcards', () => {
    expect(findInvalidPermission(['campaigns:**'])).toBe('campaigns:**');
    expect(findInvalidPermission(['*:read'])).toBe('*:read');
  });

  it('rejects upper-case identifiers', () => {
    expect(findInvalidPermission(['Campaigns:Read'])).toBe('Campaigns:Read');
  });

  it('returns null for an empty list (vacuous truth)', () => {
    expect(findInvalidPermission([])).toBeNull();
  });
});

describe('canonicalisePermissions', () => {
  it('dedupes and sorts', () => {
    expect(canonicalisePermissions(['b', 'a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('drops empty / whitespace entries', () => {
    expect(canonicalisePermissions(['campaigns:read', '', '  ', 'webhooks:read'])).toEqual([
      'campaigns:read',
      'webhooks:read',
    ]);
  });

  it('returns [] for empty input', () => {
    expect(canonicalisePermissions([])).toEqual([]);
  });
});
