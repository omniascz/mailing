import { cookies } from 'next/headers';
import { roleFromSessionToken, type MemberRole } from './session-role';

/** The signed-in member's role from the session cookie (see session-role.ts). */
export async function sessionRole(): Promise<MemberRole | null> {
  const store = await cookies();
  return roleFromSessionToken(store.get('fm_session')?.value);
}
