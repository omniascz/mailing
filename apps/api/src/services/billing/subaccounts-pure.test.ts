import { describe, it, expect } from 'vitest';
import {
  descendantOrgIds,
  rootOrgId,
  rollupUsage,
  effectiveRole,
  canPerform,
  type OrgNode,
  type OrgUsage,
} from './subaccounts-pure.js';

const tree: OrgNode[] = [
  { id: 'agency', parentOrgId: null },
  { id: 'client-a', parentOrgId: 'agency' },
  { id: 'client-b', parentOrgId: 'agency' },
  { id: 'client-a-eu', parentOrgId: 'client-a' },
  { id: 'unrelated', parentOrgId: null },
];

describe('descendantOrgIds', () => {
  it('returns transitive children', () => {
    expect(descendantOrgIds('agency', tree).sort()).toEqual([
      'client-a',
      'client-a-eu',
      'client-b',
    ]);
  });

  it('returns direct children when no grandkids', () => {
    expect(descendantOrgIds('client-a', tree)).toEqual(['client-a-eu']);
  });

  it('returns empty for leaf orgs', () => {
    expect(descendantOrgIds('client-a-eu', tree)).toEqual([]);
  });

  it('excludes the parent itself', () => {
    expect(descendantOrgIds('agency', tree)).not.toContain('agency');
  });

  it('handles cycles gracefully (no crash)', () => {
    const cyclic: OrgNode[] = [
      { id: 'a', parentOrgId: 'b' },
      { id: 'b', parentOrgId: 'a' },
    ];
    expect(() => descendantOrgIds('a', cyclic)).not.toThrow();
  });
});

describe('rootOrgId', () => {
  it('walks up to the root', () => {
    expect(rootOrgId('client-a-eu', tree)).toBe('agency');
  });

  it('returns self for the root', () => {
    expect(rootOrgId('agency', tree)).toBe('agency');
  });

  it('handles orphan ids', () => {
    expect(rootOrgId('missing', tree)).toBe('missing');
  });
});

describe('rollupUsage', () => {
  const usage: OrgUsage[] = [
    { orgId: 'agency', emailsSent: 0, smsSent: 0, storageBytes: 0, aiTokensIn: 0, aiTokensOut: 0 },
    { orgId: 'client-a', emailsSent: 1000, smsSent: 50, storageBytes: 1024, aiTokensIn: 100, aiTokensOut: 50 },
    { orgId: 'client-a-eu', emailsSent: 500, smsSent: 20, storageBytes: 512, aiTokensIn: 80, aiTokensOut: 30 },
    { orgId: 'client-b', emailsSent: 2000, smsSent: 100, storageBytes: 2048, aiTokensIn: 200, aiTokensOut: 100 },
    { orgId: 'unrelated', emailsSent: 9999, smsSent: 999, storageBytes: 9999, aiTokensIn: 999, aiTokensOut: 999 },
  ];

  it('sums descendants and excludes unrelated orgs', () => {
    const rollup = rollupUsage('agency', tree, usage);
    expect(rollup.childCount).toBe(3);
    expect(rollup.totals.emailsSent).toBe(3500);
    expect(rollup.totals.smsSent).toBe(170);
    expect(rollup.totals.aiTokensIn).toBe(380);
  });

  it('excludes the parent itself from totals', () => {
    const rollup = rollupUsage('agency', tree, usage);
    expect(rollup.perChild.map((c) => c.orgId)).not.toContain('agency');
  });

  it('returns zero totals for leaf orgs with no children', () => {
    const rollup = rollupUsage('client-a-eu', tree, usage);
    expect(rollup.childCount).toBe(0);
    expect(rollup.totals.emailsSent).toBe(0);
  });
});

describe('effectiveRole', () => {
  it('uses direct role on target', () => {
    const role = effectiveRole(
      [{ orgId: 'client-a', role: 'editor' }],
      'client-a',
      tree,
    );
    expect(role).toBe('editor');
  });

  it('inherits from ancestor', () => {
    const role = effectiveRole(
      [{ orgId: 'agency', role: 'admin' }],
      'client-a-eu',
      tree,
    );
    expect(role).toBe('admin');
  });

  it('picks the highest rank when multiple apply', () => {
    const role = effectiveRole(
      [
        { orgId: 'agency', role: 'viewer' },
        { orgId: 'client-a', role: 'admin' },
      ],
      'client-a-eu',
      tree,
    );
    expect(role).toBe('admin');
  });

  it('returns null when nothing applies', () => {
    expect(
      effectiveRole([{ orgId: 'unrelated', role: 'owner' }], 'client-a', tree),
    ).toBeNull();
  });
});

describe('canPerform', () => {
  it('owner ≥ admin ≥ editor ≥ viewer', () => {
    expect(canPerform('owner', 'admin')).toBe(true);
    expect(canPerform('admin', 'editor')).toBe(true);
    expect(canPerform('editor', 'viewer')).toBe(true);
    expect(canPerform('viewer', 'editor')).toBe(false);
    expect(canPerform(null, 'viewer')).toBe(false);
  });
});
