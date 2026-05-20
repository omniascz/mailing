import { describe, it, expect } from 'vitest';
import {
  applyReadRule,
  findUnwritableField,
  fpermCacheKey,
  defaultRule,
  mergeRule,
} from './pure.js';

describe('applyReadRule', () => {
  const obj = { id: '1', name: 'Acme', revenue: 99000, ownerEmail: 'x@y.com' };

  it('null rule = passthrough', () => {
    expect(applyReadRule(null, obj)).toEqual(obj);
  });

  it('readable=["*"] returns all fields except hidden', () => {
    const rule = { readable: ['*'], hidden: ['revenue'], writable: ['*'] };
    expect(applyReadRule(rule, obj)).toEqual({ id: '1', name: 'Acme', ownerEmail: 'x@y.com' });
  });

  it('readable=explicit list filters down', () => {
    const rule = { readable: ['id', 'name'], hidden: [], writable: [] };
    expect(applyReadRule(rule, obj)).toEqual({ id: '1', name: 'Acme' });
  });

  it('hidden wins over explicit readable', () => {
    const rule = { readable: ['id', 'revenue'], hidden: ['revenue'], writable: [] };
    expect(applyReadRule(rule, obj)).toEqual({ id: '1' });
  });

  it('hidden wins over wildcard readable', () => {
    const rule = { readable: ['*'], hidden: ['revenue', 'ownerEmail'], writable: [] };
    expect(applyReadRule(rule, obj)).toEqual({ id: '1', name: 'Acme' });
  });

  it('returns empty when nothing readable', () => {
    const rule = { readable: [], hidden: [], writable: [] };
    expect(applyReadRule(rule, obj)).toEqual({});
  });
});

describe('findUnwritableField', () => {
  it('null rule = open', () => {
    expect(findUnwritableField(null, { revenue: 1 })).toBeNull();
  });

  it('writable=["*"] = open', () => {
    expect(
      findUnwritableField({ readable: [], hidden: [], writable: ['*'] }, { revenue: 1 }),
    ).toBeNull();
  });

  it('returns the first offending key', () => {
    const rule = { readable: [], hidden: [], writable: ['name', 'description'] };
    expect(findUnwritableField(rule, { name: 'ok', revenue: 1, ownerEmail: 'x' })).toBe('revenue');
  });

  it('returns null for fully allowed patches', () => {
    const rule = { readable: [], hidden: [], writable: ['name', 'description'] };
    expect(findUnwritableField(rule, { name: 'ok', description: 'd' })).toBeNull();
  });

  it('empty patch = no offence', () => {
    const rule = { readable: [], hidden: [], writable: [] };
    expect(findUnwritableField(rule, {})).toBeNull();
  });
});

describe('fpermCacheKey', () => {
  it('namespaces by orgId, role, entity', () => {
    expect(fpermCacheKey('o1', 'editor', 'contact')).toBe('fperm:o1:editor:contact');
  });
});

describe('defaultRule', () => {
  it('is wide-open', () => {
    expect(defaultRule()).toEqual({ readable: ['*'], hidden: [], writable: ['*'] });
  });
});

describe('mergeRule', () => {
  const base = { readable: ['*'], hidden: ['x'], writable: ['name'] };

  it('preserves untouched fields', () => {
    expect(mergeRule(base, { hidden: ['x', 'y'] })).toEqual({
      readable: ['*'],
      hidden: ['x', 'y'],
      writable: ['name'],
    });
  });

  it('replaces fields explicitly set', () => {
    expect(mergeRule(base, { readable: ['id'], writable: ['*'] })).toEqual({
      readable: ['id'],
      hidden: ['x'],
      writable: ['*'],
    });
  });

  it('passes through empty patch', () => {
    expect(mergeRule(base, {})).toEqual(base);
  });
});
