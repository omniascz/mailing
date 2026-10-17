/**
 * POST /lists/:id/contacts starts the welcome flow (`list_subscribe`) only
 * when it made a new membership (Z175, položka 6).
 *
 * ─── What was wrong (measured on master 1802269, Z174 P2) ────────────────────
 *
 * addContactToList inserted the row with ON CONFLICT DO NOTHING and fired
 * onListSubscribe whatever the insert did: a member who had unsubscribed from
 * the list (contact_lists.unsubscribed_at set), added again by an operator, got
 * the list's welcome flow, and so did a member already on the list.
 *
 * ─── What this file measures ─────────────────────────────────────────────────
 *
 * Through the real app (createTestApp, inject, the real database and Redis).
 * An organisation of this file (INSERT: the sign-up route makes a new user, not
 * a second org of the seed owner), its owner session from POST /me/orgs/switch,
 * a secret key of its own from POST /api-keys. Contacts, lists, members and the
 * flow through their routes; the recipient's unsubscribe from a list through
 * the preference centre (POST /p/center/:token). No worker runs here: what the
 * flow sends is walked in
 * apps/workers/src/integration/list-subscribe-new-membership-flow. Every member
 * is put on the list before the flow is activated, so a run counted is a run of
 * the re-add alone.
 *
 *   U  a member unsubscribed from the list, added again: 204, the row and its
 *      time unchanged, no run;
 *   R  the same member through POST /audiences/:id/contacts;
 *   A  a member already on the list, added again: 204, no run;
 *   N  a new member: a run, as before;
 *   P  a plain member removed (DELETE) and added again: a run, as before;
 *   Q  statements of one POST /lists/:id/contacts (U and N).
 *
 * Everything measured is printed as `Z175_API_CELLS_JSON …` chunks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import { redis } from '@forgemsg/shared/redis';
import { createTrackingToken } from '@forgemsg/shared';
import { createTestApp, login, SEED, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { observeQueries } from '../db/explain-guard.js';

const TAG = `z175-${randomUUID().slice(0, 8)}`;
const DOMAIN = `${TAG}.test`;
const octet = () => 1 + Math.floor(Math.random() * 250);
// This file's own address: its own rate-limit buckets.
const IP = `100.64.175.${octet()}`;

let app: FastifyInstance;
let seedSession: Session;
let seedOrgId = '';
let org = '';
let owner: Record<string, string> = {};
let key: Record<string, string> = {};
let seedBefore: Record<string, unknown> = {};
const rawKeys: string[] = [];
const report: Record<string, unknown> = {
  tag: TAG,
  mock: 'none — the real app, database and Redis; no worker runs in this process',
};
const cells: Record<string, unknown> = {};
let n = 0;

const rows = async <T>(q: SQL) => (await db.execute(q)) as unknown as T[];
const address = (label: string) => `${label}-${n++}-${TAG}@${DOMAIN}`;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Windows this file waited out on a 429 — the limit is honoured, not lifted. */
const rateLimitWaits: { url: string; retryAfterS: number }[] = [];

interface Res {
  status: number;
  body: string;
}

async function inject(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<Res> {
  for (let attempt = 0; ; attempt++) {
    const res = await app.inject({
      method: method as 'POST',
      url,
      headers,
      remoteAddress: IP,
      ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
    });
    if (res.statusCode === 429 && attempt < 3) {
      const retryAfterS = Number(res.headers['retry-after'] ?? 60);
      rateLimitWaits.push({
        url: url.split('?')[0]!.replace(/[0-9a-f-]{36}/g, ':id'),
        retryAfterS,
      });
      await new Promise((r) => setTimeout(r, (retryAfterS + 1) * 1000));
      continue;
    }
    return { status: res.statusCode, body: res.body };
  }
}

async function asOwner(method: string, url: string, body?: unknown) {
  const r = await inject(method, url, owner, body);
  expect(r.status, `${method} ${url}: ${r.body}`).toBeLessThan(300);
  return (r.body ? JSON.parse(r.body) : {}) as { data: Record<string, unknown> & { id: string } };
}

/** The seed org as a whole: this file must leave it exactly as it found it. */
async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await rows<Record<string, unknown>>(sql`
    SELECT (SELECT count(*)::int FROM contacts WHERE org_id = ${seedOrgId}::uuid) AS contacts,
           (SELECT count(*)::int FROM contacts WHERE org_id = ${seedOrgId}::uuid AND deleted_at IS NOT NULL) AS contacts_deleted,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId}::uuid) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId}::uuid AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM lists WHERE org_id = ${seedOrgId}::uuid) AS lists,
           (SELECT count(*)::int FROM contact_lists cl JOIN contacts c ON c.id = cl.contact_id WHERE c.org_id = ${seedOrgId}::uuid) AS memberships,
           (SELECT count(*)::int FROM workflows WHERE org_id = ${seedOrgId}::uuid) AS workflows,
           (SELECT count(*)::int FROM workflow_runs WHERE org_id = ${seedOrgId}::uuid) AS workflow_runs,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${seedOrgId}::uuid) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${seedOrgId}::uuid) AS api_keys
  `);
  return r!;
}

async function contact(label: string): Promise<{ id: string; email: string }> {
  const email = address(label);
  const b = await asOwner('POST', '/api/v1/contacts', { email, firstName: 'Petra' });
  return { id: b.data.id, email };
}

const onList = (listId: string, contactId: string) =>
  inject('POST', `/api/v1/lists/${listId}/contacts`, owner, { contactId });

/** The recipient's own per-list unsubscribe: the preference centre. */
async function prefCentre(contactId: string, body: Record<string, unknown>) {
  const t = createTrackingToken({
    type: 'pref',
    orgId: org,
    contactId,
    ts: Math.floor(Date.now() / 1000),
  });
  return inject('POST', `/p/center/${t}`, {}, body);
}

/** The member's row on the list: 'no row', or its unsubscribed_at as text ('NULL' when open). */
async function rowOf(contactId: string, listId: string): Promise<string> {
  const [r] = await rows<{ at: string | null }>(sql`
    SELECT unsubscribed_at::text AS at FROM contact_lists
    WHERE contact_id = ${contactId}::uuid AND list_id = ${listId}::uuid
  `);
  return r ? (r.at ?? 'NULL') : 'no row';
}

async function runCount(workflowId: string, contactId: string): Promise<number> {
  const [r] = await rows<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM workflow_runs
    WHERE workflow_id = ${workflowId}::uuid AND contact_id = ${contactId}::uuid
  `);
  return r!.n;
}

/** Runs after the trigger (fired once the route answered) had its chance: up to 6 s for one. */
async function settledRuns(workflowId: string, contactId: string): Promise<number> {
  for (const deadline = Date.now() + 6_000; Date.now() < deadline; ) {
    if ((await runCount(workflowId, contactId)) > 0) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  await new Promise((r) => setTimeout(r, 1_000));
  return runCount(workflowId, contactId);
}

async function contactCount(listId: string): Promise<number> {
  const [r] = await rows<{ n: number }>(sql`
    SELECT contact_count::int AS n FROM lists WHERE id = ${listId}::uuid
  `);
  return r!.n;
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  seedSession = await login(app);
  seedOrgId = seedSession.orgId;
  seedBefore = await seedState();

  const [o] = await rows<{ id: string }>(sql`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`${TAG} org`}, ${TAG}, 'production', 'Obchod z175 s.r.o.', 'Nádražní 1, 110 00 Praha')
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
  const ownerToken = (JSON.parse(r.body) as { data: { token: string } }).data.token;
  owner = bearer(ownerToken);
  // The session's own rate-limit bucket is removed with the key's at the end.
  rawKeys.push(ownerToken);
  const k = (await asOwner('POST', '/api/v1/api-keys', { name: `${TAG} secret` })) as unknown as {
    data: { rawKey: string };
  };
  key = { 'x-api-key': k.data.rawKey };
  rawKeys.push(k.data.rawKey);
}, 120_000);

afterAll(async () => {
  let limitKeysRemoved = 0;
  const digests = rawKeys.map((k) => createHash('sha256').update(k).digest('hex').slice(0, 32));
  for (const d of digests) {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `*${d}*`, 'COUNT', 1000);
      cursor = next;
      for (const k of keys) {
        await redis.del(k);
        limitKeysRemoved++;
      }
    } while (cursor !== '0');
  }
  if (org) {
    await db.execute(sql`DELETE FROM consent_events WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM workflow_runs WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM workflow_events WHERE org_id = ${org}::uuid`);
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
           (SELECT count(*)::int FROM workflows WHERE org_id = ${org}::uuid) AS workflows,
           (SELECT count(*)::int FROM workflow_runs WHERE org_id = ${org}::uuid) AS workflow_runs,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${org}::uuid) AS api_keys,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${org}::uuid) AS members
  `);
  const seedAfter = await seedState();
  report.cells = cells;
  report.leftover = { ...left, limitKeysRemoved };
  report.rateLimitWaits = rateLimitWaits;
  report.seedOrg = { before: seedBefore, after: seedAfter };
  const all = JSON.stringify(report);
  const parts = Math.ceil(all.length / 3000);
  for (let i = 0; i < parts; i++)
    console.log(
      `Z175_API_CELLS_JSON ${String(i).padStart(4, '0')}/${parts} ${all.slice(i * 3000, (i + 1) * 3000)}`,
    );
  await app?.close();
  expect(left, 'what this file made was not all removed').toEqual({
    orgs: 0,
    contacts: 0,
    suppressions: 0,
    lists: 0,
    workflows: 0,
    workflow_runs: 0,
    api_keys: 0,
    members: 0,
  });
  expect(seedAfter, 'the seed organisation changed').toEqual(seedBefore);
}, 300_000);

describe('list_subscribe — POST /lists/:id/contacts starts the welcome only for a new membership', () => {
  const got: Record<string, Record<string, unknown>> = {};
  let L = '';
  let F = '';

  beforeAll(async () => {
    L = (await asOwner('POST', '/api/v1/lists', { name: `${TAG} L` })).data.id;
    const wf = await asOwner('POST', '/api/v1/workflows', {
      name: `${TAG} welcome`,
      triggerType: 'list_subscribe',
      triggerConfig: { listId: L },
      nodes: [
        { id: 'trigger', type: 'trigger', config: {} },
        { id: 'tag', type: 'add_tag', config: { tagName: `${TAG}-welcomed` } },
      ],
      edges: [{ id: 'e1', source: 'trigger', target: 'tag' }],
    });
    F = wf.data.id;

    // Members made before the flow is active: no run of F exists for any of them.
    const people: Record<string, { id: string; email: string }> = {};
    for (const k of ['u', 'r', 'a', 'p', 'qu']) {
      people[k] = await contact(k);
      expect((await onList(L, people[k]!.id)).status).toBe(204);
    }
    for (const k of ['u', 'r', 'qu']) {
      const c = await prefCentre(people[k]!.id, { unsubscribeFromLists: [L] });
      got[k] = { centre: c.status };
    }
    for (const [k, c] of Object.entries(people))
      got[k] = { ...(got[k] ?? {}), rowBefore: await rowOf(c.id, L) };
    await asOwner('POST', `/api/v1/workflows/${F}/activate`, {});

    const step = async (k: string, act: () => Promise<Res>) => {
      const c = people[k]!;
      const countBefore = await contactCount(L);
      const r = await act();
      got[k] = {
        ...got[k],
        answer: r.status,
        body: r.body.replace(/[0-9a-f-]{36}/g, '<uuid>').slice(0, 160),
        rowAfter: await rowOf(c.id, L),
        runs: await settledRuns(F, c.id),
        contactCount: `${countBefore} → ${await contactCount(L)}`,
      };
    };
    await step('u', () => onList(L, people.u!.id));
    await step('r', () =>
      inject('POST', `/api/v1/audiences/${L}/contacts`, key, { email: people.r!.email }),
    );
    await step('a', () => onList(L, people.a!.id));
    people.n = await contact('n');
    got.n = { rowBefore: await rowOf(people.n.id, L) };
    await step('n', () => onList(L, people.n!.id));
    {
      const d = await inject('DELETE', `/api/v1/lists/${L}/contacts/${people.p!.id}`, owner);
      got.p = { ...got.p, delete: d.status, rowAfterDelete: await rowOf(people.p!.id, L) };
    }
    await step('p', () => onList(L, people.p!.id));

    // Q: statements of one POST (from the request to 2 s after, the trigger included).
    const counted = async (contactId: string) => {
      const seen: string[] = [];
      const stop = observeQueries((q) => seen.push(q.replace(/\s+/g, ' ').slice(0, 140)));
      let answer = 0;
      let atAnswer = 0;
      try {
        answer = (await onList(L, contactId)).status;
        atAnswer = seen.length;
        await new Promise((r) => setTimeout(r, 2_000));
      } finally {
        stop();
      }
      return { answer, atAnswer, total: seen.length, list: seen };
    };
    people.qn = await contact('qn');
    cells.Q = {
      'U (row SET, re-add)': await counted(people.qu!.id),
      'N (new member)': await counted(people.qn.id),
    };
    await asOwner('POST', `/api/v1/workflows/${F}/deactivate`, {});
    cells.L = got;
  }, 300_000);

  it('U: a member unsubscribed from the list, added again — 204, the row and its time unchanged, no run', () => {
    expect(got.u!.centre).toBe(200);
    expect(got.u!.rowBefore).not.toMatch(/^(NULL|no row)$/);
    expect(got.u).toMatchObject({ answer: 204, body: '', rowAfter: got.u!.rowBefore, runs: 0 });
  });

  it('R: the same member through POST /audiences/:id/contacts — the row unchanged, no run', () => {
    expect(got.r!.rowBefore).not.toMatch(/^(NULL|no row)$/);
    expect(got.r).toMatchObject({ rowAfter: got.r!.rowBefore, runs: 0 });
  });

  it('A: a member already on the list, added again — 204, no run', () => {
    expect(got.a).toMatchObject({
      rowBefore: 'NULL',
      answer: 204,
      body: '',
      rowAfter: 'NULL',
      runs: 0,
    });
  });

  it('N: a new member — 204, one run, as before', () => {
    expect(got.n).toMatchObject({
      rowBefore: 'no row',
      answer: 204,
      body: '',
      rowAfter: 'NULL',
      runs: 1,
    });
  });

  it('P: a plain member removed and added again — one run, as before', () => {
    expect(got.p).toMatchObject({
      rowBefore: 'NULL',
      delete: 204,
      rowAfterDelete: 'no row',
      answer: 204,
      rowAfter: 'NULL',
      runs: 1,
    });
  });
});
