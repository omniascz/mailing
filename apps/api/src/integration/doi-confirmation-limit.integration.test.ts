/**
 * The list double opt-in confirmation: at most three per address and list in
 * 24 hours, and the suppression rows the erasure exception has to tell apart
 * (Z170).
 *
 * ─── Why this file exists ────────────────────────────────────────────────────
 *
 * POST /api/v1/lists/:listId/subscribe is public, and it and a signup form
 * with double opt-in both call sendListDoiConfirmation, which queued a
 * confirmation every time it was asked: anyone could mail any address a
 * confirmation as often as they liked. Michal 14. 10.: max 3 za 24 h na
 * adresu a seznam; over the limit nothing is stored or queued, and the answer
 * is the one a sent confirmation gets.
 *
 * The same decision (varianta (a)) narrows the DOI exception from every
 * 'manual' row to the row a GDPR erasure leaves. This file records which rows
 * each writer of 'manual' makes (Sonda 1) and what check-batch answers for
 * them; apps/workers/src/integration/doi-erasure-only walks the confirmation
 * to the engine.
 *
 * ─── What this file measures ─────────────────────────────────────────────────
 *
 * Through the real app (buildApp, inject, the real database and Redis). An
 * organisation of this file, its owner session from POST /api/v1/me/orgs/switch;
 * lists, the form, contacts, suppressions, the erasure and the graymail sweep
 * through their routes (the graymail contact is INSERTed: its age and send
 * count cannot be set through a route). Public calls come from an address of
 * this file (its own rate-limit bucket); the limit of the route is not lifted.
 * No worker runs in this process: a confirmation is counted as the MTA job it
 * queued and the `doi:<token>` key it stored.
 *
 *   L   5× the route, 5× the form, another list (L2), another address (L3),
 *       the window moved by rewriting the stored times (L4), five at once
 *       (L5), the address in capitals (L6), the key (L7);
 *   S1  the rows each writer of a suppression leaves;
 *   CB  check-batch for those rows, with and without exceptErasure;
 *   S3  how many subscribe requests one address gets through in a minute;
 *   C   the plan of check-batch, and the Redis commands of one confirmation.
 *
 * Everything measured is printed once as `Z170_API_CELLS_JSON {…}`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import type { JobType } from 'bullmq';
import { redis } from '@forgemsg/shared/redis';
import { createTestApp, login, SEED, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { observeQueries } from '../db/explain-guard.js';
import { mtaOtherQueue } from '../lib/queues.js';
import { suppressionEmailHash } from '../services/suppressions/email.js';

const TAG = `z170-${randomUUID().slice(0, 8)}`;
const DOMAIN = `${TAG}.test`;
const octet = () => 1 + Math.floor(Math.random() * 250);
// This file's own addresses: its own rate-limit buckets for the public routes.
const IP = `100.64.170.${octet()}`;
const PROBE_IP = `100.64.171.${octet()}`;
const INTERNAL = { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' };
const TRANSACTIONAL = ['hard_bounce', 'complaint', 'manual', 'block', 'invalid_email'];
const SENT_MESSAGE = 'Confirmation email sent. Please check your inbox.';
const FORM_MESSAGE = 'Almost there — check your inbox to confirm your subscription.';
const DAY_MS = 24 * 60 * 60 * 1000;
const ALL: JobType[] = [
  'waiting',
  'prioritized',
  'delayed',
  'paused',
  'active',
  'completed',
  'failed',
];

let app: FastifyInstance;
let seedSession: Session;
let seedOrgId = '';
let org = '';
let owner: Record<string, string> = {};
let seedBefore: Record<string, unknown> = {};
const lists: Record<string, { id: string; name: string }> = {};
const formIds: string[] = [];
const report: Record<string, unknown> = {
  tag: TAG,
  mock: 'none — no worker runs in this process; a confirmation is its MTA job and its doi:<token> key',
};
const cells: Record<string, unknown> = {};
const warns: string[] = [];
const realWarn = console.warn;

const rows = async <T>(q: SQL) => (await db.execute(q)) as unknown as T[];
const scrub = (s: string) =>
  s
    .split(TAG)
    .join('<TAG>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/[0-9a-f]{64}/g, '<HASH>');
const address = (label: string) => `${label}-${TAG}@${DOMAIN}`;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function inject(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
  remoteAddress = IP,
): Promise<{ status: number; body: string }> {
  const res = await app.inject({
    method: method as 'POST',
    url,
    headers,
    remoteAddress,
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  });
  return { status: res.statusCode, body: res.body };
}

async function asOwner(method: string, url: string, body?: unknown): Promise<unknown> {
  const r = await inject(method, url, owner, body);
  expect(r.status, `${method} ${url}: ${r.body}`).toBeLessThan(300);
  return r.body ? JSON.parse(r.body) : null;
}

/** The seed org as a whole: this file must leave it exactly as it found it. */
async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await rows<Record<string, unknown>>(sql`
    SELECT (SELECT count(*)::int FROM contacts WHERE org_id = ${seedOrgId}::uuid) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId}::uuid) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId}::uuid AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM lists WHERE org_id = ${seedOrgId}::uuid) AS lists,
           (SELECT count(*)::int FROM signup_forms WHERE org_id = ${seedOrgId}::uuid) AS forms,
           (SELECT count(*)::int FROM signup_form_submissions WHERE org_id = ${seedOrgId}::uuid) AS submissions,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${seedOrgId}::uuid) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${seedOrgId}::uuid) AS api_keys,
           (SELECT count(*)::int FROM users WHERE org_id = ${seedOrgId}::uuid) AS users
  `);
  return r!;
}

async function newList(label: string): Promise<{ id: string; name: string }> {
  const name = `${TAG} ${label}`;
  const b = (await asOwner('POST', '/api/v1/lists', { name, doubleOptIn: true })) as {
    data: { id: string };
  };
  lists[label] = { id: b.data.id, name };
  return lists[label]!;
}

async function newForm(listId: string): Promise<string> {
  const b = (await asOwner('POST', '/api/v1/signup-forms', {
    name: `${TAG} form ${formIds.length}`,
    listId,
    fields: [{ name: 'email', label: 'E-mail', type: 'email', required: true }],
    config: { doubleOptIn: true },
  })) as { data: { id: string } };
  formIds.push(b.data.id);
  return b.data.id;
}

const subscribe = (listId: string, email: string) =>
  inject('POST', `/api/v1/lists/${listId}/subscribe`, {}, { email });
const submit = (formId: string, email: string) =>
  inject('POST', `/public/forms/${formId}/submit`, {}, { email });

/** Confirmation jobs queued for `email` (any case) for list `listName`. */
async function confirmations(email: string, listName: string): Promise<number> {
  const jobs = await mtaOtherQueue.getJobs(ALL, 0, 10_000);
  return jobs.filter(
    (j) =>
      j?.data?.orgId === org &&
      j.data.toEmail?.toLowerCase() === email.toLowerCase() &&
      j.data.subject === `Confirm your subscription to ${listName}`,
  ).length;
}

async function scanKeys(pattern: string): Promise<string[]> {
  const out: string[] = [];
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
    cursor = next;
    out.push(...keys);
  } while (cursor !== '0');
  return out;
}

/** `doi:<token>` keys stored for `email` on `listId`. */
async function tokens(email: string, listId: string): Promise<number> {
  const ids = (
    await rows<{ id: string }>(sql`
      SELECT id FROM contacts WHERE org_id = ${org}::uuid AND lower(email) = lower(${email})
    `)
  ).map((r) => r.id);
  let n = 0;
  for (const key of await scanKeys('doi:*')) {
    if (key.startsWith('doi:limit:') || key.startsWith('doi:purpose:')) continue;
    const raw = await redis.get(key);
    if (!raw) continue;
    try {
      const p = JSON.parse(raw) as { orgId?: string; listId?: string; contactId?: string };
      if (p.orgId === org && p.listId === listId && ids.includes(p.contactId ?? '')) n++;
    } catch {
      // not a confirmation token
    }
  }
  return n;
}

const limitKey = (listId: string, email: string) =>
  `doi:limit:${listId}:${suppressionEmailHash(email.toLowerCase())}`;

const message = (body: string) => {
  try {
    return (JSON.parse(body) as { data?: { message?: string } }).data?.message ?? null;
  } catch {
    return null;
  }
};
const dataKeys = (body: string) => {
  try {
    return Object.keys((JSON.parse(body) as { data?: object }).data ?? {}).sort();
  } catch {
    return [];
  }
};
const rateLimited = (listId: string) =>
  warns.filter((w) => w.startsWith(`[doi] doi_rate_limited list=${listId} org=${org}`));

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  seedSession = await login(app);
  seedOrgId = seedSession.orgId;
  seedBefore = await seedState();
  console.warn = (...args: unknown[]) => {
    warns.push(args.map(String).join(' '));
    realWarn(...args);
  };

  const [o] = await rows<{ id: string }>(sql`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`${TAG} org`}, ${TAG}, 'production', 'Obchod z170 s.r.o.', 'Nádražní 1, 110 00 Praha')
    RETURNING id
  `);
  org = o!.id;
  await db.execute(sql`
    INSERT INTO organization_members (org_id, user_id, email, role, status)
    VALUES (${org}::uuid, ${seedSession.userId}::uuid, ${SEED.email}, 'owner', 'active')
  `);
  const r = await inject(
    'POST',
    '/api/v1/me/orgs/switch',
    { cookie: seedSession.cookie },
    { orgId: org },
  );
  expect(r.status, r.body).toBe(200);
  owner = bearer((JSON.parse(r.body) as { data: { token: string } }).data.token);

  await newList('one');
  await newList('two');
  await newList('form');
}, 120_000);

afterAll(async () => {
  console.warn = realWarn;
  for (const j of await mtaOtherQueue.getJobs(ALL, 0, 10_000)) {
    if (j?.data?.orgId === org || j?.data?.toEmail?.toLowerCase().endsWith(`@${DOMAIN}`))
      await j.remove().catch(() => {});
  }
  const listIds = Object.values(lists).map((l) => l.id);
  let tokensLeft = 0;
  for (const key of await scanKeys('doi:*')) {
    if (listIds.some((id) => key.startsWith(`doi:limit:${id}:`))) {
      await redis.del(key);
      continue;
    }
    if (key.startsWith('doi:limit:') || key.startsWith('doi:purpose:')) continue;
    const raw = await redis.get(key);
    if (raw?.includes(org)) {
      await redis.del(key);
      tokensLeft++;
    }
  }
  if (org) {
    await db.execute(sql`DELETE FROM consent_events WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM email_events WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM audit_logs WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM api_keys WHERE org_id = ${org}::uuid`);
    // Everything else of the organisation goes with it (ON DELETE CASCADE).
    await db.execute(sql`DELETE FROM organizations WHERE id = ${org}::uuid`);
  }
  const [left] = await rows<Record<string, number>>(sql`
    SELECT (SELECT count(*)::int FROM organizations WHERE id = ${org}::uuid) AS orgs,
           (SELECT count(*)::int FROM contacts WHERE org_id = ${org}::uuid) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${org}::uuid) AS suppressions,
           (SELECT count(*)::int FROM lists WHERE org_id = ${org}::uuid) AS lists,
           (SELECT count(*)::int FROM signup_forms WHERE org_id = ${org}::uuid) AS forms,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${org}::uuid) AS members
  `);
  const keysLeft = (await scanKeys('doi:limit:*')).filter((k) =>
    listIds.some((id) => k.startsWith(`doi:limit:${id}:`)),
  ).length;
  const seedAfter = await seedState();
  report.cells = cells;
  report.leftover = { ...left, limitKeys: keysLeft, tokensRemoved: tokensLeft };
  report.seedOrg = { before: seedBefore, after: seedAfter };
  console.log(`Z170_API_CELLS_JSON ${JSON.stringify(report)}`);
  await app?.close();
  expect(left, 'what this file made was not all removed').toEqual({
    orgs: 0,
    contacts: 0,
    suppressions: 0,
    lists: 0,
    forms: 0,
    members: 0,
  });
  expect(keysLeft).toBe(0);
  // The seed org exactly as this file found it — a snapshot, not zeros.
  expect(seedAfter).toEqual(seedBefore);
}, 120_000);

describe('DOI confirmation: three per address and list in 24 hours (Z170)', () => {
  it('L1 — 5× POST /lists/:id/subscribe, same address and list: 3 queued, 5 identical answers', async () => {
    const list = lists.one!;
    const a = address('l1');
    const answers = [];
    for (let i = 0; i < 5; i++) answers.push(await subscribe(list.id, a));
    const cell = {
      statuses: answers.map((r) => r.status),
      messages: answers.map((r) => message(r.body)),
      dataKeys: answers.map((r) => dataKeys(r.body).join(',')),
      queued: await confirmations(a, list.name),
      tokens: await tokens(a, list.id),
      rateLimitedLog: rateLimited(list.id).map(scrub),
    };
    cells.L1 = cell;
    console.log(`[z170] L1: ${JSON.stringify(cell)}`);
    expect(cell.statuses).toEqual([202, 202, 202, 202, 202]);
    expect(new Set(cell.messages)).toEqual(new Set([SENT_MESSAGE]));
    expect(new Set(cell.dataKeys).size, 'the answers differ in shape').toBe(1);
    expect(cell.queued).toBe(3);
    expect(cell.tokens).toBe(3);
    expect(cell.rateLimitedLog).toEqual([
      '[doi] doi_rate_limited list=<UUID> org=<UUID>',
      '[doi] doi_rate_limited list=<UUID> org=<UUID>',
    ]);
    expect(warns.filter((w) => w.includes(a) || w.includes(TAG))).toEqual([]);
  });

  it('LF — 5 submissions of a double opt-in form: 3 queued, 5 submissions, 5 identical answers', async () => {
    const list = lists.form!;
    const form = await newForm(list.id);
    const a = address('lf');
    const answers = [];
    for (let i = 0; i < 5; i++) answers.push(await submit(form, a));
    const [s] = await rows<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM signup_form_submissions WHERE form_id = ${form}::uuid
    `);
    const cell = {
      statuses: answers.map((r) => r.status),
      messages: answers.map((r) => message(r.body)),
      queued: await confirmations(a, list.name),
      tokens: await tokens(a, list.id),
      submissions: s!.n,
    };
    cells.LF = cell;
    console.log(`[z170] LF: ${JSON.stringify(cell)}`);
    expect(cell.statuses).toEqual([200, 200, 200, 200, 200]);
    expect(new Set(cell.messages)).toEqual(new Set([FORM_MESSAGE]));
    expect(cell.submissions).toBe(5);
    expect(cell.queued).toBe(3);
    expect(cell.tokens).toBe(3);
  });

  it('L2 — the same address on another list of the org has a limit of its own', async () => {
    const a = address('l1');
    const list = lists.two!;
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await subscribe(list.id, a)).status);
    const cell = {
      statuses,
      queuedHere: await confirmations(a, list.name),
      queuedFirstList: await confirmations(a, lists.one!.name),
      tokens: await tokens(a, list.id),
    };
    cells.L2 = cell;
    console.log(`[z170] L2: ${JSON.stringify(cell)}`);
    expect(cell.statuses).toEqual([202, 202, 202, 202]);
    expect(cell.queuedHere).toBe(3);
    expect(cell.tokens).toBe(3);
  });

  it('L3 — another address on the same list has a limit of its own', async () => {
    const list = lists.one!;
    const a = address('l3');
    for (let i = 0; i < 4; i++) expect((await subscribe(list.id, a)).status).toBe(202);
    const cell = { queued: await confirmations(a, list.name), tokens: await tokens(a, list.id) };
    cells.L3 = cell;
    console.log(`[z170] L3: ${JSON.stringify(cell)}`);
    expect(cell.queued).toBe(3);
    expect(cell.tokens).toBe(3);
  });

  it('L4 — the window slides: 23 h 59 min after three, still no; 24 h + 1 s after, one more', async () => {
    const list = lists.one!;
    const a = address('l4');
    for (let i = 0; i < 3; i++) expect((await subscribe(list.id, a)).status).toBe(202);
    const afterThree = await confirmations(a, list.name);
    // The clock is moved by rewriting the stored send times, not by waiting.
    const key = limitKey(list.id, a);
    const shift = async (ago: number) => {
      const members = await redis.zrange(key, 0, -1);
      for (const m of members) await redis.zadd(key, 'XX', Date.now() - ago, m);
      return members.length;
    };
    const stored = await shift(DAY_MS - 60_000);
    const early = await subscribe(list.id, a);
    const at2359 = await confirmations(a, list.name);
    await shift(DAY_MS + 1_000);
    const late = await subscribe(list.id, a);
    const after24h = await confirmations(a, list.name);
    const cell = {
      afterThree,
      storedTimes: stored,
      at2359,
      after24h,
      statuses: [early.status, late.status],
      messages: [message(early.body), message(late.body)],
      clock: 'ZADD XX of every stored time to now − (24 h − 60 s), then to now − (24 h + 1 s)',
    };
    cells.L4 = cell;
    console.log(`[z170] L4: ${JSON.stringify(cell)}`);
    expect(cell.afterThree).toBe(3);
    expect(cell.statuses).toEqual([202, 202]);
    expect(cell.at2359, '23 h 59 min after three, a fourth went').toBe(3);
    expect(cell.after24h, '24 h + 1 s after three, the next did not go').toBe(4);
  });

  it('L5 — five at once: at most three', async () => {
    const list = lists.one!;
    const a = address('l5');
    const answers = await Promise.all(Array.from({ length: 5 }, () => subscribe(list.id, a)));
    const cell = {
      statuses: answers.map((r) => r.status),
      messages: [...new Set(answers.map((r) => message(r.body)))],
      queued: await confirmations(a, list.name),
      tokens: await tokens(a, list.id),
    };
    cells.L5 = cell;
    console.log(`[z170] L5: ${JSON.stringify(cell)}`);
    expect(cell.statuses).toEqual([202, 202, 202, 202, 202]);
    expect(cell.queued).toBe(3);
    expect(cell.tokens).toBe(3);
  });

  it('L6 — the address in capitals is the same address', async () => {
    const list = lists.one!;
    const a = address('l6');
    for (const e of [a, a, a.toUpperCase(), a.toUpperCase(), a.toUpperCase()])
      expect((await subscribe(list.id, e)).status).toBe(202);
    const cell = { queued: await confirmations(a, list.name), tokens: await tokens(a, list.id) };
    cells.L6 = cell;
    console.log(`[z170] L6: ${JSON.stringify(cell)}`);
    expect(cell.queued).toBe(3);
    expect(cell.tokens).toBe(3);
  });

  it('L7 — the limit keys hold no address: list id and keyed fingerprint, 24 h at most', async () => {
    const listIds = Object.values(lists).map((l) => l.id);
    const keys = (await scanKeys('doi:limit:*')).filter((k) =>
      listIds.some((id) => k.startsWith(`doi:limit:${id}:`)),
    );
    const ttl: number[] = [];
    for (const k of keys) ttl.push(await redis.pttl(k));
    const expected = [
      limitKey(lists.one!.id, address('l1')),
      limitKey(lists.two!.id, address('l1')),
      limitKey(lists.form!.id, address('lf')),
      limitKey(lists.one!.id, address('l3')),
      limitKey(lists.one!.id, address('l4')),
      limitKey(lists.one!.id, address('l5')),
      limitKey(lists.one!.id, address('l6')),
    ].sort();
    const cell = {
      keys: keys.map(scrub).sort(),
      withAddress: keys.filter((k) => k.includes('@') || k.includes(TAG) || k.includes(DOMAIN)),
      ttlMs: { min: Math.min(...ttl), max: Math.max(...ttl) },
    };
    cells.L7 = cell;
    console.log(`[z170] L7: ${JSON.stringify(cell)}`);
    expect(cell.withAddress).toEqual([]);
    expect(keys.sort()).toEqual(expected);
    for (const k of keys) expect(k).toMatch(/^doi:limit:[0-9a-f-]{36}:[0-9a-f]{64}$/);
    for (const t of ttl) {
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThanOrEqual(DAY_MS);
    }
  });
});

describe('the rows the erasure exception tells apart, and check-batch (Z170)', () => {
  const who = {
    erased: address('s1-erased'),
    manual: address('s1-manual'),
    both: address('s1-both'),
    graymail: address('s1-graymail'),
    hardBounce: address('s1-hb'),
    unsubscribe: address('s1-unsub'),
    clean: address('s1-clean'),
  };
  const phone = `+4207${String(10_000_000 + Math.floor(Math.random() * 89_999_999)).slice(0, 8)}`;

  async function rowsOf(email: string) {
    return rows<{
      reason: string;
      email_null: boolean;
      hash_null: boolean;
      notes: string | null;
    }>(sql`
      SELECT reason, email IS NULL AS email_null, email_hash IS NULL AS hash_null,
             split_part(coalesce(notes, ''), ':', 1) AS notes
      FROM suppressions
      WHERE org_id = ${org}::uuid
        AND (lower(email) = lower(${email}) OR email_hash = ${suppressionEmailHash(email)})
      ORDER BY reason, email_null
    `);
  }

  async function erase(email: string) {
    const c = (await asOwner('POST', '/api/v1/contacts', { email, firstName: 'Petra' })) as {
      data: { id: string };
    };
    await asOwner('POST', `/api/v1/contacts/${c.data.id}/anonymize`, {});
  }

  it('S1 — the rows each writer leaves: the erasure is the only one with a hash and no address', async () => {
    await erase(who.erased);
    await erase(who.both);
    await asOwner('POST', '/api/v1/suppressions', { email: who.manual, reason: 'manual' });
    await asOwner('POST', '/api/v1/suppressions', { email: who.both, reason: 'manual' });
    await asOwner('POST', '/api/v1/suppressions', { email: who.hardBounce, reason: 'hard_bounce' });
    await asOwner('POST', '/api/v1/suppressions', {
      email: who.unsubscribe,
      reason: 'unsubscribe',
    });
    await asOwner('POST', '/api/v1/suppressions', { phone, reason: 'manual' });
    // Graymail: a contact 30 days old with 25 sends and no engagement is
    // classified dormant and suppressed by the sweep route.
    const [g] = await rows<{ id: string }>(sql`
      INSERT INTO contacts (org_id, email, status, created_at)
      VALUES (${org}::uuid, ${who.graymail}, 'active', now() - interval '30 days')
      RETURNING id
    `);
    await db.execute(sql`
      INSERT INTO contact_engagement (contact_id, org_id, total_sends)
      VALUES (${g!.id}::uuid, ${org}::uuid, 25)
    `);
    const sweep = (await asOwner('POST', '/api/v1/deliverability/graymail/sweep')) as {
      data: Record<string, unknown>;
    };

    const byPath = {
      gdprErasure: await rowsOf(who.erased),
      postSuppressionsManual: await rowsOf(who.manual),
      graymail: await rowsOf(who.graymail),
      erasurePlusManual: await rowsOf(who.both),
      postSuppressionsPhoneOnly: await rows<Record<string, unknown>>(sql`
        SELECT reason, email IS NULL AS email_null, email_hash IS NULL AS hash_null
        FROM suppressions WHERE org_id = ${org}::uuid AND phone = ${phone}
      `),
    };
    // The whole database after this run of the suite so far: every row with a
    // hash and no address, by reason and by what its notes say it is.
    const everywhere = await rows<Record<string, unknown>>(sql`
      SELECT reason, (notes LIKE 'gdpr_anonymized:%') AS erasure_note, count(*)::int AS n
      FROM suppressions WHERE email IS NULL AND email_hash IS NOT NULL
      GROUP BY 1, 2 ORDER BY 1, 2
    `);
    const cell = { byPath, sweep: sweep.data, hashRowsInDatabase: everywhere };
    cells.S1 = cell;
    console.log(`[z170] S1: ${JSON.stringify(cell)}`);
    expect(byPath.gdprErasure).toEqual([
      { reason: 'manual', email_null: true, hash_null: false, notes: 'gdpr_anonymized' },
    ]);
    expect(byPath.postSuppressionsManual).toEqual([
      { reason: 'manual', email_null: false, hash_null: true, notes: '' },
    ]);
    expect(byPath.graymail).toEqual([
      { reason: 'manual', email_null: false, hash_null: true, notes: 'graymail' },
    ]);
    expect(byPath.postSuppressionsPhoneOnly).toEqual([
      { reason: 'manual', email_null: true, hash_null: true },
    ]);
    // hashRowsInDatabase is recorded, not asserted: it also holds what other
    // test files left, written by hand.
  });

  it('CB — check-batch per row: without exceptErasure every row counts as before', async () => {
    const ask = async (email: string, extra: Record<string, unknown>) => {
      const r = await inject('POST', '/api/v1/internal/suppressions/check-batch', INTERNAL, {
        orgId: org,
        emails: [email],
        ...extra,
      });
      expect(r.status, r.body).toBe(200);
      return (
        ((JSON.parse(r.body) as { data: { suppressed: string[] } }).data.suppressed ?? []).length >
        0
      );
    };
    const variants = {
      transactional: { reasons: TRANSACTIONAL },
      exceptErasure: { reasons: TRANSACTIONAL, exceptErasure: true },
      masterDoi: { reasons: TRANSACTIONAL.filter((r) => r !== 'manual') },
      everyReason: {},
    };
    const table: Record<string, Record<string, boolean>> = {};
    for (const [label, email] of Object.entries(who)) {
      table[label] = {};
      for (const [v, extra] of Object.entries(variants)) table[label]![v] = await ask(email, extra);
    }
    cells.CB = table;
    console.log(`[z170] CB: ${JSON.stringify(table)}`);
    // Unchanged on master and on the branch: no parameter, no change.
    const column = (v: string) =>
      Object.fromEntries(Object.entries(table).map(([k, r]) => [k, r[v]]));
    expect(column('transactional')).toEqual({
      erased: true,
      manual: true,
      both: true,
      graymail: true,
      hardBounce: true,
      unsubscribe: false,
      clean: false,
    });
    expect(column('everyReason')).toEqual({
      erased: true,
      manual: true,
      both: true,
      graymail: true,
      hardBounce: true,
      unsubscribe: true,
      clean: false,
    });
    // With the parameter, an ordinary 'manual' row still stops (on master the
    // parameter is not read, so this holds there too). Whether the erasure row
    // alone stops is the measured change: cells.CB.erased.exceptErasure.
    const withParam = column('exceptErasure');
    expect({ ...withParam, erased: undefined }).toEqual({
      erased: undefined,
      manual: true,
      both: true,
      graymail: true,
      hardBounce: true,
      unsubscribe: false,
      clean: false,
    });
  });

  it('C — check-batch: one statement, and its plan with the erasure condition', async () => {
    const seen: string[] = [];
    const stop = observeQueries((q) => seen.push(q.replace(/\s+/g, ' ')));
    try {
      await inject('POST', '/api/v1/internal/suppressions/check-batch', INTERNAL, {
        orgId: org,
        emails: [who.erased],
        reasons: TRANSACTIONAL,
        exceptErasure: true,
      });
    } finally {
      stop();
    }
    const statements = seen.filter((q) => /from "suppressions"/i.test(q));
    const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
    const base =
      `SELECT "email", "email_hash" FROM "suppressions" WHERE "org_id" = ${lit(org)} ` +
      `AND (lower("email") IN (lower(${lit(who.erased)})) OR "email_hash" IN (${lit(suppressionEmailHash(who.erased))}))`;
    const shapes = {
      master: `${base} AND "reason" IN ('hard_bounce','complaint','block','invalid_email')`,
      branch:
        `${base} AND "reason" IN ('hard_bounce','complaint','manual','block','invalid_email') ` +
        `AND NOT ("reason" = 'manual' AND "email" IS NULL AND "email_hash" IS NOT NULL)`,
    };
    const plans: Record<string, string[]> = {};
    for (const [k, q] of Object.entries(shapes)) {
      const plan = (await db.execute(
        sql.raw(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${q}`),
      )) as unknown as { 'QUERY PLAN': string }[];
      plans[k] = plan.map((r) => r['QUERY PLAN']);
    }

    // The Redis commands of one confirmation, as Redis saw them.
    const commands: string[] = [];
    let monitorError: string | null = null;
    try {
      const monitor = await redis.monitor();
      monitor.on('monitor', (_time: string, args: string[]) =>
        commands.push(String(args[0]).toLowerCase()),
      );
      await subscribe(lists.two!.id, address('c-redis'));
      await new Promise((r) => setTimeout(r, 300));
      monitor.disconnect();
    } catch (err) {
      monitorError = (err as Error).message;
    }
    const histogram: Record<string, number> = {};
    for (const c of commands) histogram[c] = (histogram[c] ?? 0) + 1;

    const cell = {
      statements: statements.map(scrub),
      plans,
      redisCommandsOfOneConfirmation: histogram,
      monitorError,
    };
    cells.C = cell;
    console.log(`[z170] C: ${JSON.stringify(cell)}`);
    expect(statements).toHaveLength(1);
  });
});

describe('the rate limit of the public subscribe route, recorded (Z170 Sonda 3)', () => {
  it('S3 — 105 requests from one address in a minute', async () => {
    const missing = randomUUID();
    const statuses: Record<string, number> = {};
    let limitHeader: string | null = null;
    for (let i = 0; i < 105; i++) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/lists/${missing}/subscribe`,
        payload: { email: address('s3') },
        remoteAddress: PROBE_IP,
      });
      statuses[res.statusCode] = (statuses[res.statusCode] ?? 0) + 1;
      limitHeader ??= (res.headers['x-ratelimit-limit'] as string | undefined) ?? null;
    }
    const cell = {
      statuses,
      limitHeader,
      note: 'a list id no list has; the limiter counts before the handler',
    };
    cells.S3 = cell;
    console.log(`[z170] S3: ${JSON.stringify(cell)}`);
    expect(Object.values(statuses).reduce((a, b) => a + b, 0)).toBe(105);
  });
});
