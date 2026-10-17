/**
 * A merge of contacts does not bring back a refusal, and taking a contact off
 * a list does not delete their unsubscribe from it (Z174, položka 6).
 *
 * ─── What was wrong (measured on master 1802269, Z173) ───────────────────────
 *
 * POST /identity-graph/merge and POST /duplicates/merge left the winner its
 * own status: an active winner merged with an unsubscribed, complained or
 * pending loser stayed active (54/54), and the loser's unsubscribe from a list
 * (contact_lists.unsubscribed_at) was not carried to the winner's membership
 * of that list (54/54). identity-graph/merge with a winner without an address
 * answered 409 but had already moved the loser's signals. DELETE
 * /lists/:id/contacts/:contactId deleted the row that held the unsubscribe, so
 * POST /lists/:id/contacts or a signup form put the member back with none.
 *
 * ─── What this file measures ─────────────────────────────────────────────────
 *
 * Through the real app (createTestApp, inject, the real database and Redis).
 * An organisation of this file (INSERT: the sign-up route makes a new user, not
 * a second org of the seed owner), its owner session from POST /me/orgs/switch,
 * a secret key of its own from POST /api-keys. Statuses with POST /contacts
 * {status}, unsubscribe rows with POST /suppressions, archives with POST
 * /contacts/:id/archive, an archive with archived_from NULL with POST
 * /contacts {status: 'archived'}, per-list unsubscribes with the recipient's
 * preference centre (POST /p/center/:token), signals with POST
 * /identity-graph/ingest, lists, members and forms through their routes. The
 * verified sending domain is INSERTed (DNS cannot be verified in CI). No worker
 * runs here: what the campaigns and flows send is walked in
 * apps/workers/src/integration/merge-no-resurrection-flow, together with the
 * merges across organisations (O), whose e-mail events only a campaign makes.
 *
 *   M   the loser is stricter than the winner (no bounce): the winner's status
 *       becomes the strictest, both routes;
 *   B   a bounce (or an archive of one) is not carried; a bounced winner stays;
 *   M0  the loser is as strict or less: the winner as before;
 *   LU  the loser's unsubscribe from a list is carried to the winner's row;
 *   AT  a merge that fails on the one-address index writes nothing;
 *   L   DELETE / re-add / form / preference centre on a list row with and
 *       without unsubscribed_at;
 *   N   statements of one merge.
 *
 * Everything measured is printed once as `Z174_API_CELLS_JSON {…}`.
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

const TAG = `z174-${randomUUID().slice(0, 8)}`;
const DOMAIN = `${TAG}.test`;
const octet = () => 1 + Math.floor(Math.random() * 250);
// This file's own address: its own rate-limit buckets.
const IP = `100.64.174.${octet()}`;

let app: FastifyInstance;
let seedSession: Session;
let seedOrgId = '';
let org = '';
let owner: Record<string, string> = {};
let secretKey = '';
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
           (SELECT count(*)::int FROM identity_signals WHERE org_id = ${seedOrgId}::uuid) AS signals,
           (SELECT count(*)::int FROM identity_merges WHERE org_id = ${seedOrgId}::uuid) AS merges,
           (SELECT count(*)::int FROM email_events WHERE org_id = ${seedOrgId}::uuid) AS email_events,
           (SELECT count(*)::int FROM signup_forms WHERE org_id = ${seedOrgId}::uuid) AS forms,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${seedOrgId}::uuid) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${seedOrgId}::uuid) AS api_keys
  `);
  return r!;
}

type Kind =
  | 'active'
  | 'active_phone'
  | 'non_subscribed'
  | 'pending'
  | 'bounced'
  | 'unsubscribed'
  | 'unsub_row'
  | 'complained'
  | 'archived_unsub'
  | 'archived_active'
  | 'archived_bounced'
  | 'archived_null';

interface C {
  id: string;
  email: string | null;
  kind: Kind;
}

/** A contact of this org in `kind`, made by the routes. */
async function contact(label: string, kind: Kind): Promise<C> {
  const email = kind === 'active_phone' ? null : address(label);
  const status: Record<Kind, string | undefined> = {
    active: undefined,
    active_phone: undefined,
    non_subscribed: 'non_subscribed',
    pending: 'pending',
    bounced: 'bounced',
    unsubscribed: 'unsubscribed',
    unsub_row: 'unsubscribed',
    complained: 'complained',
    archived_unsub: 'unsubscribed',
    archived_active: undefined,
    archived_bounced: 'bounced',
    archived_null: 'archived',
  };
  const b = await asOwner('POST', '/api/v1/contacts', {
    ...(email ? { email } : {}),
    phone: `+4207${String(10_000_000 + Math.floor(Math.random() * 89_999_999))}`,
    firstName: 'Petra',
    ...(status[kind] ? { status: status[kind] } : {}),
  });
  const id = b.data.id;
  if (kind === 'unsub_row')
    await asOwner('POST', '/api/v1/suppressions', { email, reason: 'unsubscribe' });
  if (kind === 'archived_unsub' || kind === 'archived_active' || kind === 'archived_bounced')
    await asOwner('POST', `/api/v1/contacts/${id}/archive`, {});
  return { id, email, kind };
}

async function newList(name: string): Promise<string> {
  return (await asOwner('POST', '/api/v1/lists', { name: `${TAG} ${name}` })).data.id;
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

interface Row {
  status: string;
  archived_from: string | null;
  email: string | null;
  deleted: boolean;
}
async function row(id: string): Promise<Row | null> {
  const [r] = await rows<Row>(sql`
    SELECT status::text AS status, archived_from::text AS archived_from, email,
           deleted_at IS NOT NULL AS deleted
    FROM contacts WHERE id = ${id}::uuid
  `);
  return r ?? null;
}

async function membership(contactId: string, listId: string) {
  const [r] = await rows<{ at: string | null }>(sql`
    SELECT unsubscribed_at::text AS at FROM contact_lists
    WHERE contact_id = ${contactId}::uuid AND list_id = ${listId}::uuid
  `);
  return r ? (r.at ? 'unsubscribed_at SET' : 'unsubscribed_at NULL') : 'no row';
}

async function unsubscribedAt(contactId: string, listId: string): Promise<string | null> {
  const [r] = await rows<{ at: string | null }>(sql`
    SELECT unsubscribed_at::text AS at FROM contact_lists
    WHERE contact_id = ${contactId}::uuid AND list_id = ${listId}::uuid
  `);
  return r?.at ?? null;
}

async function signalsOf(contactId: string): Promise<number> {
  const [r] = await rows<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM identity_signals WHERE contact_id = ${contactId}::uuid
  `);
  return r!.n;
}

async function mergesOf(loserId: string): Promise<number> {
  const [r] = await rows<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM identity_merges WHERE loser_contact_id = ${loserId}::uuid
  `);
  return r!.n;
}

type Route = 'identity-graph' | 'duplicates';
const ROUTES: Route[] = ['identity-graph', 'duplicates'];

function merge(route: Route, winnerId: string, loserIds: string[]) {
  return route === 'identity-graph'
    ? inject('POST', '/api/v1/identity-graph/merge', owner, {
        winnerContactId: winnerId,
        loserContactId: loserIds[0],
      })
    : inject('POST', '/api/v1/duplicates/merge', owner, {
        primaryId: winnerId,
        duplicateIds: loserIds,
      });
}

interface MergeCell {
  winner: Kind;
  loser: Kind;
  answer: string;
  before: Row | null;
  winnerAfter: Row | null;
  loserAfter: Row | null;
}

async function mergeCell(route: Route, w: Kind, l: Kind): Promise<MergeCell> {
  const label = `${route === 'identity-graph' ? 'ig' : 'dp'}-${w}-${l}`.replace(/_/g, '');
  const win = await contact(`${label}-w`, w);
  const los = await contact(`${label}-l`, l);
  const before = await row(win.id);
  const m = await merge(route, win.id, [los.id]);
  return {
    winner: w,
    loser: l,
    answer: `${m.status} ${m.body.slice(0, 120)}`,
    before,
    winnerAfter: await row(win.id),
    loserAfter: await row(los.id),
  };
}

const short = (r: Row | null) =>
  r ? `${r.status}${r.status === 'archived' ? `(${r.archived_from})` : ''}` : 'none';

/** Z174: the winner takes the strictest — [winner, loser, winner after]. */
const M: [Kind, Kind, string][] = [
  ['active', 'non_subscribed', 'non_subscribed'],
  ['active', 'pending', 'pending'],
  ['active', 'unsubscribed', 'unsubscribed'],
  ['active', 'unsub_row', 'unsubscribed'],
  ['active', 'complained', 'complained'],
  ['active', 'archived_unsub', 'unsubscribed'],
  ['non_subscribed', 'pending', 'pending'],
  ['non_subscribed', 'unsubscribed', 'unsubscribed'],
  ['non_subscribed', 'complained', 'complained'],
  ['pending', 'unsubscribed', 'unsubscribed'],
  ['unsubscribed', 'complained', 'complained'],
  ['archived_active', 'unsubscribed', 'archived(unsubscribed)'],
  ['archived_null', 'complained', 'archived(complained)'],
];
/** A bounce is not carried; a bounced winner stays — as on master. */
const B: [Kind, Kind, string][] = [
  ['active', 'bounced', 'active'],
  ['active', 'archived_bounced', 'active'],
  ['bounced', 'unsubscribed', 'bounced'],
  ['archived_bounced', 'unsubscribed', 'archived(bounced)'],
];
/** The loser is as strict or less: as on master. */
const M0: [Kind, Kind, string][] = [
  ['active', 'active', 'active'],
  ['active', 'archived_active', 'active'],
  ['active', 'archived_null', 'active'],
  ['non_subscribed', 'active', 'non_subscribed'],
  ['unsubscribed', 'pending', 'unsubscribed'],
  ['complained', 'unsubscribed', 'complained'],
];

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  seedSession = await login(app);
  seedOrgId = seedSession.orgId;
  seedBefore = await seedState();

  const [o] = await rows<{ id: string }>(sql`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`${TAG} org`}, ${TAG}, 'production', 'Obchod z174 s.r.o.', 'Nádražní 1, 110 00 Praha')
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
  await db.execute(sql`
    INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
    VALUES (${org}::uuid, ${DOMAIN}, 'fm1', true, true, true, true)
  `);
  const k = (await asOwner('POST', '/api/v1/api-keys', { name: `${TAG} secret` })) as unknown as {
    data: { rawKey: string };
  };
  secretKey = k.data.rawKey;
  rawKeys.push(secretKey);
}, 120_000);

afterAll(async () => {
  let limitKeysRemoved = 0;
  const digests = rawKeys.map((key) => createHash('sha256').update(key).digest('hex').slice(0, 32));
  for (const d of digests) {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `*${d}*`, 'COUNT', 1000);
      cursor = next;
      for (const key of keys) {
        await redis.del(key);
        limitKeysRemoved++;
      }
    } while (cursor !== '0');
  }
  if (org) {
    await db.execute(sql`DELETE FROM consent_events WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM email_events WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM workflow_runs WHERE org_id = ${org}::uuid`);
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
           (SELECT count(*)::int FROM identity_signals WHERE org_id = ${org}::uuid) AS signals,
           (SELECT count(*)::int FROM identity_merges WHERE org_id = ${org}::uuid) AS merges,
           (SELECT count(*)::int FROM signup_forms WHERE org_id = ${org}::uuid) AS forms,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${org}::uuid) AS api_keys,
           (SELECT count(*)::int FROM sending_domains WHERE org_id = ${org}::uuid) AS domains,
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
      `Z174_API_CELLS_JSON ${String(i).padStart(4, '0')}/${parts} ${all.slice(i * 3000, (i + 1) * 3000)}`,
    );
  await app?.close();
  expect(left, 'what this file made was not all removed').toEqual({
    orgs: 0,
    contacts: 0,
    suppressions: 0,
    lists: 0,
    signals: 0,
    merges: 0,
    forms: 0,
    api_keys: 0,
    domains: 0,
    members: 0,
  });
  expect(seedAfter, 'the seed organisation changed').toEqual(seedBefore);
}, 300_000);

describe('M / B / M0 — the status of the winner', () => {
  for (const route of ROUTES) {
    it(`M ${route}: the winner takes the strictest status of the loser`, async () => {
      const out: MergeCell[] = [];
      for (const [w, l] of M) out.push(await mergeCell(route, w, l));
      cells[`M ${route}`] = out;
      for (const [i, [w, l, after]] of M.entries()) {
        expect(out[i]!.answer, `${w} ← ${l}`).toMatch(/^200 /);
        expect(short(out[i]!.winnerAfter), `${w} ← ${l}`).toBe(after);
        expect(out[i]!.loserAfter?.deleted, `${w} ← ${l}: loser deleted`).toBe(true);
      }
    }, 600_000);

    it(`B ${route}: a bounce is not carried, a bounced winner stays bounced`, async () => {
      const out: MergeCell[] = [];
      for (const [w, l] of B) out.push(await mergeCell(route, w, l));
      cells[`B ${route}`] = out;
      for (const [i, [w, l, after]] of B.entries()) {
        expect(out[i]!.answer, `${w} ← ${l}`).toMatch(/^200 /);
        expect(short(out[i]!.winnerAfter), `${w} ← ${l}`).toBe(after);
      }
    }, 600_000);

    it(`M0 ${route}: a loser as strict or less leaves the winner as it was`, async () => {
      const out: MergeCell[] = [];
      for (const [w, l] of M0) out.push(await mergeCell(route, w, l));
      cells[`M0 ${route}`] = out;
      // archived with archived_from NULL made by POST /contacts {status: 'archived'}
      cells[`M0 ${route} archived_from NULL losers`] = out.filter(
        (c) => c.loser === 'archived_null',
      ).length;
      for (const [i, [w, l, after]] of M0.entries()) {
        expect(out[i]!.answer, `${w} ← ${l}`).toMatch(/^200 /);
        expect(short(out[i]!.winnerAfter), `${w} ← ${l}`).toBe(after);
        expect(short(out[i]!.winnerAfter), `${w} ← ${l}: unchanged`).toBe(short(out[i]!.before));
      }
    }, 600_000);
  }
});

describe('LU — the loser’s unsubscribe from a list', () => {
  for (const route of ROUTES) {
    it(`LU ${route}: carried to the winner's row of the same list, nothing added elsewhere`, async () => {
      const LU = await newList(`LU ${route}`);
      const LX = await newList(`LX ${route}`);
      const win = await contact(`lu-${route}-w`, 'active');
      const los = await contact(`lu-${route}-l`, 'active');
      expect((await onList(LU, win.id)).status).toBe(204);
      expect((await onList(LU, los.id)).status).toBe(204);
      expect((await onList(LX, los.id)).status).toBe(204);
      const p1 = await prefCentre(los.id, { unsubscribeFromLists: [LU, LX] });
      const loserAt = await unsubscribedAt(los.id, LU);
      // A winner already unsubscribed from a list keeps its own time.
      const win2 = await contact(`lu-${route}-w2`, 'active');
      const los2 = await contact(`lu-${route}-l2`, 'active');
      for (const c of [win2, los2]) expect((await onList(LU, c.id)).status).toBe(204);
      await prefCentre(win2.id, { unsubscribeFromLists: [LU] });
      const ownAt = await unsubscribedAt(win2.id, LU);
      await prefCentre(los2.id, { unsubscribeFromLists: [LU] });

      const m1 = await merge(route, win.id, [los.id]);
      const m2 = await merge(route, win2.id, [los2.id]);
      const cell = {
        pref: p1.status,
        merge: [m1.status, m2.status],
        winnerLU: await membership(win.id, LU),
        winnerLUat: (await unsubscribedAt(win.id, LU)) === loserAt ? "the loser's time" : 'other',
        winnerLX: await membership(win.id, LX),
        loserLU: await membership(los.id, LU),
        loserLX: await membership(los.id, LX),
        winnerStatus: (await row(win.id))?.status,
        ownTimeKept: (await unsubscribedAt(win2.id, LU)) === ownAt,
      };
      cells[`LU ${route}`] = cell;
      expect(cell.merge).toEqual([200, 200]);
      expect(cell.winnerLU).toBe('unsubscribed_at SET');
      expect(cell.winnerLUat).toBe("the loser's time");
      // Not added to a list the winner was not on; the loser's rows stay.
      expect(cell.winnerLX).toBe('no row');
      expect(cell.loserLU).toBe('unsubscribed_at SET');
      expect(cell.loserLX).toBe('unsubscribed_at SET');
      expect(cell.winnerStatus).toBe('active');
      expect(cell.ownTimeKept).toBe(true);
    }, 300_000);
  }

  it('LU duplicates: of two losers unsubscribed from the list, the oldest time', async () => {
    const LU = await newList('LU two');
    const win = await contact('lu2-w', 'active');
    const a = await contact('lu2-a', 'active');
    const b = await contact('lu2-b', 'active');
    for (const c of [win, a, b]) expect((await onList(LU, c.id)).status).toBe(204);
    await prefCentre(a.id, { unsubscribeFromLists: [LU] });
    await new Promise((r) => setTimeout(r, 1100));
    await prefCentre(b.id, { unsubscribeFromLists: [LU] });
    const oldest = await unsubscribedAt(a.id, LU);
    const m = await merge('duplicates', win.id, [b.id, a.id]);
    const cell = { merge: m.status, oldest: (await unsubscribedAt(win.id, LU)) === oldest };
    cells['LU duplicates two losers'] = cell;
    expect(cell).toEqual({ merge: 200, oldest: true });
  }, 300_000);
});

describe('AT — a merge that fails writes nothing', () => {
  it('AT identity-graph/merge: a winner without an address and a loser with one → 409, the loser untouched', async () => {
    const win = await contact('at-w', 'active_phone');
    const los = await contact('at-l', 'pending');
    const sig = await inject('POST', '/api/v1/identity-graph/ingest', owner, {
      contactId: los.id,
      signals: [{ type: 'device_id', value: `dev-at-${TAG}` }],
    });
    const m = await merge('identity-graph', win.id, [los.id]);
    const cell = {
      signal: sig.status,
      merge: `${m.status} ${m.body.slice(0, 80)}`,
      loserSignals: await signalsOf(los.id),
      winnerSignals: await signalsOf(win.id),
      loser: await row(los.id),
      winner: await row(win.id),
      identityMerges: await mergesOf(los.id),
    };
    cells['AT identity-graph/merge'] = cell;
    expect(cell.signal).toBe(201);
    expect(cell.merge).toMatch(/^409 /);
    expect(cell.loserSignals).toBe(1);
    expect(cell.winnerSignals).toBe(0);
    expect(cell.loser).toMatchObject({ status: 'pending', deleted: false });
    expect(cell.winner).toMatchObject({ status: 'active', email: null, deleted: false });
    expect(cell.identityMerges).toBe(0);
  }, 120_000);

  it('AT identity-graph/ingest: the automatic merge fails the same way and moves no signal', async () => {
    const a = await contact('at2-a', 'active_phone');
    const b = await contact('at2-b', 'pending');
    const va = `uid-at2-${TAG}`;
    const vb = `dev-at2-${TAG}`;
    await inject('POST', '/api/v1/identity-graph/ingest', owner, {
      contactId: a.id,
      signals: [{ type: 'user_id', value: va }],
    });
    await inject('POST', '/api/v1/identity-graph/ingest', owner, {
      contactId: b.id,
      signals: [{ type: 'device_id', value: vb }],
    });
    const m = await inject('POST', '/api/v1/identity-graph/ingest', owner, {
      signals: [
        { type: 'user_id', value: va },
        { type: 'device_id', value: vb },
      ],
    });
    const cell = {
      merge: `${m.status} ${m.body.slice(0, 80)}`,
      aSignals: await signalsOf(a.id),
      bSignals: await signalsOf(b.id),
      b: await row(b.id),
      identityMerges: await mergesOf(b.id),
    };
    cells['AT identity-graph/ingest'] = cell;
    expect(cell.merge).toMatch(/^409 /);
    expect(cell.aSignals).toBe(1);
    expect(cell.bSignals).toBe(1);
    expect(cell.b).toMatchObject({ status: 'pending', deleted: false });
    expect(cell.identityMerges).toBe(0);
  }, 120_000);
});

describe('L — a list row with the recipient’s unsubscribe', () => {
  it('L DELETE keeps a row with unsubscribed_at (204), re-adding does not reopen it; a plain row is deleted', async () => {
    const L1 = await newList('L1');
    const mk = async (label: string, unsub: boolean) => {
      const c = await contact(`l-${label}`, 'active');
      expect((await onList(L1, c.id)).status).toBe(204);
      if (unsub) expect((await prefCentre(c.id, { unsubscribeFromLists: [L1] })).status).toBe(200);
      return c;
    };
    const del = (id: string) => inject('DELETE', `/api/v1/lists/${L1}/contacts/${id}`, owner);

    const a = await mk('a', true);
    const at = await unsubscribedAt(a.id, L1);
    const dA = await del(a.id);
    const afterDelete = await membership(a.id, L1);
    const pA = await onList(L1, a.id);
    const plain = await mk('plain', false);
    const dP = await del(plain.id);

    const form = (await asOwner('POST', '/api/v1/signup-forms', {
      name: `${TAG} form`,
      listId: L1,
      fields: [{ name: 'email', label: 'E-mail', type: 'email', required: true }],
    })) as { data: { id: string } };
    const f = await mk('form', true);
    const dF = await del(f.id);
    const sF = await inject('POST', `/public/forms/${form.data.id}/submit`, {}, { email: f.email });

    const r = await mk('resub', true);
    const dR = await del(r.id);
    const pR = await prefCentre(r.id, { resubscribeToLists: [L1] });

    const cell = {
      a: {
        delete: dA.status,
        body: dA.body,
        afterDelete,
        add: pA.status,
        after: await membership(a.id, L1),
        sameTime: (await unsubscribedAt(a.id, L1)) === at,
      },
      plain: { delete: dP.status, after: await membership(plain.id, L1) },
      form: { delete: dF.status, submit: sF.status, after: await membership(f.id, L1) },
      resubscribe: { delete: dR.status, centre: pR.status, after: await membership(r.id, L1) },
    };
    cells.L = cell;
    expect(cell.a).toEqual({
      delete: 204,
      body: '',
      afterDelete: 'unsubscribed_at SET',
      add: 204,
      after: 'unsubscribed_at SET',
      sameTime: true,
    });
    expect(cell.plain).toEqual({ delete: 204, after: 'no row' });
    expect(cell.form).toEqual({ delete: 204, submit: 200, after: 'unsubscribed_at SET' });
    // The recipient's own resubscribe still reopens the row (kontrola C).
    expect(cell.resubscribe).toEqual({ delete: 204, centre: 200, after: 'unsubscribed_at NULL' });
  }, 300_000);
});

describe('N — statements of one merge', () => {
  it('N identity-graph/merge and duplicates/merge, active ← unsubscribed with a list unsubscribe', async () => {
    const counted = async (route: Route) => {
      const L = await newList(`N ${route}`);
      const win = await contact(`n-${route}-w`, 'active');
      const los = await contact(`n-${route}-l`, 'unsubscribed');
      for (const c of [win, los]) await onList(L, c.id);
      await prefCentre(los.id, { unsubscribeFromLists: [L] });
      const seen: string[] = [];
      const stop = observeQueries((q) => seen.push(q.replace(/\s+/g, ' ').slice(0, 140)));
      let status = 0;
      try {
        status = (await merge(route, win.id, [los.id])).status;
      } finally {
        stop();
      }
      return { answer: status, statements: seen.length, list: seen };
    };
    const cell = {
      'identity-graph': await counted('identity-graph'),
      duplicates: await counted('duplicates'),
    };
    cells.N = cell;
    console.log(`[z174] N: ${JSON.stringify(cell)}`);
    expect(cell['identity-graph'].answer).toBe(200);
    expect(cell.duplicates.answer).toBe(200);
  }, 300_000);
});
