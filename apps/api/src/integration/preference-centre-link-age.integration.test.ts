/**
 * The preference-centre link brings a person back only while it is young —
 * the routes, rows, answers and the page (Z177, položka 7). The whole way to
 * the engine is walked in apps/workers/src/integration/preference-centre-link-age.
 *
 * ─── What was wrong (measured on master 6cce6f1, Z177 Sonda 2–6) ─────────────
 *
 * The pref token (`type:'pref'`, `ts` = when it was minted) never expired. A
 * link out of a year-old e-mail — forwarded, leaked, sitting in an archive —
 * lifted the recipient's own unsubscribe (globalResubscribe, the page's
 * "subscribe again" form) and reopened the lists they had left
 * (resubscribeToLists, the page's "save" form). The JSON body could also put
 * the contact on a live list of the organisation they had never been on, with
 * confirmed_at = now and no consent event. And the view-in-browser copy minted
 * a fresh pref token every time it was opened, so an old e-mail got round any
 * age limit through its "view in browser" link.
 *
 * ─── How it is measured ──────────────────────────────────────────────────────
 *
 * The real app (`buildApp` + `inject`), the real database and Redis, no worker.
 * An organisation of this file (INSERT), the owner session from POST
 * /me/orgs/switch, its contacts, lists and memberships through the routes.
 *
 * The old tokens are MINTED here with the same TRACKING_SECRET and exactly the
 * shape the batch sender signs ({type, orgId, contactId, ts}); only `ts` is set
 * back (31 days, 29 days) — time cannot be moved in CI, and a real e-mail is
 * always minutes old. The workers file checks that the shape is the one in the
 * e-mail.
 *
 *   O    an unsubscribed contact, a 31-day token: globalResubscribe (also: no
 *        `ts`, a string `ts`, a `ts` an hour ahead);
 *   OF   the same through the page's forms: "subscribe again", and "save" with
 *        the box of a list the contact left ticked;
 *   OL   a contact who left list L, a 31-day token: resubscribeToLists [L]; in
 *        the same request an unsubscribe from L2 is still carried out;
 *   N    a fresh token: resubscribeToLists [M], a live list the contact was
 *        never on;
 *   P    the page and the JSON view with a 31-day token, against a fresh one;
 *   V    the view-in-browser copy of a 31-day e-mail: the `ts` of its links;
 *   F    a fresh token: back globally and to L; B the same at 29 days;
 *   C    as before with a 31-day token: unsubscribe globally, from a list, by
 *        the form; the page and the JSON; the legacy /api/v1/preferences route.
 *
 * Everything measured is printed as `Z177_API_CELLS_JSON …` chunks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import { createTrackingToken, t, type TrackingPayload } from '@forgemsg/shared';
import { redis } from '@forgemsg/shared/redis';
import { login, SEED, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { generateUnsubscribeToken } from '../routes/v1/subscriptions.js';

const { buildApp } = await import('../index.js');

const TAG = `z177-${randomUUID().slice(0, 8)}`;
const DOMAIN = `${TAG}.test`;
const octet = () => 1 + Math.floor(Math.random() * 250);
// This file's own address: its own rate-limit buckets.
const IP = `100.64.177.${octet()}`;
const DAY = 86_400;
const PERSON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';
const AS_BROWSER = {
  accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
  'accept-language': 'cs',
  'user-agent': PERSON_UA,
};
const FORM = { ...AS_BROWSER, 'content-type': 'application/x-www-form-urlencoded' };
const EXPIRED_TEXT = t('preferences_page.resubscribe_link_expired', 'cs');

let app: FastifyInstance;
let seedSession: Session;
let seedOrgId = '';
let org = '';
let owner: Record<string, string> = {};
let seedBefore: Record<string, unknown> = {};
const rawKeys: string[] = [];
const legacyTokens: string[] = [];
const report: Record<string, unknown> = {
  tag: TAG,
  mock: 'none — the real app, database and Redis; no worker runs in this process',
  tokens:
    'old tokens are minted with the same secret and shape as the e-mail one; only ts is set back',
};
const cells: Record<string, unknown> = {};
let n = 0;
let L = '';
let L2 = '';
let M = '';

const rows = async <T>(q: SQL) => (await db.execute(q)) as unknown as T[];
const address = (label: string) => `${label}-${n++}-${TAG}@${DOMAIN}`;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const nowS = () => Math.floor(Date.now() / 1000);

/** Windows this file waited out on a 429 — the limit is honoured, not lifted. */
const rateLimitWaits: { url: string; retryAfterS: number }[] = [];

interface Res {
  status: number;
  body: string;
  location: string | null;
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
      ...(body === undefined
        ? {}
        : typeof body === 'string'
          ? { payload: body }
          : { payload: body as Record<string, unknown> }),
    });
    if (res.statusCode === 429 && attempt < 3) {
      const retryAfterS = Number(res.headers['retry-after'] ?? 60);
      rateLimitWaits.push({
        url: url.split('?')[0]!.replace(/\/p\/center\/[^/]+/, '/p/center/:token'),
        retryAfterS,
      });
      await new Promise((r) => setTimeout(r, (retryAfterS + 1) * 1000));
      continue;
    }
    const loc = res.headers['location'];
    return {
      status: res.statusCode,
      body: res.body,
      location: typeof loc === 'string' ? loc : null,
    };
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
           (SELECT count(*)::int FROM consent_events WHERE org_id = ${seedOrgId}::uuid) AS consent_events,
           (SELECT count(*)::int FROM campaigns WHERE org_id = ${seedOrgId}::uuid) AS campaigns,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${seedOrgId}::uuid) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${seedOrgId}::uuid) AS api_keys
  `);
  return r!;
}

async function newList(name: string): Promise<string> {
  return (await asOwner('POST', '/api/v1/lists', { name: `${TAG} ${name}` })).data.id;
}

interface Person {
  id: string;
  email: string;
}

/** An active contact on `listIds`, through the routes. */
async function person(label: string, listIds: string[]): Promise<Person> {
  const email = address(label);
  const c = await asOwner('POST', '/api/v1/contacts', { email, firstName: 'Petra' });
  for (const listId of listIds)
    await asOwner('POST', `/api/v1/lists/${listId}/contacts`, { contactId: c.data.id });
  return { id: c.data.id, email };
}

/** A pref token in the shape the batch sender signs, `ageS` seconds old. */
function prefToken(contactId: string, ageS = 0): string {
  return createTrackingToken({ type: 'pref', orgId: org, contactId, ts: nowS() - ageS });
}

/** The same token with a `ts` that is not a number of seconds, or none at all. */
function oddPrefToken(contactId: string, ts: 'none' | 'string'): string {
  const payload: Record<string, unknown> = { type: 'pref', orgId: org, contactId };
  if (ts === 'string') payload.ts = String(nowS());
  return createTrackingToken(payload as unknown as TrackingPayload);
}

const OLD = 31 * DAY;

function decode(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}

async function center(token: string, body: Record<string, unknown>) {
  const r = await inject('POST', `/p/center/${token}`, { 'user-agent': PERSON_UA }, body);
  return { status: r.status, data: r.status === 200 ? JSON.parse(r.body).data : r.body };
}

async function form(token: string, fields: [string, string][]) {
  const r = await inject(
    'POST',
    `/p/center/${token}`,
    FORM,
    new URLSearchParams(fields).toString(),
  );
  return { status: r.status, location: r.location?.replace(token, '<token>') ?? null };
}

interface State {
  status: string;
  suppressions: string[];
  lists: Record<string, string>;
  consent: string[];
}

/** Everything a resubscribe writes: status, suppressions, list rows, consent events. */
async function stateOf(p: Person): Promise<State> {
  const [c] = await rows<{ status: string }>(
    sql`SELECT status::text AS status FROM contacts WHERE id = ${p.id}::uuid`,
  );
  const supp = await rows<{ reason: string }>(sql`
    SELECT reason::text AS reason FROM suppressions
    WHERE org_id = ${org}::uuid AND lower(email) = lower(${p.email}) ORDER BY reason
  `);
  const memberships = await rows<{ list_id: string; unsub: boolean; confirmed: boolean }>(sql`
    SELECT list_id, unsubscribed_at IS NOT NULL AS unsub, confirmed_at IS NOT NULL AS confirmed
    FROM contact_lists WHERE contact_id = ${p.id}::uuid
  `);
  const consent = await rows<{ type: string; source: string }>(sql`
    SELECT event_type::text AS type, source FROM consent_events
    WHERE org_id = ${org}::uuid AND contact_id = ${p.id}::uuid ORDER BY occurred_at
  `);
  const name = (id: string) => (id === L ? 'L' : id === L2 ? 'L2' : id === M ? 'M' : 'other');
  const lists: Record<string, string> = {};
  for (const m of memberships)
    lists[name(m.list_id)] = `${m.unsub ? 'unsubscribed_at SET' : 'unsubscribed_at NULL'}${
      m.confirmed ? ' confirmed' : ''
    }`;
  return {
    status: c?.status ?? 'no contact',
    suppressions: supp.map((s) => s.reason),
    lists,
    consent: consent.map((e) => `${e.type}/${e.source}`),
  };
}

/** An active contact on L and L2 who then left everything with a fresh link. */
async function unsubscribed(label: string): Promise<Person> {
  const p = await person(label, [L, L2]);
  const r = await center(prefToken(p.id), { globalUnsubscribe: true });
  expect(r.status).toBe(200);
  return p;
}

/** What the page offers: the forms, the boxes, the text. */
function offered(body: string) {
  return {
    resubscribeForm: body.includes('name="action" value="resubscribe"'),
    saveForm: body.includes('name="action" value="save"'),
    unsubscribeAllForm: body.includes('name="action" value="unsubscribe_all"'),
    boxes: [...body.matchAll(/name="list" value="([^"]+)"/g)]
      .map((m) => (m[1] === L ? 'L' : m[1] === L2 ? 'L2' : m[1] === M ? 'M' : 'other'))
      .sort(),
    expiredText: body.includes(EXPIRED_TEXT),
  };
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  seedSession = await login(app);
  seedOrgId = seedSession.orgId;
  seedBefore = await seedState();

  const [o] = await rows<{ id: string }>(sql`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`${TAG} org`}, ${TAG}, 'production', 'Obchod z177 s.r.o.', 'Nádražní 1, 110 00 Praha')
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
  // The sessions' own rate-limit buckets are removed at the end.
  rawKeys.push(ownerToken, seedSession.token);
  // DNS cannot be verified in CI; the campaign of V needs a sender of its own domain.
  await db.execute(sql`
    INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
    VALUES (${org}::uuid, ${DOMAIN}, 'fm1', true, true, true, true)
  `);
  L = await newList('L');
  L2 = await newList('L2');
  M = await newList('M');
}, 120_000);

afterAll(async () => {
  let legacyKeysLeft = 0;
  for (const tk of legacyTokens) {
    for (const k of [`unsub:${tk}`, `pref:${tk}`]) await redis.del(k);
  }
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
  for (const tk of legacyTokens)
    legacyKeysLeft += (await redis.exists(`unsub:${tk}`)) + (await redis.exists(`pref:${tk}`));
  if (org) {
    await db.execute(sql`DELETE FROM email_events WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM campaigns WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM consent_events WHERE org_id = ${org}::uuid`);
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
           (SELECT count(*)::int FROM consent_events WHERE org_id = ${org}::uuid) AS consent_events,
           (SELECT count(*)::int FROM campaigns WHERE org_id = ${org}::uuid) AS campaigns,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${org}::uuid) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${org}::uuid) AS api_keys
  `);
  const seedAfter = await seedState();
  report.cells = cells;
  report.rateLimitWaits = rateLimitWaits;
  report.leftover = { ...left, legacyKeysLeft, limitKeysRemoved };
  report.seedOrg = { before: seedBefore, after: seedAfter };
  const all = JSON.stringify(report);
  const parts = Math.ceil(all.length / 3000);
  for (let i = 0; i < parts; i++)
    console.log(
      `Z177_API_CELLS_JSON ${String(i).padStart(4, '0')}/${parts} ${all.slice(i * 3000, (i + 1) * 3000)}`,
    );
  await app.close();
  expect(left, 'what this file made was not all removed').toEqual({
    orgs: 0,
    contacts: 0,
    suppressions: 0,
    lists: 0,
    consent_events: 0,
    campaigns: 0,
    members: 0,
    api_keys: 0,
  });
  expect(legacyKeysLeft).toBe(0);
  expect(seedAfter, 'the seed organisation changed').toEqual(seedBefore);
}, 120_000);

/** Where a contact who left everything stands — the state every refusal must keep. */
const LEFT_ALL: State = {
  status: 'unsubscribed',
  suppressions: ['unsubscribe'],
  lists: { L: 'unsubscribed_at SET confirmed', L2: 'unsubscribed_at SET confirmed' },
  consent: [],
};

describe('the preference-centre link brings a person back only while it is young (Z177)', () => {
  it('the i18n text of an expired link exists in cs and carries nothing the page would escape', () => {
    cells.text = { cs: EXPIRED_TEXT };
    expect(EXPIRED_TEXT).not.toBe('preferences_page.resubscribe_link_expired');
    expect(/[&<>"']/.test(EXPIRED_TEXT)).toBe(false);
  });

  it('O — a 31-day link (and one without a numeric ts, or from the future) lifts no unsubscribe', async () => {
    const out: Record<string, unknown> = {};
    const cases: [string, (id: string) => string][] = [
      ['old', (id) => prefToken(id, OLD)],
      ['noTs', (id) => oddPrefToken(id, 'none')],
      ['stringTs', (id) => oddPrefToken(id, 'string')],
      ['future', (id) => prefToken(id, -3600)],
    ];
    for (const [name, mint] of cases) {
      const p = await unsubscribed(`o-${name}`);
      const before = await stateOf(p);
      const r = await center(mint(p.id), { globalResubscribe: true });
      out[name] = { before, answer: r, after: await stateOf(p) };
    }
    cells.O = out;
    for (const name of ['old', 'noTs', 'stringTs', 'future']) {
      const c = out[name] as {
        before: State;
        answer: { status: number; data: unknown };
        after: State;
      };
      expect(c.before).toEqual(LEFT_ALL);
      expect(c.answer.status).toBe(200);
      expect(c.answer.data, name).toEqual({
        globallyUnsubscribed: true,
        listChanges: [],
        resubscribeRefused: 'link_expired',
      });
      expect(c.after, `${name}: the old link lifted the unsubscribe`).toEqual(LEFT_ALL);
    }
  });

  it('OF — the page’s forms with a 31-day link: “subscribe again” and “save” with a left list ticked change nothing', async () => {
    const p = await unsubscribed('of');
    const back = await form(prefToken(p.id, OLD), [
      ['action', 'resubscribe'],
      ['list', L],
    ]);
    const afterBack = await stateOf(p);
    const s = await person('of-save', [L, L2]);
    expect((await center(prefToken(s.id), { unsubscribeFromLists: [L] })).status).toBe(200);
    const save = await form(prefToken(s.id, OLD), [
      ['action', 'save'],
      ['list', L],
      ['list', L2],
    ]);
    const afterSave = await stateOf(s);
    cells.OF = {
      resubscribe: { answer: back, after: afterBack },
      save: { answer: save, after: afterSave },
    };
    expect(back).toEqual({ status: 303, location: '/p/center/<token>?saved=1' });
    expect(afterBack, 'the form brought them back').toEqual(LEFT_ALL);
    expect(save).toEqual({ status: 303, location: '/p/center/<token>?saved=1' });
    expect(afterSave, 'the form reopened the list they left').toEqual({
      status: 'active',
      suppressions: [],
      lists: { L: 'unsubscribed_at SET confirmed', L2: 'unsubscribed_at NULL confirmed' },
      consent: [],
    });
  });

  it('OL — a 31-day link does not reopen a list; an unsubscribe in the same request is carried out', async () => {
    const b = await person('ol', [L, L2]);
    expect((await center(prefToken(b.id), { unsubscribeFromLists: [L] })).status).toBe(200);
    const before = await stateOf(b);
    const back = await center(prefToken(b.id, OLD), { resubscribeToLists: [L] });
    const afterBack = await stateOf(b);
    const mixed = await center(prefToken(b.id, OLD), {
      unsubscribeFromLists: [L2],
      resubscribeToLists: [L],
    });
    const afterMixed = await stateOf(b);
    cells.OL = {
      before,
      back: { answer: back, after: afterBack },
      mixed: { answer: mixed, after: afterMixed },
    };
    const leftL = {
      status: 'active',
      suppressions: [],
      lists: { L: 'unsubscribed_at SET confirmed', L2: 'unsubscribed_at NULL confirmed' },
      consent: [],
    };
    expect(before).toEqual(leftL);
    expect(back).toEqual({
      status: 200,
      data: { globallyUnsubscribed: false, listChanges: [], resubscribeRefused: 'link_expired' },
    });
    expect(afterBack, 'the old link reopened the list').toEqual(leftL);
    expect(mixed).toEqual({
      status: 200,
      data: {
        globallyUnsubscribed: false,
        listChanges: [{ listId: L2, subscribed: false }],
        resubscribeRefused: 'link_expired',
      },
    });
    expect(afterMixed).toEqual({
      ...leftL,
      lists: { L: 'unsubscribed_at SET confirmed', L2: 'unsubscribed_at SET confirmed' },
    });
  });

  it('N — a fresh link does not put the contact on a list they were never on', async () => {
    const p = await person('n', [L]);
    const before = await stateOf(p);
    const r = await center(prefToken(p.id), { resubscribeToLists: [M] });
    const after = await stateOf(p);
    cells.N = { before, answer: r, after };
    expect(before.lists).toEqual({ L: 'unsubscribed_at NULL confirmed' });
    expect(r).toEqual({ status: 200, data: { globallyUnsubscribed: false, listChanges: [] } });
    expect(after, 'a membership of M appeared').toEqual(before);
  });

  it('P — the page and the JSON view with a 31-day link offer no way back, and say why; a fresh one still does', async () => {
    const a = await unsubscribed('p-all');
    const b = await person('p-list', [L, L2]);
    expect((await center(prefToken(b.id), { unsubscribeFromLists: [L] })).status).toBe(200);
    const view = async (p: Person, ageS: number) => {
      const tk = prefToken(p.id, ageS);
      const pageRes = await inject('GET', `/p/center/${tk}`, AS_BROWSER);
      const json = await inject('GET', `/p/center/${tk}`, { accept: 'application/json' });
      const data = JSON.parse(json.body).data as {
        canResubscribe: boolean;
        globallyUnsubscribed: boolean;
        emailMasked: string;
        lists: { id: string; subscribed: boolean }[];
      };
      return {
        page: { status: pageRes.status, ...offered(pageRes.body) },
        json: {
          status: json.status,
          canResubscribe: data.canResubscribe,
          globallyUnsubscribed: data.globallyUnsubscribed,
          masked:
            data.emailMasked.includes('*') && !data.emailMasked.includes(p.email.split('@')[0]!),
          lists: data.lists.map((l) => `${l.id === L ? 'L' : 'L2'}:${l.subscribed}`).sort(),
        },
      };
    };
    const cell = {
      allOld: await view(a, OLD),
      allFresh: await view(a, 0),
      listOld: await view(b, OLD),
      listFresh: await view(b, 0),
    };
    cells.P = cell;
    // C: the page and the JSON answer with any link, the address masked, the lists listed.
    for (const v of Object.values(cell)) {
      expect(v.page.status).toBe(200);
      expect(v.json.status).toBe(200);
      expect(v.json.masked).toBe(true);
    }
    expect(cell.allFresh.page).toMatchObject({
      resubscribeForm: true,
      boxes: ['L', 'L2'],
      expiredText: false,
    });
    expect(cell.allFresh.json).toMatchObject({ canResubscribe: true, globallyUnsubscribed: true });
    expect(cell.listFresh.page).toMatchObject({
      saveForm: true,
      boxes: ['L', 'L2'],
      expiredText: false,
    });
    expect(cell.allOld.page, 'the old link offered the way back').toEqual({
      status: 200,
      resubscribeForm: false,
      saveForm: false,
      unsubscribeAllForm: false,
      boxes: [],
      expiredText: true,
    });
    expect(cell.allOld.json).toEqual({
      status: 200,
      canResubscribe: false,
      globallyUnsubscribed: true,
      masked: true,
      lists: ['L2:false', 'L:false'],
    });
    expect(cell.listOld.page, 'the old link offered the left list').toEqual({
      status: 200,
      resubscribeForm: false,
      saveForm: true,
      unsubscribeAllForm: true,
      boxes: ['L2'],
      expiredText: true,
    });
    expect(cell.listOld.json).toMatchObject({
      canResubscribe: false,
      lists: ['L2:true', 'L:false'],
    });
  });

  it('V — the view-in-browser copy of a 31-day e-mail carries links as old as the e-mail', async () => {
    const p = await person('v', [L]);
    const subject = `Novinky ${TAG}`;
    const c = await asOwner('POST', '/api/v1/campaigns', {
      name: `${TAG} v`,
      subject,
      fromName: 'Obchod',
      fromEmail: `noreply@${DOMAIN}`,
      listId: L,
      content: {
        subject,
        blocks: [
          {
            id: 'b1',
            type: 'text',
            content:
              '<p><a href="{{preference_center_url}}">Nastavení</a> <a href="{{unsubscribe_url}}">Odhlásit</a></p>',
            fontSize: '15px',
            fontFamily: 'Arial',
            color: '#111827',
            lineHeight: '1.5',
            textAlign: 'left',
          },
        ],
        globalStyles: {
          backgroundColor: '#fff',
          contentBackgroundColor: '#fff',
          fontFamily: 'Arial',
          linkColor: '#00f',
          textColor: '#000',
          contentWidth: 600,
        },
      },
    });
    const viewTs = nowS() - OLD;
    const viewToken = createTrackingToken({
      type: 'view',
      orgId: org,
      campaignId: c.data.id,
      contactId: p.id,
      ts: viewTs,
    });
    const copy = await inject('GET', `/api/v1/browser/${viewToken}`, AS_BROWSER);
    const pref = /\/p\/center\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/.exec(copy.body)?.[1] ?? '';
    const unsub =
      /\/api\/v1\/unsubscribe\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/.exec(copy.body)?.[1] ?? '';
    const prefPayload = pref ? decode(pref) : {};
    const unsubPayload = unsub ? decode(unsub) : {};
    cells.V = {
      copy: copy.status,
      viewTs,
      pref: {
        ...prefPayload,
        contactId: prefPayload.contactId === p.id,
        orgId: prefPayload.orgId === org,
      },
      unsub: {
        ...unsubPayload,
        contactId: unsubPayload.contactId === p.id,
        orgId: unsubPayload.orgId === org,
        campaignId: unsubPayload.campaignId === c.data.id,
      },
      prefAgeS: typeof prefPayload.ts === 'number' ? nowS() - prefPayload.ts : null,
    };
    expect(copy.status).toBe(200);
    expect(Object.keys(prefPayload).sort()).toEqual(['contactId', 'orgId', 'ts', 'type']);
    expect(prefPayload.type).toBe('pref');
    expect(prefPayload.ts, 'the copy minted a fresh preference link').toBe(viewTs);
    expect(unsubPayload.type).toBe('unsub');
    expect(unsubPayload.ts).toBe(viewTs);
  });

  it('F / B — a fresh link, and one 29 days old, bring the person back as before', async () => {
    const out: Record<string, unknown> = {};
    for (const [name, ageS] of [
      ['F', 0],
      ['B', 29 * DAY],
    ] as const) {
      const p = await unsubscribed(name.toLowerCase());
      const r = await center(prefToken(p.id, ageS), {
        globalResubscribe: true,
        resubscribeToLists: [L],
      });
      out[name] = { answer: r, after: await stateOf(p) };
    }
    cells.FB = out;
    for (const name of ['F', 'B']) {
      const c = out[name] as { answer: { status: number; data: unknown }; after: State };
      expect(c.answer).toEqual({
        status: 200,
        data: { globallyUnsubscribed: false, listChanges: [{ listId: L, subscribed: true }] },
      });
      expect(c.after, name).toEqual({
        status: 'active',
        suppressions: [],
        lists: { L: 'unsubscribed_at NULL confirmed', L2: 'unsubscribed_at SET confirmed' },
        consent: ['re_consent/preference_center'],
      });
    }
  });

  it('C — with a 31-day link the person still leaves: everything, one list, by the form; the legacy route lifts nothing', async () => {
    const g = await person('c-global', [L, L2]);
    const gR = await center(prefToken(g.id, OLD), { globalUnsubscribe: true });
    const l = await person('c-list', [L, L2]);
    const lR = await center(prefToken(l.id, OLD), { unsubscribeFromLists: [L] });
    const f = await person('c-form', [L, L2]);
    const fR = await form(prefToken(f.id, OLD), [['action', 'unsubscribe_all']]);
    const s = await person('c-save', [L, L2]);
    const sR = await form(prefToken(s.id, OLD), [
      ['action', 'save'],
      ['list', L2],
    ]);

    // Legacy GET/POST /api/v1/preferences/:token (Redis-backed UUID unsub token).
    const lg = await unsubscribed('c-legacy');
    const lgBefore = await stateOf(lg);
    const legacyPost = await generateUnsubscribeToken(lg.id, org);
    legacyTokens.push(legacyPost);
    const lgPost = await inject(
      'POST',
      `/api/v1/preferences/${legacyPost}`,
      {},
      {
        globalResubscribe: true,
        resubscribeToLists: [L],
        resubscribe: true,
        unsubscribeAll: false,
      },
    );
    const lgAfter = await stateOf(lg);
    const legacyGet = await generateUnsubscribeToken(lg.id, org);
    legacyTokens.push(legacyGet);
    const lgGet = await inject('GET', `/api/v1/preferences/${legacyGet}`, {});
    const lgGetData =
      lgGet.status === 200 ? (JSON.parse(lgGet.body).data as Record<string, unknown>) : {};

    const cell = {
      global: { answer: gR, after: await stateOf(g) },
      list: { answer: lR, after: await stateOf(l) },
      form: { answer: fR, after: await stateOf(f) },
      save: { answer: sR, after: await stateOf(s) },
      legacy: {
        before: lgBefore,
        post: lgPost.status,
        after: lgAfter,
        get: lgGet.status,
        getKeys: Object.keys(lgGetData).sort(),
        getEmailIsFullAddress: lgGetData.email === lg.email,
      },
    };
    cells.C = cell;
    expect(cell.global.answer).toEqual({
      status: 200,
      data: { globallyUnsubscribed: true, listChanges: [] },
    });
    expect(cell.global.after).toEqual({ ...LEFT_ALL });
    expect(cell.list.answer).toEqual({
      status: 200,
      data: { globallyUnsubscribed: false, listChanges: [{ listId: L, subscribed: false }] },
    });
    expect(cell.list.after.lists).toEqual({
      L: 'unsubscribed_at SET confirmed',
      L2: 'unsubscribed_at NULL confirmed',
    });
    expect(cell.form.answer).toEqual({ status: 303, location: '/p/center/<token>?saved=1' });
    expect(cell.form.after).toEqual({ ...LEFT_ALL });
    expect(cell.save.answer).toEqual({ status: 303, location: '/p/center/<token>?saved=1' });
    expect(cell.save.after.lists).toEqual({
      L: 'unsubscribed_at SET confirmed',
      L2: 'unsubscribed_at NULL confirmed',
    });
    expect(cell.legacy.before).toEqual(LEFT_ALL);
    expect(cell.legacy.post).toBe(204);
    expect(cell.legacy.after, 'the legacy route lifted the unsubscribe').toEqual(LEFT_ALL);
    expect(cell.legacy.get).toBe(200);
  });
});
