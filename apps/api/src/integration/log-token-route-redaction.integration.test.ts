/**
 * A route whose pattern names a parameter `token` does not put the token into
 * the request log, whatever the token looks like (Z181).
 *
 * ─── What was wrong (measured on master 14813b8) ─────────────────────────────
 *
 * lib/log-redaction.ts recognised a token by its SHAPE: a path segment of 40 or
 * more base64url characters. The signed tokens are 200-450 characters and were
 * caught. These were not, and were logged in full:
 *
 *   /api/v1/confirm/<uuid>                    the DOI confirmation (36 chars)
 *   /api/v1/unsubscribe/<uuid>                the legacy Redis-backed token
 *   /api/v1/preferences/<uuid>                the same, and its GET answers the
 *                                             contact's address
 *   /api/v1/email-identities/confirm/<32>     an address verification
 *
 * Whoever reads the log could confirm a double opt-in for an address that never
 * asked for it, read a contact's address, or unsubscribe them.
 *
 * ─── How it is measured ──────────────────────────────────────────────────────
 *
 * The real app (buildApp with a log stream this file reads), database and
 * Redis. Every token comes from where the product makes it: the DOI token out
 * of the confirmation e-mail's job after POST /lists/:id/subscribe, the
 * email-identity token from the row POST /email-identities wrote, the legacy
 * ones from generateUnsubscribeToken, the signed ones from createTrackingToken
 * with batch-sender's payloads. Tokens of routes whose token cannot be made
 * here without a feature of its own (reviews, video, co-marketing, zero-party
 * forms) are made by the same expression the product uses and do not exist in
 * the database — the route answers 4xx, and the log line is the same.
 *
 * The cell is the number of log lines — all of them, not only "incoming
 * request" — that contain the whole token or its first 12 characters.
 *
 * Telemetry: captureException is replaced by a recorder (MOCK — the real one
 * does nothing without SENTRY_DSN). This file registers three routes of its
 * own before the app is ready: a short-token route, the same under a plugin
 * prefix, and one that throws; and an onRequest hook that fails for a path no
 * route matches, so an unmatched request reaches the error handler.
 *
 * Everything measured is printed as `Z181_API_CELLS_JSON …` chunks.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Writable } from 'node:stream';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import type { JobType } from 'bullmq';
import { createTrackingToken } from '@forgemsg/shared';
import { redis } from '@forgemsg/shared/redis';
import { login, SEED } from './setup/harness.js';
import { db } from '../db/client.js';
import { mtaOtherQueue } from '../lib/queues.js';
import type * as Telemetry from '../lib/telemetry.js';

const captured = vi.hoisted(() => [] as (string | undefined)[]);
vi.mock('../lib/telemetry.js', async (orig) => ({
  ...(await orig<typeof Telemetry>()),
  captureException: (_err: unknown, ctx?: { route?: string }) => {
    captured.push(ctx?.route);
  },
}));

const { buildApp } = await import('../index.js');
const { generateUnsubscribeToken } = await import('../routes/v1/subscriptions.js');
const { generateReviewToken } = await import('../services/reviews-v2/pure.js');

const TAG = `z181-${randomUUID().slice(0, 8)}`;
const DOMAIN = `${TAG}.test`;
// This file's own address: its own rate-limit buckets.
const IP = `100.64.181.${1 + Math.floor(Math.random() * 250)}`;
const ALL: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active', 'completed'];
const PERSON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';

let app: FastifyInstance;
const logLines: string[] = [];
let seedOrgId = '';
let seedBefore: Record<string, unknown> = {};
let org = '';
let userId = '';
let owner: Record<string, string> = {};
let apiKey: Record<string, string> = {};
const rawKeys: string[] = [];
const legacyTokens: string[] = [];
const mailedTo: string[] = [];
let L = '';
let n = 0;
const cells: Record<string, unknown> = {};
const report: Record<string, unknown> = {
  tag: TAG,
  mock: 'captureException is a recorder; everything else is the real app, database and Redis',
};

const rows = async <T>(q: SQL) => (await db.execute(q)) as unknown as T[];
const address = (label: string) => `${label}-${n++}-${TAG}@${DOMAIN}`;
const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

const rateLimitWaits: { url: string; retryAfterS: number }[] = [];

interface Res {
  status: number;
  body: string;
}

async function inject(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<Res> {
  for (let attempt = 0; ; attempt++) {
    const res = await app.inject({
      method: method as 'POST',
      url,
      headers,
      remoteAddress: IP,
      ...(body === undefined
        ? {}
        : typeof body === 'string'
          ? { payload: body }
          : { payload: body as Record<string, unknown> }),
    });
    if (res.statusCode === 429 && attempt < 3) {
      const retryAfterS = Number(res.headers['retry-after'] ?? 60);
      rateLimitWaits.push({ url: url.split('/').slice(0, 4).join('/'), retryAfterS });
      await new Promise((r) => setTimeout(r, (retryAfterS + 1) * 1000));
      continue;
    }
    return { status: res.statusCode, body: res.body };
  }
}

interface Parsed {
  msg?: string;
  reqId?: string;
  req?: Record<string, unknown> & { url?: string };
  res?: { statusCode?: number };
}

interface Hit {
  method: string;
  status: number;
  /** Lines (all of them) holding the whole token or its first 12 characters. */
  linesWithToken: number;
  /** The url of this request's "incoming request" line. */
  loggedUrl: string | null;
  /** The answer, with the token and ids taken out — master and branch compare it. */
  body: string;
}

/**
 * One request and what the log made of it. The lines are the ones written
 * while it ran; this file sends one request at a time.
 */
async function hit(
  method: string,
  url: string,
  token: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<Hit> {
  const before = logLines.length;
  const r = await inject(method, url, headers, body);
  await new Promise((res) => setImmediate(res));
  const mine = logLines.slice(before);
  const head = token.slice(0, 12);
  const incoming = mine
    .map((l) => JSON.parse(l) as Parsed)
    .find((p) => p.msg === 'incoming request');
  return {
    method,
    status: r.status,
    linesWithToken: mine.filter((l) => l.includes(token) || l.includes(head)).length,
    loggedUrl: incoming?.req?.url ?? null,
    body: sha(
      r.body
        .split(token)
        .join('<token>')
        .split(TAG)
        .join('<tag>')
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>')
        .replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, '<ts>'),
    ),
  };
}

/** The seed organisation as a whole: this file must leave it exactly as it found it. */
async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await rows<Record<string, unknown>>(sql`
    SELECT (SELECT count(*)::int FROM contacts WHERE org_id = ${seedOrgId}::uuid) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId}::uuid) AS suppressions,
           (SELECT count(*)::int FROM lists WHERE org_id = ${seedOrgId}::uuid) AS lists,
           (SELECT count(*)::int FROM consent_events WHERE org_id = ${seedOrgId}::uuid) AS consent_events,
           (SELECT count(*)::int FROM audit_logs WHERE org_id = ${seedOrgId}::uuid) AS audit_logs,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${seedOrgId}::uuid) AS members,
           (SELECT count(*)::int FROM users WHERE org_id = ${seedOrgId}::uuid) AS users,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${seedOrgId}::uuid) AS api_keys,
           (SELECT count(*)::int FROM email_identities WHERE org_id = ${seedOrgId}::uuid) AS email_identities
  `);
  return r!;
}

async function asOwner(method: string, url: string, body?: unknown) {
  const r = await inject(method, url, owner, body);
  expect(r.status, `${method} ${url}: ${r.body}`).toBeLessThan(300);
  return (r.body ? JSON.parse(r.body) : {}) as { data: Record<string, unknown> & { id: string } };
}

async function newContact(label: string): Promise<{ id: string; email: string }> {
  const email = address(label);
  const b = await asOwner('POST', '/api/v1/contacts', { email });
  return { id: b.data.id, email };
}

async function statusOf(contactId: string): Promise<string> {
  const [c] = await rows<{ status: string }>(
    sql`SELECT status::text AS status FROM contacts WHERE id = ${contactId}::uuid`,
  );
  return c?.status ?? 'no contact';
}

async function legacyToken(contactId: string): Promise<string> {
  const t = await generateUnsubscribeToken(contactId, org);
  legacyTokens.push(t);
  return t;
}

/** The DOI link in the confirmation e-mail queued for `email`. */
async function mailedDoiToken(email: string): Promise<string> {
  const jobs = (await mtaOtherQueue.getJobs(ALL, 0, 10_000))
    .filter((j) => j?.data?.orgId === org && j.data.toEmail === email)
    .sort((a, b) => a.timestamp - b.timestamp);
  const m = /\/api\/v1\/confirm\/([0-9a-f-]{36})/.exec(String(jobs.at(-1)?.data.htmlBody ?? ''));
  expect(m, 'no confirmation e-mail with a link').toBeTruthy();
  return m![1]!;
}

beforeAll(async () => {
  const sink = new Writable({
    write(chunk, _enc, cb) {
      for (const line of chunk.toString().split('\n')) if (line.trim()) logLines.push(line);
      cb();
    },
  });
  app = await buildApp({ loggerStream: sink });
  // Routes of this file's own, registered the way any route is.
  app.get('/z181-short/:token', async () => ({ ok: true }));
  app.get('/z181-boom/:token', async () => {
    throw new Error('z181 boom');
  });
  await app.register(
    async (scope) => {
      scope.get('/item/:token', async () => ({ ok: true }));
    },
    { prefix: '/z181-prefixed' },
  );
  app.addHook('onRequest', async (req) => {
    if (req.url.startsWith('/z181-gone/')) throw new Error('z181 hook failed');
  });
  await app.ready();

  const seed = await login(app);
  seedOrgId = seed.orgId;
  seedBefore = await seedState();
  rawKeys.push(seed.token);

  const [o] = await rows<{ id: string }>(sql`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`${TAG} org`}, ${TAG}, 'production', 'Obchod z181 s.r.o.', 'Nádražní 1, 110 00 Praha')
    RETURNING id
  `);
  org = o!.id;
  // This file's own user: the seed user's password hash, so login() works.
  const email = `${TAG}-owner@test.local`;
  const [u] = await rows<{ id: string }>(sql`
    INSERT INTO users (org_id, email, name, password_hash, role, email_verified)
    SELECT ${org}::uuid, ${email}, ${`${TAG} owner`}, password_hash, 'owner', true
    FROM users WHERE email = ${SEED.email}
    RETURNING id
  `);
  userId = u!.id;
  await db.execute(sql`
    INSERT INTO organization_members (org_id, user_id, email, role, status)
    VALUES (${org}::uuid, ${userId}::uuid, ${email}, 'owner', 'active')
  `);
  const session = await login(app, email);
  expect(session.orgId).toBe(org);
  owner = { authorization: `Bearer ${session.token}` };
  rawKeys.push(session.token);
  const key = await asOwner('POST', '/api/v1/api-keys', { name: `${TAG} key` });
  const raw = String((key.data as { rawKey?: string }).rawKey);
  apiKey = { 'x-api-key': raw };
  rawKeys.push(raw);

  const list = await asOwner('POST', '/api/v1/lists', { name: `${TAG} L`, doubleOptIn: true });
  L = list.data.id;
}, 600_000);

afterAll(async () => {
  let jobsRemoved = 0;
  for (const j of await mtaOtherQueue.getJobs(ALL, 0, 10_000)) {
    if (j?.data?.orgId === org || mailedTo.includes(j?.data?.toEmail)) {
      await j.remove().catch(() => {});
      jobsRemoved++;
    }
  }
  const doiKeys = async (remove: boolean) => {
    let found = 0;
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:*', 'COUNT', 1000);
      cursor = next;
      for (const k of keys) {
        const mine = k.startsWith('doi:limit:')
          ? k.startsWith(`doi:limit:${L}:`)
          : (await redis.type(k)) === 'string' && !!(await redis.get(k))?.includes(org);
        if (!mine) continue;
        found++;
        if (remove) await redis.del(k);
      }
    } while (cursor !== '0');
    return found;
  };
  const doiKeysRemoved = org ? await doiKeys(true) : 0;
  let legacyKeysRemoved = 0;
  for (const t of legacyTokens) legacyKeysRemoved += await redis.del(`unsub:${t}`, `pref:${t}`);
  let limitKeysRemoved = 0;
  for (const k of rawKeys) {
    const d = createHash('sha256').update(k).digest('hex').slice(0, 32);
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `*${d}*`, 'COUNT', 1000);
      cursor = next;
      for (const key of keys) limitKeysRemoved += await redis.del(key);
    } while (cursor !== '0');
  }
  if (org) {
    await db.execute(sql`DELETE FROM consent_events WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM audit_logs WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM api_keys WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM organization_members WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM users WHERE org_id = ${org}::uuid`);
    // Everything else of the organisation goes with it (ON DELETE CASCADE).
    await db.execute(sql`DELETE FROM organizations WHERE id = ${org}::uuid`);
  }
  const [left] = await rows<Record<string, number>>(sql`
    SELECT (SELECT count(*)::int FROM organizations WHERE id = ${org}::uuid) AS orgs,
           (SELECT count(*)::int FROM users WHERE id = ${userId}::uuid) AS users,
           (SELECT count(*)::int FROM contacts WHERE org_id = ${org}::uuid) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${org}::uuid) AS suppressions,
           (SELECT count(*)::int FROM lists WHERE org_id = ${org}::uuid) AS lists,
           (SELECT count(*)::int FROM consent_events WHERE org_id = ${org}::uuid) AS consent_events,
           (SELECT count(*)::int FROM audit_logs WHERE org_id = ${org}::uuid) AS audit_logs,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${org}::uuid) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${org}::uuid) AS api_keys,
           (SELECT count(*)::int FROM email_identities WHERE org_id = ${org}::uuid) AS email_identities
  `);
  const doiKeysLeft = org ? await doiKeys(false) : 0;
  let legacyKeysLeft = 0;
  for (const t of legacyTokens) legacyKeysLeft += await redis.exists(`unsub:${t}`, `pref:${t}`);
  const seedAfter = await seedState();
  report.cells = cells;
  report.rateLimitWaits = rateLimitWaits;
  report.leftover = {
    ...left,
    doiKeysLeft,
    legacyKeysLeft,
    doiKeysRemoved,
    legacyKeysRemoved,
    limitKeysRemoved,
    jobsRemoved,
  };
  report.seedOrg = { before: seedBefore, after: seedAfter };
  const all = JSON.stringify(report);
  const parts = Math.ceil(all.length / 3000);
  for (let i = 0; i < parts; i++)
    console.log(
      `Z181_API_CELLS_JSON ${String(i).padStart(4, '0')}/${parts} ${all.slice(i * 3000, (i + 1) * 3000)}`,
    );
  await app.close();
  expect(left, 'what this file made was not all removed').toEqual({
    orgs: 0,
    users: 0,
    contacts: 0,
    suppressions: 0,
    lists: 0,
    consent_events: 0,
    audit_logs: 0,
    members: 0,
    api_keys: 0,
    email_identities: 0,
  });
  expect(doiKeysLeft).toBe(0);
  expect(legacyKeysLeft).toBe(0);
  expect(seedAfter, 'the seed organisation changed').toEqual(seedBefore);
}, 600_000);

describe('a :token route keeps its token out of the log, whatever the token looks like (Z181)', () => {
  it('DOI confirmation — the page (GET), HEAD and the button (POST); the button still confirms', async () => {
    const email = address('doi');
    const sub = await inject('POST', `/api/v1/lists/${L}/subscribe`, {}, { email });
    expect(sub.status, sub.body).toBe(202);
    const token = await mailedDoiToken(email);
    const [c] = await rows<{ id: string }>(sql`
      SELECT id FROM contacts WHERE org_id = ${org}::uuid AND lower(email) = lower(${email})
    `);
    const statusBefore = await statusOf(c!.id);
    const path = `/api/v1/confirm/${token}`;
    const get = await hit('GET', path, token, { 'user-agent': PERSON_UA });
    const head = await hit('HEAD', path, token, { 'user-agent': PERSON_UA });
    const post = await hit(
      'POST',
      path,
      token,
      { 'user-agent': PERSON_UA, 'content-type': 'application/x-www-form-urlencoded' },
      '',
    );
    const [ce] = await rows<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM consent_events
      WHERE org_id = ${org}::uuid AND contact_id = ${c!.id}::uuid AND event_type = 'double_opt_in'
    `);
    const cell = {
      token: { length: token.length, shape: 'uuid' },
      get,
      head,
      post,
      statusBefore,
      statusAfter: await statusOf(c!.id),
      doubleOptInEvents: ce!.n,
    };
    cells.doi = cell;
    expect(get.status).toBe(200);
    expect(head.status).toBe(200);
    expect(post.status, 'no thank-you URL on this list: the thank-you page').toBe(200);
    expect(cell.statusBefore).toBe('pending');
    expect(cell.statusAfter, 'the button no longer confirms').toBe('active');
    expect(cell.doubleOptInEvents).toBe(1);
    expect(get.loggedUrl).toBe('/api/v1/confirm/[redacted]');
    expect(head.loggedUrl).toBe('/api/v1/confirm/[redacted]');
    expect(post.loggedUrl).toBe('/api/v1/confirm/[redacted]');
    expect([get.linesWithToken, head.linesWithToken, post.linesWithToken]).toEqual([0, 0, 0]);
  });

  it('legacy unsubscribe (GET page, POST one-click) and preferences (GET, POST) with their UUID tokens', async () => {
    const a = await newContact('unsub-get');
    const b = await newContact('unsub-post');
    const p = await newContact('pref');
    const t1 = await legacyToken(a.id);
    const t2 = await legacyToken(b.id);
    const t3 = await legacyToken(p.id);
    const t4 = await legacyToken(p.id);
    const unsubGet = await hit('GET', `/api/v1/unsubscribe/${t1}`, t1);
    const unsubPost = await hit('POST', `/api/v1/unsubscribe/${t2}`, t2);
    const prefGet = await hit('GET', `/api/v1/preferences/${t3}`, t3);
    const prefPost = await hit(
      'POST',
      `/api/v1/preferences/${t4}`,
      t4,
      {},
      { listIdsToRemove: [] },
    );
    const cell = {
      token: { length: t1.length, shape: 'uuid', source: 'generateUnsubscribeToken' },
      unsubGet,
      unsubPost,
      prefGet,
      prefPost,
      unsubscribed: [await statusOf(a.id), await statusOf(b.id)],
      prefContact: await statusOf(p.id),
    };
    cells.legacy = cell;
    expect(unsubGet.status).toBe(200);
    expect(unsubPost.status).toBe(204);
    expect(prefGet.status).toBe(200);
    expect(prefPost.status).toBe(204);
    expect(cell.unsubscribed, 'unsubscribe no longer unsubscribes').toEqual([
      'unsubscribed',
      'unsubscribed',
    ]);
    for (const [h, base] of [
      [unsubGet, '/api/v1/unsubscribe/'],
      [unsubPost, '/api/v1/unsubscribe/'],
      [prefGet, '/api/v1/preferences/'],
      [prefPost, '/api/v1/preferences/'],
    ] as const) {
      expect(h.loggedUrl).toBe(`${base}[redacted]`);
      expect(h.linesWithToken).toBe(0);
    }
  });

  it('email-identity confirmation (32 characters) — confirmed, and not in the log', async () => {
    const email = address('identity');
    mailedTo.push(email);
    await asOwner('POST', '/api/v1/email-identities', { email });
    const [row] = await rows<{ token: string }>(sql`
      SELECT token FROM email_identities WHERE org_id = ${org}::uuid AND email = ${email}
    `);
    const token = row!.token;
    const confirm = await hit('GET', `/api/v1/email-identities/confirm/${token}`, token);
    const [after] = await rows<{ status: string }>(sql`
      SELECT status::text AS status FROM email_identities WHERE org_id = ${org}::uuid AND email = ${email}
    `);
    cells.emailIdentity = { token: { length: token.length }, confirm, statusAfter: after!.status };
    expect(confirm.status).toBe(200);
    expect(after!.status).toBe('verified');
    expect(confirm.loggedUrl).toBe('/api/v1/email-identities/confirm/[redacted]');
    expect(confirm.linesWithToken).toBe(0);
  });

  it('the other :token routes whose token the shape rule let through (tokens of the product shape, not stored)', async () => {
    const review = generateReviewToken();
    const video = randomBytes(24).toString('base64url');
    const coMarketing = randomUUID();
    const zeroParty = randomUUID();
    const cases = {
      reviewsRequest: await hit('GET', `/reviews-v2/request/${review}`, review),
      reviewsSubmit: await hit('POST', `/reviews-v2/submit/${review}`, review, {}, { rating: 5 }),
      videoLanding: await hit('GET', `/v/${video}`, video),
      videoEvents: await hit('POST', `/v/${video}/events`, video, {}, { type: 'play' }),
      coMarketingAccept: await hit(
        'POST',
        `/api/v1/co-marketing/accept/${coMarketing}`,
        coMarketing,
        apiKey,
        {},
      ),
      coMarketingReject: await hit(
        'POST',
        `/api/v1/co-marketing/reject/${coMarketing}`,
        coMarketing,
        apiKey,
        {},
      ),
      zeroPartySubmit: await hit(
        'POST',
        `/api/v1/zero-party/forms/${zeroParty}/submit`,
        zeroParty,
        {},
        {},
      ),
    };
    cells.otherRoutes = {
      tokenLengths: { review: review.length, video: video.length, uuid: coMarketing.length },
      ...cases,
    };
    for (const h of Object.values(cases)) {
      expect(h.loggedUrl).toContain('[redacted]');
      expect(h.linesWithToken).toBe(0);
    }
  });

  it('long signed tokens: the same marker as before (preferences, click, open, preference centre)', async () => {
    const ids = { orgId: randomUUID(), contactId: randomUUID(), campaignId: randomUUID() };
    const ts = Date.now();
    const pref = createTrackingToken({
      type: 'pref',
      orgId: ids.orgId,
      contactId: ids.contactId,
      ts,
    });
    const click = createTrackingToken({
      type: 'click',
      ...ids,
      url: 'https://shop.example.cz/produkt?utm_source=forgemsg',
      ts,
    });
    const open = createTrackingToken({ type: 'open', ...ids, ts });
    const cases = {
      preferences: await hit('GET', `/api/v1/preferences/${pref}`, pref),
      click: await hit('GET', `/track/c/${click}`, click),
      open: await hit('GET', `/track/o/${open}`, open),
      centre: await hit('GET', `/p/center/${pref}`, pref),
    };
    cells.longTokens = {
      lengths: { pref: pref.length, click: click.length, open: open.length },
      ...cases,
    };
    expect(cases.preferences.loggedUrl).toBe('/api/v1/preferences/[redacted]');
    expect(cases.click.loggedUrl).toBe('/track/c/[redacted]');
    expect(cases.open.loggedUrl).toBe('/track/o/[redacted]');
    expect(cases.centre.loggedUrl).toBe('/p/center/[redacted]');
    for (const h of Object.values(cases)) expect(h.linesWithToken).toBe(0);
  });

  it('a route this file registered, with an 8-character token — directly and under a plugin prefix', async () => {
    const t1 = randomBytes(6).toString('base64url');
    const t2 = randomBytes(6).toString('base64url');
    const direct = await hit('GET', `/z181-short/${t1}`, t1);
    const prefixed = await hit('GET', `/z181-prefixed/item/${t2}`, t2);
    cells.registered = { tokenLength: t1.length, direct, prefixed };
    expect(direct.status).toBe(200);
    expect(prefixed.status).toBe(200);
    expect(direct.loggedUrl).toBe('/z181-short/[redacted]');
    expect(prefixed.loggedUrl).toBe('/z181-prefixed/item/[redacted]');
    expect([direct.linesWithToken, prefixed.linesWithToken]).toEqual([0, 0]);
  });

  it('telemetry: the route string of a 500 on a :token route and of an unmatched request (MOCK recorder)', async () => {
    const short = randomBytes(6).toString('base64url');
    const signed = createTrackingToken({
      type: 'unsub',
      orgId: randomUUID(),
      contactId: randomUUID(),
      ts: Date.now(),
    });
    captured.length = 0;
    const boom = await hit('GET', `/z181-boom/${short}`, short);
    const boomRoute = captured.at(-1) ?? null;
    captured.length = 0;
    const gone = await hit('GET', `/z181-gone/${signed}?token=${short}`, signed);
    const goneRoute = captured.at(-1) ?? null;
    const cell = {
      boom: { status: boom.status, route: boomRoute, linesWithToken: boom.linesWithToken },
      gone: { status: gone.status, route: goneRoute, linesWithToken: gone.linesWithToken },
      routeHoldsToken: {
        boom: !!boomRoute?.includes(short),
        gone: !!goneRoute && (goneRoute.includes(signed.slice(0, 12)) || goneRoute.includes(short)),
      },
    };
    cells.telemetry = cell;
    expect(boom.status).toBe(500);
    expect(gone.status).toBe(500);
    expect(boomRoute).toBe('GET /z181-boom/:token');
    expect(goneRoute).toBe('GET /z181-gone/[redacted]?token=[redacted]');
    expect(cell.routeHoldsToken).toEqual({ boom: false, gone: false });
    expect([boom.linesWithToken, gone.linesWithToken]).toEqual([0, 0]);
  });

  it('K — ids, ordinary urls and the fields around the url are logged as before', async () => {
    const c = await newContact('k');
    const campaignId = randomUUID();
    const formId = randomUUID();
    const orgParam = randomUUID();
    const unmatched = randomUUID();
    const contact = await hit('GET', `/api/v1/contacts/${c.id}`, c.id, apiKey);
    const campaign = await hit('GET', `/api/v1/campaigns/${campaignId}`, campaignId, apiKey);
    const before = logLines.length;
    const list = await hit('GET', '/api/v1/campaigns?limit=5&status=draft', 'limit=5', apiKey);
    const autofill = await hit(
      'GET',
      `/public/forms/${formId}/autofill?orgId=${orgParam}`,
      orgParam,
    );
    const nothing = await hit('GET', `/api/v1/nothing-here/${unmatched}`, unmatched);
    const parsed = logLines.slice(before).map((l) => JSON.parse(l) as Parsed);
    const incoming = parsed.filter((p) => p.msg === 'incoming request');
    const completed = parsed.filter((p) => typeof p.res?.statusCode === 'number');
    const cell = {
      contact,
      campaign,
      list,
      autofill,
      nothing,
      incomingLines: incoming.length,
      completedLines: completed.length,
      reqFields: [...new Set(incoming.flatMap((p) => Object.keys(p.req ?? {})))].sort(),
      everyIncomingHasReqId: incoming.every((p) => !!p.reqId),
      everyIncomingAnswered: incoming.every((p) => completed.some((q) => q.reqId === p.reqId)),
    };
    cells.K = cell;
    expect(contact.status).toBe(200);
    expect(contact.loggedUrl).toBe(`/api/v1/contacts/${c.id}`);
    expect(campaign.loggedUrl).toBe(`/api/v1/campaigns/${campaignId}`);
    expect(list.loggedUrl).toBe('/api/v1/campaigns?limit=5&status=draft');
    expect(autofill.loggedUrl).toBe(`/public/forms/${formId}/autofill?orgId=${orgParam}`);
    // No pattern for an unmatched request: the shape rules only, a UUID stays.
    expect(nothing.status).toBe(404);
    expect(nothing.loggedUrl).toBe(`/api/v1/nothing-here/${unmatched}`);
    expect(cell.incomingLines).toBe(3);
    expect(cell.everyIncomingHasReqId).toBe(true);
    expect(cell.everyIncomingAnswered).toBe(true);
    expect(cell.reqFields).toEqual(
      expect.arrayContaining(['host', 'method', 'remoteAddress', 'url']),
    );
  });

  it('K — audit_logs of this organisation (what the owner did here)', async () => {
    const audit = await rows<{ action: string; n: number }>(sql`
      SELECT action, count(*)::int AS n FROM audit_logs WHERE org_id = ${org}::uuid
      GROUP BY action ORDER BY action
    `);
    const paths = await rows<{ path: string | null }>(sql`
      SELECT metadata->>'path' AS path FROM audit_logs WHERE org_id = ${org}::uuid
    `);
    cells.audit = { byAction: audit, paths: [...new Set(paths.map((p) => p.path))].sort() };
    for (const p of paths) expect(p.path ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
