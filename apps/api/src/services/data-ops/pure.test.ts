import { describe, it, expect } from 'vitest';
import {
  getField,
  cmp,
  evalPredicate,
  applyFilter,
  applyMap,
  applyAggregate,
  applyLimit,
  applySort,
  joinRows,
} from './pure.js';

describe('getField', () => {
  it('reads top-level keys', () => {
    expect(getField({ a: 1 }, 'a')).toBe(1);
  });

  it('reads dotted paths', () => {
    expect(getField({ a: { b: { c: 'x' } } }, 'a.b.c')).toBe('x');
  });

  it('returns null for missing nested', () => {
    expect(getField({ a: 1 }, 'a.b')).toBeNull();
    expect(getField({}, 'x.y')).toBeNull();
  });

  it('returns null for missing top-level (not undefined)', () => {
    expect(getField({}, 'x')).toBeNull();
  });
});

describe('cmp', () => {
  it('numeric subtraction', () => {
    expect(cmp(5, 3)).toBe(2);
    expect(cmp(3, 5)).toBe(-2);
    expect(cmp(5, 5)).toBe(0);
  });

  it('string lexicographic', () => {
    expect(cmp('a', 'b')).toBe(-1);
    expect(cmp('b', 'a')).toBe(1);
    expect(cmp('a', 'a')).toBe(0);
  });

  it('numeric strings coerce', () => {
    expect(cmp('5', '3')).toBe(1); // strings: '5' > '3'
    expect(cmp('5', 3)).toBe(2);   // mixed: numeric coerce
  });

  it('returns 0 for incomparable types', () => {
    expect(cmp({}, 'foo')).toBe(0);
  });
});

describe('evalPredicate', () => {
  const row = { name: 'Acme', revenue: 100, owner: { id: 'u1' } };

  it('eq / neq', () => {
    expect(evalPredicate({ field: 'name', op: 'eq', value: 'Acme' }, row)).toBe(true);
    expect(evalPredicate({ field: 'name', op: 'neq', value: 'Acme' }, row)).toBe(false);
  });

  it('comparison operators', () => {
    expect(evalPredicate({ field: 'revenue', op: 'gt', value: 50 }, row)).toBe(true);
    expect(evalPredicate({ field: 'revenue', op: 'gte', value: 100 }, row)).toBe(true);
    expect(evalPredicate({ field: 'revenue', op: 'lt', value: 200 }, row)).toBe(true);
    expect(evalPredicate({ field: 'revenue', op: 'lte', value: 100 }, row)).toBe(true);
  });

  it('contains / not_contains', () => {
    expect(evalPredicate({ field: 'name', op: 'contains', value: 'cm' }, row)).toBe(true);
    expect(evalPredicate({ field: 'name', op: 'not_contains', value: 'xyz' }, row)).toBe(true);
  });

  it('is_null / is_not_null', () => {
    expect(evalPredicate({ field: 'missing', op: 'is_null' }, row)).toBe(true);
    expect(evalPredicate({ field: 'name', op: 'is_not_null' }, row)).toBe(true);
  });

  it('and / or composition', () => {
    expect(
      evalPredicate(
        {
          and: [
            { field: 'name', op: 'eq', value: 'Acme' },
            { field: 'revenue', op: 'gt', value: 50 },
          ],
        },
        row,
      ),
    ).toBe(true);
    expect(
      evalPredicate(
        {
          or: [
            { field: 'name', op: 'eq', value: 'Other' },
            { field: 'revenue', op: 'gt', value: 50 },
          ],
        },
        row,
      ),
    ).toBe(true);
  });

  it('nested dotted field access', () => {
    expect(evalPredicate({ field: 'owner.id', op: 'eq', value: 'u1' }, row)).toBe(true);
  });
});

describe('applyFilter', () => {
  const rows = [
    { id: 1, status: 'active' },
    { id: 2, status: 'inactive' },
    { id: 3, status: 'active' },
  ];

  it('keeps matching rows', () => {
    const out = applyFilter(
      { type: 'filter', predicate: { field: 'status', op: 'eq', value: 'active' } },
      rows,
    );
    expect(out).toEqual([
      { id: 1, status: 'active' },
      { id: 3, status: 'active' },
    ]);
  });
});

describe('applyMap', () => {
  it('projects with bare-field strings', () => {
    const out = applyMap(
      { type: 'map', projection: { name: 'firstName', email: 'email' } },
      [{ firstName: 'Jane', lastName: 'Doe', email: 'a@b.com' }],
    );
    expect(out).toEqual([{ name: 'Jane', email: 'a@b.com' }]);
  });

  it('supports {$field: ...} shape', () => {
    const out = applyMap(
      { type: 'map', projection: { id: { $field: 'user.id' } } },
      [{ user: { id: 'u1' } }],
    );
    expect(out).toEqual([{ id: 'u1' }]);
  });
});

describe('applyAggregate', () => {
  const rows = [
    { team: 't1', revenue: 100 },
    { team: 't1', revenue: 200 },
    { team: 't2', revenue: 50 },
  ];

  it('count + sum + avg + min + max', () => {
    const out = applyAggregate(
      {
        type: 'aggregate',
        groupBy: ['team'],
        metrics: {
          n: { op: 'count' },
          total: { op: 'sum', field: 'revenue' },
          mean: { op: 'avg', field: 'revenue' },
          minRev: { op: 'min', field: 'revenue' },
          maxRev: { op: 'max', field: 'revenue' },
        },
      },
      rows,
    );

    const t1 = out.find((r) => r.team === 't1');
    const t2 = out.find((r) => r.team === 't2');
    expect(t1).toEqual({ team: 't1', n: 2, total: 300, mean: 150, minRev: 100, maxRev: 200 });
    expect(t2).toEqual({ team: 't2', n: 1, total: 50, mean: 50, minRev: 50, maxRev: 50 });
  });

  it('returns null for min/max over empty value set', () => {
    const out = applyAggregate(
      {
        type: 'aggregate',
        groupBy: ['team'],
        metrics: { mn: { op: 'min', field: 'missing' }, mx: { op: 'max', field: 'missing' } },
      },
      [{ team: 't1' }],
    );
    expect(out).toEqual([{ team: 't1', mn: null, mx: null }]);
  });

  it('groups by multiple keys', () => {
    const out = applyAggregate(
      {
        type: 'aggregate',
        groupBy: ['team', 'status'],
        metrics: { n: { op: 'count' } },
      },
      [
        { team: 't1', status: 'won' },
        { team: 't1', status: 'won' },
        { team: 't1', status: 'lost' },
      ],
    );
    expect(out).toHaveLength(2);
  });
});

describe('applyLimit', () => {
  it('slices to count', () => {
    expect(applyLimit({ type: 'limit', count: 2 }, [{ a: 1 }, { a: 2 }, { a: 3 }])).toEqual([
      { a: 1 },
      { a: 2 },
    ]);
  });

  it('clamps negative to 0', () => {
    expect(applyLimit({ type: 'limit', count: -5 }, [{ a: 1 }])).toEqual([]);
  });
});

describe('applySort', () => {
  const rows = [{ n: 3 }, { n: 1 }, { n: 2 }];

  it('ascending', () => {
    expect(applySort({ type: 'sort', by: [{ field: 'n', dir: 'asc' }] }, rows))
      .toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });

  it('descending', () => {
    expect(applySort({ type: 'sort', by: [{ field: 'n', dir: 'desc' }] }, rows))
      .toEqual([{ n: 3 }, { n: 2 }, { n: 1 }]);
  });

  it('multi-key tie-breaks', () => {
    const r = [
      { team: 't1', n: 2 },
      { team: 't1', n: 1 },
      { team: 't2', n: 5 },
    ];
    const out = applySort(
      { type: 'sort', by: [{ field: 'team', dir: 'asc' }, { field: 'n', dir: 'asc' }] },
      r,
    );
    expect(out).toEqual([
      { team: 't1', n: 1 },
      { team: 't1', n: 2 },
      { team: 't2', n: 5 },
    ]);
  });

  it('does not mutate input', () => {
    const r = [{ n: 2 }, { n: 1 }];
    applySort({ type: 'sort', by: [{ field: 'n', dir: 'asc' }] }, r);
    expect(r).toEqual([{ n: 2 }, { n: 1 }]);
  });
});

describe('joinRows', () => {
  const left = [
    { id: 1, ownerId: 'u1' },
    { id: 2, ownerId: 'u2' },
    { id: 3, ownerId: 'u-missing' },
  ];
  const right = [
    { uid: 'u1', name: 'Alice' },
    { uid: 'u2', name: 'Bob' },
  ];

  it('inner join drops unmatched left', () => {
    const out = joinRows(
      { type: 'join', rightSource: 'users', on: { left: 'ownerId', right: 'uid' }, kind: 'inner' },
      left,
      right,
    );
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.id)).toEqual([1, 2]);
    expect(out[0]?.name).toBe('Alice');
  });

  it('left join keeps unmatched left', () => {
    const out = joinRows(
      { type: 'join', rightSource: 'users', on: { left: 'ownerId', right: 'uid' }, kind: 'left' },
      left,
      right,
    );
    expect(out).toHaveLength(3);
    expect(out[2]?.id).toBe(3);
    expect(out[2]?.name).toBeUndefined();
  });

  it('select=[] honours the projection', () => {
    const out = joinRows(
      {
        type: 'join',
        rightSource: 'users',
        on: { left: 'ownerId', right: 'uid' },
        kind: 'inner',
        select: ['name'],
      },
      left,
      right,
    );
    expect(out[0]).toEqual({ id: 1, ownerId: 'u1', name: 'Alice' });
    // 'uid' from right should not have leaked
    expect(out[0]).not.toHaveProperty('uid');
  });
});
