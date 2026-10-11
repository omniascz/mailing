/**
 * How a workers integration file talks to the API as the seed organisation:
 * with an API key of its own.
 *
 * ─── Why a key per file ──────────────────────────────────────────────────────
 *
 * The API's limiter counts each request against its VERIFIED caller — a valid
 * API key, a valid session — and against the address only when there is none
 * (api/plugins/rate-limit.ts). So a file that holds its own key has a bucket of
 * its own, through the same path a customer's integration takes, and no file
 * spends another's budget.
 *
 * This replaced logging in with a made-up `x-api-key` header. That header was
 * "not a credential": it only steered the limiter into a fresh bucket, because
 * the limiter used to key on whatever the header said, verified or not. That
 * was the bypass the limiter now closes — the same trick let anyone lift the
 * 10-per-15-minutes login limit — so it is gone here too. Twenty files logging
 * in from 127.0.0.1 would now share that login limit, which is the point of it.
 *
 * The key is written the way createApiKey writes one (services/webhooks:
 * sha256 of the raw key, an `fm_live_` prefix, the creating user), for the seed
 * owner, so `req.user.userId` is the seed user's — org switching and
 * membership checks behave as they did with a login. What differs from a
 * login: an API key acts with the role `admin`, not `owner`.
 */
import { createHash, randomBytes } from 'node:crypto';
import type postgres from 'postgres';

export const SEED_LOGIN = {
  email: 'demo@acme.test',
  password: 'Demo1234!',
} as const;

/** A live API key for the seed organisation, created for this file. */
export async function seedApiKey(sql: ReturnType<typeof postgres>, label: string): Promise<string> {
  const [owner] = await sql<{ id: string; org_id: string }[]>`
    SELECT id, org_id FROM users WHERE email = ${SEED_LOGIN.email} LIMIT 1
  `;
  if (!owner) throw new Error(`[${label}] seed user ${SEED_LOGIN.email} not found — run pnpm seed`);
  const raw = `fm_live_${randomBytes(24).toString('hex')}`;
  await sql`
    INSERT INTO api_keys (org_id, user_id, name, key_hash, key_prefix)
    VALUES (${owner.org_id}, ${owner.id}, ${`integration ${label}`},
            ${createHash('sha256').update(raw).digest('hex')}, ${raw.slice(0, 12)})
  `;
  return raw;
}

/**
 * Headers that authenticate a credential: an API key (`fm_…`) travels as
 * `x-api-key`, a session token from /me/orgs/switch as a Bearer token. Never
 * both — the API key would win, and the request would act on the key's
 * organisation instead of the one the token was issued for.
 */
export function authHeaders(credential: string): Record<string, string> {
  return credential.startsWith('fm_')
    ? { 'x-api-key': credential }
    : { Authorization: `Bearer ${credential}` };
}
