/**
 * The signed-in member's role, read from the session the browser already holds.
 *
 * The API puts the role in the session JWT (apps/api/src/services/auth/
 * sessions.ts, `jwt.sign({ ...data, jti })`), the role the member has in the
 * organisation they are working in — after /me/orgs/switch too, which
 * /auth/me's `users.role` would not reflect. The web server reads it from the
 * `fm_session` cookie without a request of its own.
 *
 * The signature is not checked here: the web has no business holding the
 * signing secret. That is safe because this only decides what the page offers.
 * Every decision is the API's, which verifies the token on each request — a
 * forged cookie shows a checkbox and then gets the API's 403.
 */

export type MemberRole = 'owner' | 'admin' | 'editor' | 'viewer' | 'system_admin';

const ROLES = new Set<MemberRole>(['owner', 'admin', 'editor', 'viewer', 'system_admin']);

/** The role in a session token's payload, or null when there is none to read. */
export function roleFromSessionToken(token: string | undefined): MemberRole | null {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      role?: unknown;
    };
    return typeof json.role === 'string' && ROLES.has(json.role as MemberRole)
      ? (json.role as MemberRole)
      : null;
  } catch {
    return null;
  }
}

/**
 * Whether this member may send a campaign the pre-send check calls no-go —
 * the API's rule (apps/api/src/services/pre-send/override-permission.ts):
 * owner and admin only.
 */
export function mayOverrideGate(role: MemberRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'system_admin';
}
