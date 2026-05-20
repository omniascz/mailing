import { describe, it, expect } from 'vitest';
import {
  bindParameters,
  findUndeclaredPlaceholders,
  cacheKey,
  type ParameterSpec,
} from './pure.js';

const specs: ParameterSpec[] = [
  { name: 'org_id', type: 'string', required: true },
  { name: 'since', type: 'date', required: true },
  { name: 'limit', type: 'number', defaultValue: 100 },
];

describe('bindParameters', () => {
  it('rewrites :name to $N in declaration order', () => {
    const out = bindParameters(
      'SELECT * FROM contacts WHERE org_id = :org_id AND created_at > :since LIMIT :limit',
      specs,
      { org_id: 'abc', since: new Date('2026-01-01') },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.bound.sql).toContain('$1');
    expect(out.bound.sql).toContain('$2');
    expect(out.bound.sql).toContain('$3');
    expect(out.bound.params[0]).toBe('abc');
    expect(out.bound.params[1]).toBeInstanceOf(Date);
    expect(out.bound.params[2]).toBe(100); // default applied
  });

  it('reuses the same positional param when referenced twice', () => {
    const out = bindParameters('SELECT :org_id, :org_id FROM t', specs, {
      org_id: 'abc',
      since: new Date(),
    });
    if (!out.ok) throw new Error(out.error);
    expect(out.bound.sql).toMatch(/\$1.*\$1/);
    // Only org_id is referenced in SQL; since + limit aren't used
    expect(out.bound.params).toEqual(['abc']);
  });

  it('fails on missing required param', () => {
    const out = bindParameters('SELECT :org_id', specs, {});
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toContain('Missing required parameter: org_id');
  });

  it('fails on unknown :name placeholder', () => {
    const out = bindParameters('SELECT :bogus', specs, { org_id: 'x', since: new Date() });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toContain('Unknown parameter :bogus');
  });

  it('coerces numeric string to number for number-typed params', () => {
    const out = bindParameters('SELECT :limit', specs, {
      org_id: 'x',
      since: new Date(),
      limit: '25',
    });
    if (!out.ok) throw new Error(out.error);
    expect(out.bound.params[0]).toBe(25);
  });

  it('rejects non-numeric string for number params', () => {
    const out = bindParameters('SELECT :limit', specs, {
      org_id: 'x',
      since: new Date(),
      limit: 'abc',
    });
    expect(out.ok).toBe(false);
  });

  it('coerces ISO string to Date', () => {
    const out = bindParameters('SELECT :since', specs, {
      org_id: 'x',
      since: '2026-04-24T10:00:00Z',
    });
    if (!out.ok) throw new Error(out.error);
    expect(out.bound.params[0]).toBeInstanceOf(Date);
  });

  it('rejects invalid parameter names in spec', () => {
    const bad = bindParameters('SELECT 1', [{ name: 'bad-name!', type: 'string' }], {});
    expect(bad.ok).toBe(false);
  });
});

describe('findUndeclaredPlaceholders', () => {
  it('returns placeholders missing from spec', () => {
    expect(findUndeclaredPlaceholders('SELECT :foo, :bar, :org_id FROM t', specs).sort()).toEqual([
      'bar',
      'foo',
    ]);
  });

  it('returns [] when all declared', () => {
    expect(findUndeclaredPlaceholders('SELECT :org_id FROM t', specs)).toEqual([]);
  });
});

describe('cacheKey', () => {
  it('is stable regardless of param order', () => {
    const a = cacheKey('ds-1', { org_id: 'x', since: '2026-01-01' });
    const b = cacheKey('ds-1', { since: '2026-01-01', org_id: 'x' });
    expect(a).toBe(b);
  });

  it('differs for different IDs', () => {
    expect(cacheKey('ds-1', {})).not.toBe(cacheKey('ds-2', {}));
  });

  it('differs for different values', () => {
    expect(cacheKey('ds-1', { org_id: 'a' })).not.toBe(cacheKey('ds-1', { org_id: 'b' }));
  });
});
