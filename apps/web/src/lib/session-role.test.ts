import { describe, it, expect } from 'vitest';
import { mayOverrideGate, roleFromSessionToken } from './session-role';

/** A token shaped like the API's (header.payload.signature); the signature is never read here. */
const token = (payload: Record<string, unknown>) =>
  ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join(
    '.',
  );

describe('the role in the session the browser holds (Z130)', () => {
  it('reads the role the API signed into the session', () => {
    const session = { userId: 'u1', orgId: 'o1', email: 'e@x.test', jti: 'j' };
    expect(roleFromSessionToken(token({ ...session, role: 'editor' }))).toBe('editor');
    expect(roleFromSessionToken(token({ ...session, role: 'owner' }))).toBe('owner');
  });

  it('nothing to read is no role, never a guess', () => {
    expect(roleFromSessionToken(undefined)).toBeNull();
    expect(roleFromSessionToken('not-a-jwt')).toBeNull();
    expect(roleFromSessionToken('a.%%%.c')).toBeNull();
    expect(roleFromSessionToken(token({ role: 'superuser' }))).toBeNull();
  });

  it('only owner and admin are offered the no-go override, as the API decides', () => {
    expect(['owner', 'admin', 'system_admin'].map((r) => mayOverrideGate(r as never))).toEqual([
      true,
      true,
      true,
    ]);
    expect(['editor', 'viewer'].map((r) => mayOverrideGate(r as never))).toEqual([false, false]);
    expect(mayOverrideGate(null)).toBe(false);
  });
});
