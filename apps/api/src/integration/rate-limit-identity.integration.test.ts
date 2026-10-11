/**
 * The limiter counts a request against its verified caller, and against the
 * address only when there is none.
 *
 * Before: the key was `x-api-key header || ip`, unverified.
 *  - Every user the web app renders on its server reaches the API from the web
 *    server's one address, so they shared one 100-per-minute bucket — measured
 *    in Z127: the counter for 127.0.0.1 stood at 103 and the seventh page was
 *    a 404.
 *  - Any value in `x-api-key`, valid or not, opened a bucket of its own, so a
 *    random header per request lifted every limit, the 10-per-15-minutes
 *    login limit included.
 *
 * Every request here comes from ONE address, the way the web server's do, and
 * goes through buildApp() — no harness, no header added by a test.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../index.js';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
/** One address per run, so a re-run does not inherit this one's counters. */
const octet = () => 1 + Math.floor(Math.random() * 250);
const WEB_SERVER = `198.18.${octet()}.${octet()}`;
const SECOND_USER = `rl-identity-${tag}@test.local`;
let secondUserId: string;

async function login(email: string, remoteAddress: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: 'Demo1234!' },
    remoteAddress,
  });
  expect(res.statusCode, res.body).toBe(200);
  return (res.json() as { token: string }).token;
}

/** n authenticated GETs from one address; the statuses and the remaining counts. */
async function burst(token: string, n: number, remoteAddress: string) {
  const statuses: number[] = [];
  const remaining: number[] = [];
  for (let i = 0; i < n; i++) {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns?limit=1',
      headers: { authorization: `Bearer ${token}` },
      remoteAddress,
    });
    statuses.push(res.statusCode);
    remaining.push(Number(res.headers['x-ratelimit-remaining']));
  }
  return { statuses, remaining };
}

const count = (xs: number[], v: number) => xs.filter((x) => x === v).length;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  // A second person in the seed organisation, with the seed password.
  const [seedUser] = await db
    .select({ orgId: users.orgId, hash: users.passwordHash })
    .from(users)
    .where(eq(users.email, 'demo@acme.test'));
  const [u] = await db
    .insert(users)
    .values({
      orgId: seedUser!.orgId,
      email: SECOND_USER,
      name: 'rate-limit identity',
      passwordHash: seedUser!.hash,
      role: 'editor',
      emailVerified: true,
    })
    .returning({ id: users.id });
  secondUserId = u!.id;
}, 60_000);

afterAll(async () => {
  if (secondUserId) await db.delete(users).where(eq(users.id, secondUserId));
  await app?.close();
});

describe('signed-in callers: one bucket each, whatever address they share', () => {
  it('two users rendered by one web server: 60 requests each, all served', async () => {
    // The logins come from elsewhere: the claim is about the 120 requests.
    const a = await login('demo@acme.test', `198.19.${octet()}.${octet()}`);
    const b = await login(SECOND_USER, `198.19.${octet()}.${octet()}`);
    const first = await burst(a, 60, WEB_SERVER);
    const second = await burst(b, 60, WEB_SERVER);
    console.log(
      `[z128] user A: 200×${count(first.statuses, 200)} 429×${count(first.statuses, 429)} remaining ${first.remaining[0]}→${first.remaining.at(-1)} | ` +
        `user B: 200×${count(second.statuses, 200)} 429×${count(second.statuses, 429)} remaining ${second.remaining[0]}→${second.remaining.at(-1)}`,
    );
    expect(count(first.statuses, 200)).toBe(60);
    expect(count(second.statuses, 200)).toBe(60);
    // The headers are still sent, and they count this caller's own requests.
    expect(second.remaining[0]).toBe(99);
    expect(second.remaining.at(-1)).toBe(40);
  }, 120_000);

  it('a signed-in caller still has a limit: request 101 within the minute is refused', async () => {
    const a = await login('demo@acme.test', `198.19.${octet()}.${octet()}`);
    const { statuses } = await burst(a, 105, `198.20.${octet()}.${octet()}`);
    console.log(
      `[z128] one session, 105 requests: 200×${count(statuses, 200)} 429×${count(statuses, 429)}`,
    );
    expect(count(statuses, 200)).toBe(100);
    expect(count(statuses, 429)).toBe(5);
  }, 120_000);
});

describe('callers without a verified identity: the address, and only the address', () => {
  it('anonymous requests from one address are limited together', async () => {
    const addr = `198.21.${octet()}.${octet()}`;
    const statuses: number[] = [];
    for (let i = 0; i < 105; i++) {
      statuses.push(
        (await app.inject({ method: 'GET', url: '/health', remoteAddress: addr })).statusCode,
      );
    }
    console.log(
      `[z128] anonymous, one address: 200×${count(statuses, 200)} 429×${count(statuses, 429)}`,
    );
    expect(count(statuses, 429)).toBe(5);
  }, 120_000);

  it('a random x-api-key per request opens no bucket of its own', async () => {
    const addr = `198.22.${octet()}.${octet()}`;
    const statuses: number[] = [];
    for (let i = 0; i < 105; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { 'x-api-key': `made-up-${randomUUID()}` },
        remoteAddress: addr,
      });
      statuses.push(res.statusCode);
    }
    console.log(
      `[z128] random x-api-key, one address: 200×${count(statuses, 200)} 429×${count(statuses, 429)}`,
    );
    expect(count(statuses, 429)).toBe(5);
  }, 120_000);

  it('…and in particular not on login: the eleventh attempt in the window is refused', async () => {
    const addr = `198.23.${octet()}.${octet()}`;
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'demo@acme.test', password: `wrong-${i}` },
        headers: { 'x-api-key': `made-up-${randomUUID()}` },
        remoteAddress: addr,
      });
      statuses.push(res.statusCode);
    }
    console.log(`[z128] login, random x-api-key each, one address: ${JSON.stringify(statuses)}`);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  }, 120_000);
});
