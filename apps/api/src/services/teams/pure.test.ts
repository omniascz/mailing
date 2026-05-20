import { describe, it, expect } from 'vitest';
import {
  deriveBypass,
  planTeamScope,
  canWriteToTeam,
  membershipCacheKey,
  normaliseTeamIds,
  anyCrossTeamAccess,
} from './pure.js';

describe('deriveBypass', () => {
  it('owners and admins always bypass', () => {
    expect(deriveBypass('owner', false)).toBe(true);
    expect(deriveBypass('admin', false)).toBe(true);
  });

  it('editors/viewers respect crossTeamAccess flag', () => {
    expect(deriveBypass('editor', false)).toBe(false);
    expect(deriveBypass('editor', true)).toBe(true);
    expect(deriveBypass('viewer', false)).toBe(false);
    expect(deriveBypass('viewer', true)).toBe(true);
  });
});

describe('planTeamScope', () => {
  it('returns bypass for bypass contexts', () => {
    expect(planTeamScope({ bypass: true, teamIds: [] })).toEqual({ kind: 'bypass' });
    expect(planTeamScope({ bypass: true, teamIds: ['t1'] })).toEqual({ kind: 'bypass' });
  });

  it('falls back to unowned-only when user has no teams (default)', () => {
    expect(planTeamScope({ bypass: false, teamIds: [] })).toEqual({ kind: 'unowned-only' });
  });

  it('hides unowned rows when includeUnowned=false and user has no teams', () => {
    expect(planTeamScope({ bypass: false, teamIds: [] }, { includeUnowned: false })).toEqual({
      kind: 'deny',
    });
  });

  it('returns in-set with teamIds + includeUnowned default true', () => {
    expect(planTeamScope({ bypass: false, teamIds: ['t1', 't2'] })).toEqual({
      kind: 'in-set',
      teamIds: ['t1', 't2'],
      includeUnowned: true,
    });
  });

  it('respects includeUnowned=false on in-set', () => {
    expect(planTeamScope({ bypass: false, teamIds: ['t1'] }, { includeUnowned: false })).toEqual({
      kind: 'in-set',
      teamIds: ['t1'],
      includeUnowned: false,
    });
  });
});

describe('canWriteToTeam', () => {
  const restricted = { bypass: false, teamIds: ['t1', 't2'] };
  const bypass = { bypass: true, teamIds: [] };

  it('bypass contexts can write anywhere', () => {
    expect(canWriteToTeam(bypass, 't99')).toBe(true);
    expect(canWriteToTeam(bypass, null)).toBe(true);
  });

  it('null/undefined targetTeamId always allowed (org-wide rows)', () => {
    expect(canWriteToTeam(restricted, null)).toBe(true);
    expect(canWriteToTeam(restricted, undefined)).toBe(true);
  });

  it('restricts to the user’s set otherwise', () => {
    expect(canWriteToTeam(restricted, 't1')).toBe(true);
    expect(canWriteToTeam(restricted, 't2')).toBe(true);
    expect(canWriteToTeam(restricted, 't3')).toBe(false);
  });
});

describe('membershipCacheKey', () => {
  it('namespaces by orgId and userId', () => {
    expect(membershipCacheKey('o1', 'u1')).toBe('team_membership:o1:u1');
  });
});

describe('normaliseTeamIds', () => {
  it('de-dupes and sorts', () => {
    expect(normaliseTeamIds([{ teamId: 't2' }, { teamId: 't1' }, { teamId: 't2' }])).toEqual([
      't1',
      't2',
    ]);
  });

  it('handles empty input', () => {
    expect(normaliseTeamIds([])).toEqual([]);
  });
});

describe('anyCrossTeamAccess', () => {
  it('any-true wins', () => {
    expect(anyCrossTeamAccess([{ crossTeamAccess: false }, { crossTeamAccess: true }])).toBe(true);
  });

  it('all-false stays false', () => {
    expect(anyCrossTeamAccess([{ crossTeamAccess: false }, { crossTeamAccess: false }])).toBe(
      false,
    );
  });

  it('empty stays false', () => {
    expect(anyCrossTeamAccess([])).toBe(false);
  });
});
