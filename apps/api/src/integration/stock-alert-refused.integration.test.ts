/**
 * The restock / price-drop form enrols no contact that gets no marketing and
 * no address with any suppression row; its answer to a page says nothing
 * about the address; an SMS keyword makes a new contact non_subscribed (Z172).
 *
 * ─── What was wrong (measured on master ced6a9a) ─────────────────────────────
 *
 * POST /back-in-stock/subscribe and /price-drop/subscribe refused only an
 * unsubscribed or complained contact and a row found by the address. A pending
 * contact (a double opt-in nobody confirmed), a bounced one and an archived
 * one were enrolled (Z146 MIMO 4), and so was an erased address typed in again
 * — the erasure's row has no address, only its fingerprint. The row of a
 * subscription is what reads as "they asked for this". And the body told a
 * publishable key — a key in page JS — `subscribed: true | false`. An SMS
 * keyword from an unknown number made the new contact 'active', the status
 * that means consent to e-mail marketing (Z147 MIMO 5).
 *
 * ─── What this file measures ─────────────────────────────────────────────────
 *
 * Through the real app (buildApp, inject, the real database and Redis). An
 * organisation of this file (INSERT: the sign-up route makes a new user, not a
 * second org of the seed owner), its owner session from POST /me/orgs/switch,
 * its publishable and secret keys from POST /api-keys. Contacts with
 * POST /contacts (status, phone), archives with PUT archived, rows with
 * POST /suppressions, the erasure with /anonymize, keywords with
 * POST /sms/keywords, the keyword itself with POST /sms/inbound, lists and
 * campaigns through their routes. Products by ingestProducts, the feed's own
 * ingestion (there is no product route, and a feed fetches a URL). The signed
 * Twilio webhook needs a provisioned number: phone_numbers is INSERTed (the
 * provisioning route buys the number from Twilio). The subscribe limit (10 an
 * hour per key and address) is not lifted: the publishable key changes every
 * eight subscribes, all from this file's one address. No worker runs here; the
 * restock and the campaigns are walked in
 * apps/workers/src/integration/stock-alert-refused-flow.
 *
 *   S / S0  {new, active, non_subscribed, pending, bounced, archived(active),
 *           unsubscribed, complained, active + {hard_bounce, complaint,
 *           unsubscribe, manual, block}, erased + the address again} ×
 *           {back-in-stock, price-drop}: answer, body, subscription rows,
 *           status after;
 *   O       the body to a publishable key, accepted vs refused; the shape to a
 *           secret key and a session; 400 / 403 / 404 / 429;
 *   D       a hundred subscribes are one row;
 *   K       an SMS keyword from an unknown number, existing contacts, STOP,
 *           the reply, the signed Twilio webhook, the keyword contact given an
 *           address and put on a list (pre-send count);
 *   N       statements of one subscribe.
 *
 * Everything measured is printed once as `Z172_API_CELLS_JSON {…}`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import { redis } from '@forgemsg/shared/redis';

/**
 * The signed Twilio cell needs the Auth Token and the public base in place
 * before config/env.ts parses process.env, as in sms-inbound-tenant.
 */
const { AUTH_TOKEN, PUBLIC_BASE } = vi.hoisted(() => {
  const token = 'itest-z172-twilio-auth-token';
  const base = 'https://api.z172.invalid';
  process.env.TWILIO_AUTH_TOKEN = token;
  process.env.API_PUBLIC_URL = base;
  return { AUTH_TOKEN: token, PUBLIC_BASE: base };
});

import { createTestApp, login, SEED, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { observeQueries } from '../db/explain-guard.js';
import { ingestProducts } from '../services/product-catalog/feed-ingestion.js';

const TAG = `z172-${randomUUID().slice(0, 8)}`;
const DOMAIN = `${TAG}.test`;
const octet = () => 1 + Math.floor(Math.random() * 250);
// This file's own address: its own rate-limit buckets.
const IP = `100.64.173.${octet()}`;
const PHONE_BASE = 420_700_000_000 + Math.floor(Math.random() * 90_000_000);
const BIS_SKU = `${TAG}-bis`;
const PD_SKU = `${TAG}-pd`;
const RECEIVED = '{"data":{"received":true}}';

let app: FastifyInstance;
let seedSession: Session;
let seedOrgId = '';
let org = '';
let owner: Record<string, string> = {};
let secretKey = '';
let seedBefore: Record<string, unknown> = {};
const keyIds: string[] = [];
const rawKeys: string[] = [];
const report: Record<string, unknown> = {
  tag: TAG,
  mock: 'none — the real app, database and Redis; no worker runs in this process',
};
const cells: Record<string, unknown> = {};
let n = 0;
let phones = 0;

const rows = async <T>(q: SQL) => (await db.execute(q)) as unknown as T[];
const address = (label: string) => `${label}-${n++}-${TAG}@${DOMAIN}`;
const newPhone = () => `+${PHONE_BASE + ++phones}`;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const apiKey = (key: string) => ({ 'x-api-key': key });

/** Windows this file waited out on a 429 — the limit is honoured, not lifted. */
const rateLimitWaits: { url: string; retryAfterS: number }[] = [];

interface Res {
  status: number;
  body: string;
  json: () => Record<string, unknown>;
}

async function inject(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
  opts: { waitOn429?: boolean; contentType?: string } = {},
): Promise<Res> {
  for (let attempt = 0; ; attempt++) {
    const res = await app.inject({
      method: method as 'POST',
      url,
      headers: { ...headers, ...(opts.contentType ? { 'content-type': opts.contentType } : {}) },
      remoteAddress: IP,
      ...(body === undefined
        ? {}
        : typeof body === 'string'
          ? { payload: body }
          : { payload: body as Record<string, unknown> }),
    });
    if (res.statusCode === 429 && opts.waitOn429 !== false && attempt < 3) {
      const retryAfterS = Number(res.headers['retry-after'] ?? 60);
      rateLimitWaits.push({
        url: url.split('?')[0]!.replace(/[0-9a-f-]{36}/g, ':id'),
        retryAfterS,
      });
      await new Promise((r) => setTimeout(r, (retryAfterS + 1) * 1000));
      continue;
    }
    return {
      status: res.statusCode,
      body: res.body,
      json: () => (res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {}),
    };
  }
}

async function asOwner(method: string, url: string, body?: unknown) {
  const r = await inject(method, url, owner, body);
  expect(r.status, `${method} ${url}: ${r.body}`).toBeLessThan(300);
  return r.json() as { data: Record<string, unknown> & { id: string } };
}

/** A key of this org from POST /api-keys: the raw value, returned once. */
async function mintKey(isPublic: boolean): Promise<string> {
  const b = (await asOwner('POST', '/api/v1/api-keys', {
    name: `${TAG} ${isPublic ? 'pub' : 'secret'} ${keyIds.length}`,
    isPublic,
  })) as unknown as { data: { apiKey: { id: string }; rawKey: string } };
  keyIds.push(b.data.apiKey.id);
  rawKeys.push(b.data.rawKey);
  return b.data.rawKey;
}

/**
 * A publishable key of this file; a fresh one every eight subscribes. The
 * route allows ten an hour per key and address — this file's own buckets.
 */
let pub = '';
let pubUses = 0;
async function publishable(): Promise<string> {
  if (!pub || pubUses >= 8) {
    pub = await mintKey(true);
    pubUses = 0;
  }
  pubUses++;
  return pub;
}

/** The seed org as a whole: this file must leave it exactly as it found it. */
async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await rows<Record<string, unknown>>(sql`
    SELECT (SELECT count(*)::int FROM contacts WHERE org_id = ${seedOrgId}::uuid) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId}::uuid) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId}::uuid AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM back_in_stock_subscriptions WHERE org_id = ${seedOrgId}::uuid) AS bis,
           (SELECT count(*)::int FROM price_drop_subscriptions WHERE org_id = ${seedOrgId}::uuid) AS pd,
           (SELECT count(*)::int FROM products WHERE org_id = ${seedOrgId}::uuid) AS products,
           (SELECT count(*)::int FROM sms_keywords WHERE org_id = ${seedOrgId}::uuid) AS sms_keywords,
           (SELECT count(*)::int FROM sms_consents WHERE org_id = ${seedOrgId}::uuid) AS sms_consents,
           (SELECT count(*)::int FROM lists WHERE org_id = ${seedOrgId}::uuid) AS lists,
           (SELECT count(*)::int FROM campaigns WHERE org_id = ${seedOrgId}::uuid) AS campaigns,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${seedOrgId}::uuid) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${seedOrgId}::uuid) AS api_keys,
           (SELECT count(*)::int FROM users WHERE org_id = ${seedOrgId}::uuid) AS users
  `);
  return r!;
}

type Start =
  | 'new'
  | 'active'
  | 'non_subscribed'
  | 'pending'
  | 'bounced'
  | 'archived(active)'
  | 'unsubscribed'
  | 'complained'
  | 'active + hard_bounce'
  | 'active + complaint'
  | 'active + unsubscribe'
  | 'active + manual'
  | 'active + block'
  | 'erased + again';

/** A contact of this org in `start`, made by the routes; null for an address never seen. */
async function prepare(start: Start, email: string): Promise<{ id: string | null; made: string }> {
  if (start === 'new') return { id: null, made: 'no contact' };
  if (start === 'erased + again') {
    const b = await asOwner('POST', '/api/v1/contacts', { email, firstName: 'Jana' });
    await asOwner('POST', `/api/v1/contacts/${b.data.id}/anonymize`, {});
    return { id: null, made: 'POST /contacts + POST /anonymize (row: hash only)' };
  }
  const [base, row] = start.split(' + ') as [string, string | undefined];
  const archived = /^archived\((\w+)\)$/.exec(base)?.[1];
  const status = archived ?? base;
  const b = await asOwner('POST', '/api/v1/contacts', {
    email,
    firstName: 'Jana',
    ...(status === 'active' ? {} : { status }),
  });
  let made = `POST /contacts ${status}`;
  if (archived) {
    await asOwner('PUT', `/api/v1/contacts/${b.data.id}`, { status: 'archived' });
    made += ' + PUT archived';
  }
  if (row) {
    await asOwner('POST', '/api/v1/suppressions', { email, reason: row });
    made += ` + POST /suppressions ${row}`;
  }
  return { id: b.data.id, made };
}

/** The contacts of the address now (an erased one no longer has it). */
async function contactsOf(email: string) {
  return rows<{ id: string; status: string }>(sql`
    SELECT id, status::text AS status FROM contacts
    WHERE org_id = ${org}::uuid AND lower(email) = lower(${email}) AND deleted_at IS NULL
    ORDER BY created_at
  `);
}

async function subscriptionsOf(kind: 'bis' | 'pd', email: string, contactId?: string | null) {
  const table = kind === 'bis' ? sql`back_in_stock_subscriptions` : sql`price_drop_subscriptions`;
  const r = await rows<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM ${table} s
    WHERE s.org_id = ${org}::uuid
      AND (s.contact_id IN (SELECT id FROM contacts WHERE org_id = ${org}::uuid AND lower(email) = lower(${email}))
           OR s.contact_id = ${contactId ?? null}::uuid)
  `);
  return r[0]!.n;
}

const PATH = {
  bis: '/api/v1/back-in-stock/subscribe',
  pd: '/api/v1/price-drop/subscribe',
} as const;
const SKU = { bis: BIS_SKU, pd: PD_SKU } as const;

interface SubCell {
  start: Start;
  kind: 'bis' | 'pd';
  made: string;
  answer: number;
  body: string;
  rows: number;
  statusBefore: string | null;
  statusAfter: string[];
}

/** Subscribe `start` with a publishable key and read what was written. */
async function subscribeCell(start: Start, kind: 'bis' | 'pd'): Promise<SubCell> {
  const email = address(`${kind}-${start.replace(/[^a-z]+/g, '-')}`);
  const before = await prepare(start, email);
  const statusBefore = before.id ? ((await contactsOf(email))[0]?.status ?? null) : null;
  const res = await inject('POST', PATH[kind], apiKey(await publishable()), {
    sku: SKU[kind],
    email,
  });
  return {
    start,
    kind,
    made: before.made,
    answer: res.status,
    body: res.body.replace(/"id":"[0-9a-f-]{36}"/, '"id":"<uuid>"'),
    rows: await subscriptionsOf(kind, email, before.id),
    statusBefore,
    statusAfter: (await contactsOf(email)).map((c) => c.status),
  };
}

/** Z172: refused — no subscription row. */
const S: Start[] = [
  'pending',
  'bounced',
  'archived(active)',
  'active + hard_bounce',
  'active + manual',
  'active + block',
  'erased + again',
];
/** Unchanged: three accepted, four refused as on master. */
const S0_ACCEPTED: Start[] = ['new', 'active', 'non_subscribed'];
const S0_REFUSED: Start[] = [
  'unsubscribed',
  'complained',
  'active + complaint',
  'active + unsubscribe',
];

const BLOCKS = [
  {
    id: 'b1',
    type: 'text',
    content: '<p>Dobrý den.</p>',
    fontSize: '15px',
    fontFamily: 'Arial',
    color: '#111827',
    lineHeight: '1.5',
    textAlign: 'left',
  },
  {
    id: 'b2',
    type: 'footer',
    content: '{{company_name}}',
    showUnsubscribe: true,
    textAlign: 'center',
    fontSize: '12px',
    color: '#6b7280',
  },
];
const GLOBAL_STYLES = {
  backgroundColor: '#fff',
  contentBackgroundColor: '#fff',
  fontFamily: 'Arial',
  linkColor: '#00f',
  textColor: '#000',
  contentWidth: 600,
};

function item(sku: string, price: number, stock: number) {
  return {
    externalId: sku,
    sku,
    name: 'Kávovar',
    description: null,
    price,
    currency: 'CZK',
    imageUrl: null,
    url: `https://shop.example/p/${sku}`,
    categories: [],
    stock,
  };
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  seedSession = await login(app);
  seedOrgId = seedSession.orgId;
  seedBefore = await seedState();

  const [o] = await rows<{ id: string }>(sql`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`${TAG} org`}, ${TAG}, 'production', 'Obchod z172 s.r.o.', 'Nádražní 1, 110 00 Praha')
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
  secretKey = await mintKey(false);
  await ingestProducts(org, [item(BIS_SKU, 990, 0), item(PD_SKU, 800, 5)]);
}, 120_000);

afterAll(async () => {
  // Rate-limit counters of this file's keys and session (the route's
  // key-and-address buckets and the global per-key ones).
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
    await db.execute(sql`DELETE FROM email_events WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM campaigns WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM audit_logs WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM sms_inbound WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM sms_consents WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM phone_numbers WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM api_keys WHERE org_id = ${org}::uuid`);
    // Everything else of the organisation goes with it (ON DELETE CASCADE).
    await db.execute(sql`DELETE FROM organizations WHERE id = ${org}::uuid`);
  }
  const [left] = await rows<Record<string, number>>(sql`
    SELECT (SELECT count(*)::int FROM organizations WHERE id = ${org}::uuid) AS orgs,
           (SELECT count(*)::int FROM contacts WHERE org_id = ${org}::uuid) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${org}::uuid) AS suppressions,
           (SELECT count(*)::int FROM back_in_stock_subscriptions WHERE org_id = ${org}::uuid) AS bis,
           (SELECT count(*)::int FROM price_drop_subscriptions WHERE org_id = ${org}::uuid) AS pd,
           (SELECT count(*)::int FROM products WHERE org_id = ${org}::uuid) AS products,
           (SELECT count(*)::int FROM sms_keywords WHERE org_id = ${org}::uuid) AS sms_keywords,
           (SELECT count(*)::int FROM sms_inbound WHERE org_id = ${org}::uuid) AS sms_inbound,
           (SELECT count(*)::int FROM phone_numbers WHERE org_id = ${org}::uuid) AS phone_numbers,
           (SELECT count(*)::int FROM lists WHERE org_id = ${org}::uuid) AS lists,
           (SELECT count(*)::int FROM campaigns WHERE org_id = ${org}::uuid) AS campaigns,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${org}::uuid) AS api_keys,
           (SELECT count(*)::int FROM sending_domains WHERE org_id = ${org}::uuid) AS domains,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${org}::uuid) AS members
  `);
  const seedAfter = await seedState();
  report.cells = cells;
  report.leftover = { ...left, limitKeysRemoved };
  report.rateLimitWaits = rateLimitWaits;
  report.seedOrg = { before: seedBefore, after: seedAfter };
  console.log(`Z172_API_CELLS_JSON ${JSON.stringify(report)}`);
  await app?.close();
  expect(left, 'what this file made was not all removed').toEqual({
    orgs: 0,
    contacts: 0,
    suppressions: 0,
    bis: 0,
    pd: 0,
    products: 0,
    sms_keywords: 0,
    sms_inbound: 0,
    phone_numbers: 0,
    lists: 0,
    campaigns: 0,
    api_keys: 0,
    domains: 0,
    members: 0,
  });
  // The seed org exactly as this file found it — a snapshot, not zeros.
  expect(seedAfter).toEqual(seedBefore);
  expect(seedAfter.hash_rows).toBe(0);
}, 120_000);

const subs: Record<string, SubCell> = {};

describe('S — the form enrols no contact that gets no marketing, no suppressed or erased address (Z172)', () => {
  for (const kind of ['bis', 'pd'] as const) {
    for (const start of S) {
      it(`S ${kind} ${start}: no subscription row`, async () => {
        const cell = await subscribeCell(start, kind);
        subs[`${kind} ${start}`] = cell;
        cells[`S ${kind} ${start}`] = cell;
        console.log(`[z172] S ${kind} ${start}: ${JSON.stringify(cell)}`);
        expect(cell.answer).toBe(202);
        expect(cell.rows).toBe(0);
      }, 300_000);
    }
  }
});

describe('S0 — unchanged: new, active and non_subscribed enrol; unsubscribed, complained and their rows do not', () => {
  for (const kind of ['bis', 'pd'] as const) {
    for (const start of S0_ACCEPTED) {
      it(`S0 ${kind} ${start}: one row, status as before`, async () => {
        const cell = await subscribeCell(start, kind);
        subs[`${kind} ${start}`] = cell;
        cells[`S0 ${kind} ${start}`] = cell;
        console.log(`[z172] S0 ${kind} ${start}: ${JSON.stringify(cell)}`);
        expect(cell.answer).toBe(202);
        expect(cell.rows).toBe(1);
        // A new address becomes non_subscribed (#131), the others keep theirs.
        expect(cell.statusAfter).toEqual([start === 'new' ? 'non_subscribed' : start]);
      }, 300_000);
    }
    for (const start of S0_REFUSED) {
      it(`S0 ${kind} ${start}: no row, as on master`, async () => {
        const cell = await subscribeCell(start, kind);
        subs[`${kind} ${start}`] = cell;
        cells[`S0 ${kind} ${start}`] = cell;
        console.log(`[z172] S0 ${kind} ${start}: ${JSON.stringify(cell)}`);
        expect(cell.answer).toBe(202);
        expect(cell.rows).toBe(0);
      }, 300_000);
    }
  }

  it('S0 the contact a refused new address leaves behind: non_subscribed, as on master', async () => {
    // A new address with a row: findOrCreateContact makes the contact before
    // the row is read, and the refusal does not take it back (Zásah 3).
    const email = address('row-new');
    await asOwner('POST', '/api/v1/suppressions', { email, reason: 'manual' });
    const res = await inject('POST', PATH.bis, apiKey(await publishable()), {
      sku: BIS_SKU,
      email,
    });
    const cell = {
      answer: res.status,
      rows: await subscriptionsOf('bis', email),
      contacts: (await contactsOf(email)).map((c) => c.status),
    };
    cells['S0 new address with a manual row'] = cell;
    console.log(`[z172] S0 new address with a manual row: ${JSON.stringify(cell)}`);
    expect(cell.answer).toBe(202);
    expect(cell.rows).toBe(0);
    expect(cell.contacts).toEqual(['non_subscribed']);
  }, 120_000);

  it('D a hundred subscribes of one address are one row (master = branch)', async () => {
    const email = address('hundred');
    const answers: Record<number, number> = {};
    for (let i = 0; i < 100; i++) {
      const res = await inject('POST', PATH.bis, apiKey(await publishable()), {
        sku: BIS_SKU,
        email,
      });
      answers[res.status] = (answers[res.status] ?? 0) + 1;
    }
    const cell = { answers, rows: await subscriptionsOf('bis', email) };
    cells.D = cell;
    console.log(`[z172] D: ${JSON.stringify(cell)}`);
    expect(cell.answers).toEqual({ 202: 100 });
    expect(cell.rows).toBe(1);
  }, 600_000);
});

describe('O — what a subscribe answers (Z172)', () => {
  it('O a publishable key gets the same body, accepted or refused', () => {
    const bodies = Object.fromEntries(
      Object.entries(subs).map(([k, c]) => [k, `${c.answer} ${c.body}`]),
    );
    cells['O publishable bodies'] = bodies;
    console.log(`[z172] O publishable bodies: ${JSON.stringify(bodies)}`);
    expect(Object.keys(bodies).length).toBe(
      2 * (S.length + S0_ACCEPTED.length + S0_REFUSED.length),
    );
    for (const [k, b] of Object.entries(bodies)) expect(b, k).toBe(`202 ${RECEIVED}`);
  });

  it('O a secret key and a session keep { subscribed, id }', async () => {
    const out: Record<string, unknown> = {};
    const shape = (b: Record<string, unknown>) => {
      const d = b.data as Record<string, unknown>;
      return {
        keys: Object.keys(d).sort(),
        subscribed: d.subscribed,
        id: typeof d.id === 'string' ? '<uuid>' : (d.id ?? null),
      };
    };
    for (const start of ['active', 'pending', 'unsubscribed'] as const) {
      const email = address(`secret-${start}`);
      const c = await prepare(start, email);
      const res = await inject('POST', PATH.bis, apiKey(secretKey), {
        sku: BIS_SKU,
        contactId: c.id,
      });
      out[`secret contactId ${start}`] = {
        answer: res.status,
        ...shape(res.json()),
        rows: await subscriptionsOf('bis', email, c.id),
      };
    }
    for (const start of ['new', 'pending'] as const) {
      const email = address(`session-${start}`);
      await prepare(start, email);
      const res = await inject('POST', PATH.pd, owner, { sku: PD_SKU, email });
      out[`session email ${start}`] = {
        answer: res.status,
        ...shape(res.json()),
        rows: await subscriptionsOf('pd', email),
      };
    }
    cells['O secret and session'] = out;
    console.log(`[z172] O secret and session: ${JSON.stringify(out)}`);
    for (const [k, v] of Object.entries(out) as [string, { answer: number; keys: string[] }][]) {
      expect(v.answer, k).toBe(202);
      expect(['id,subscribed', 'subscribed'], k).toContain(v.keys.join(','));
    }
    expect(out['secret contactId active']).toMatchObject({ subscribed: true, id: '<uuid>' });
    expect(out['session email new']).toMatchObject({ subscribed: true, id: '<uuid>' });
    expect(out['secret contactId unsubscribed']).toMatchObject({ subscribed: false });
  }, 300_000);

  it('O 400 / 403 / 404 / 429 answer as before', async () => {
    const t = await publishable();
    const noId = await inject('POST', PATH.bis, apiKey(t), { sku: BIS_SKU });
    const [someone] = await rows<{ id: string }>(sql`
      SELECT id FROM contacts WHERE org_id = ${org}::uuid LIMIT 1
    `);
    const t2 = await publishable();
    const cid = await inject('POST', PATH.bis, apiKey(t2), {
      sku: BIS_SKU,
      contactId: someone!.id,
    });
    const t3 = await publishable();
    const noProduct = await inject('POST', PATH.pd, apiKey(t3), {
      sku: `${TAG}-none`,
      email: address('noproduct'),
    });
    // A key of its own: ten an hour per key and address, the eleventh is refused.
    const limited = await mintKey(true);
    const answers: number[] = [];
    let last = '';
    for (let i = 0; i < 11; i++) {
      const r = await inject(
        'POST',
        PATH.bis,
        apiKey(limited),
        { sku: BIS_SKU, email: address('limit') },
        { waitOn429: false },
      );
      answers.push(r.status);
      last = r.body;
    }
    const code = (r: Res) => `${r.status} ${String(r.json().code ?? '')}`;
    const cell = {
      noIdentifier: code(noId),
      publishableContactId: code(cid),
      unknownProduct: code(noProduct),
      limit: answers.join(','),
      limitBody: (JSON.parse(last) as { code?: string }).code ?? null,
    };
    cells['O errors'] = cell;
    console.log(`[z172] O errors: ${JSON.stringify(cell)}`);
    expect(noId.status).toBe(400);
    expect(cid.status).toBe(403);
    expect(noProduct.status).toBe(404);
    expect(answers.slice(0, 10)).toEqual(Array(10).fill(202));
    expect(answers[10]).toBe(429);
  }, 300_000);
});

describe('K — an SMS keyword makes a new contact non_subscribed (Z172)', () => {
  const JOIN = `join${TAG.slice(5, 11)}`;
  const STOP = `stop${TAG.slice(5, 11)}`;
  const REPLY = 'Díky, SMS novinky jsou zapnuté.';
  let joinId = '';

  const keyword = (fromPhone: string, body: string) =>
    inject('POST', '/api/v1/sms/inbound', owner, { fromPhone, body });
  const byPhone = (phone: string) =>
    rows<{ id: string; status: string; source: string | null; email: string | null }>(sql`
      SELECT id, status::text AS status, source, email FROM contacts
      WHERE org_id = ${org}::uuid AND phone = ${phone}
    `);

  beforeAll(async () => {
    const j = await asOwner('POST', '/api/v1/sms/keywords', {
      keyword: JOIN,
      action: 'subscribe',
      reply: REPLY,
    });
    joinId = j.data.id;
    await asOwner('POST', '/api/v1/sms/keywords', {
      keyword: STOP,
      action: 'unsubscribe',
      reply: 'Odhlášeno.',
    });
  }, 60_000);

  it('K an unknown number: one contact, non_subscribed, no sms_consents, no list; the reply as before', async () => {
    const phone = newPhone();
    const res = await keyword(phone, `${JOIN.toUpperCase()} prosím`);
    const made = await byPhone(phone);
    const [consents] = await rows<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM sms_consents WHERE org_id = ${org}::uuid AND phone = ${phone}
    `);
    const [lists] = await rows<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM contact_lists WHERE contact_id = ${made[0]?.id ?? null}::uuid
    `);
    const data = res.json().data as { matched: boolean; reply?: string; keyword?: { id: string } };
    const cell = {
      answer: res.status,
      matched: data.matched,
      reply: data.reply ?? null,
      keywordId: data.keyword?.id === joinId ? '<join>' : (data.keyword?.id ?? null),
      contacts: made.map((c) => ({ status: c.status, source: c.source, email: c.email })),
      smsConsents: consents!.n,
      listMemberships: lists!.n,
    };
    cells['K unknown number'] = cell;
    console.log(`[z172] K unknown number: ${JSON.stringify(cell)}`);
    expect(cell.answer).toBe(200);
    expect(cell.matched).toBe(true);
    expect(cell.reply).toBe(REPLY);
    expect(cell.smsConsents).toBe(0);
    expect(cell.listMemberships).toBe(0);
    expect(cell.contacts).toEqual([
      { status: 'non_subscribed', source: 'sms_keyword', email: null },
    ]);
  }, 120_000);

  it('K the keyword contact given an address and put on a list is not counted by a list campaign', async () => {
    const phone = newPhone();
    await keyword(phone, JOIN);
    const [c] = await byPhone(phone);
    const email = address('kw-email');
    const put = await inject('PUT', `/api/v1/contacts/${c!.id}`, owner, { email });
    const control = await asOwner('POST', '/api/v1/contacts', { email: address('kw-control') });
    const list = await asOwner('POST', '/api/v1/lists', { name: `${TAG} kw` });
    for (const id of [c!.id, control.data.id]) {
      await asOwner('POST', `/api/v1/lists/${list.data.id}/contacts`, { contactId: id });
    }
    const subject = `Novinky ${TAG}`;
    const camp = await asOwner('POST', '/api/v1/campaigns', {
      name: `${TAG} kw`,
      subject,
      fromName: 'Obchod',
      fromEmail: `noreply@${DOMAIN}`,
      listId: list.data.id,
      content: { subject, blocks: BLOCKS, globalStyles: GLOBAL_STYLES },
    });
    const panel = await inject('GET', `/api/v1/campaigns/${camp.data.id}/pre-send-checks`, owner);
    const m = /"title":"([\d,]+) recipients"/.exec(panel.body);
    const count = /No recipients in selected audience/.test(panel.body)
      ? 0
      : m
        ? Number(m[1]!.replace(/,/g, ''))
        : `? ${panel.status} ${panel.body.slice(0, 120)}`;
    const cell = {
      put: put.status,
      statusAfterPut: (await byPhone(phone))[0]!.status,
      preSendCount: count,
    };
    cells['K keyword contact on a list'] = cell;
    console.log(`[z172] K keyword contact on a list: ${JSON.stringify(cell)}`);
    expect(cell.put).toBe(200);
    expect(cell.statusAfterPut).toBe('non_subscribed');
    // Only the control.
    expect(cell.preSendCount).toBe(1);
  }, 300_000);

  it('K an existing contact keeps its status; STOP unsubscribes (master = branch)', async () => {
    const out: Record<string, unknown> = {};
    for (const status of ['active', 'pending', 'unsubscribed'] as const) {
      const phone = newPhone();
      const b = await asOwner('POST', '/api/v1/contacts', {
        email: address(`kw-${status}`),
        phone,
        ...(status === 'active' ? {} : { status }),
      });
      const res = await keyword(phone, JOIN);
      const now = await byPhone(phone);
      out[status] = {
        answer: res.status,
        contacts: now.length,
        same: now[0]?.id === b.data.id,
        statusAfter: now[0]?.status,
      };
    }
    const phone = newPhone();
    await asOwner('POST', '/api/v1/contacts', { email: address('kw-stop'), phone });
    const stop = await keyword(phone, STOP);
    out.stop = {
      answer: stop.status,
      reply: (stop.json().data as { reply?: string }).reply ?? null,
      statusAfter: (await byPhone(phone))[0]?.status,
    };
    cells['K existing and STOP'] = out;
    console.log(`[z172] K existing and STOP: ${JSON.stringify(out)}`);
    for (const status of ['active', 'pending', 'unsubscribed'] as const) {
      expect(out[status]).toEqual({
        answer: 200,
        contacts: 1,
        same: true,
        statusAfter: status,
      });
    }
    expect(out.stop).toEqual({ answer: 200, reply: 'Odhlášeno.', statusAfter: 'unsubscribed' });
  }, 300_000);

  it('K the signed Twilio webhook from an unknown number makes no contact (master = branch)', async () => {
    const ours = newPhone();
    await db.execute(sql`
      INSERT INTO phone_numbers (org_id, number, provider, status)
      VALUES (${org}::uuid, ${ours}, 'twilio', 'active')
    `);
    const out: Record<string, unknown> = {};
    for (const body of [JOIN, 'START']) {
      const from = newPhone();
      const params: Record<string, string> = {
        MessageSid: `SM${TAG.slice(5)}${from.slice(-4)}`,
        From: from,
        To: ours,
        Body: body,
      };
      const path = '/api/v1/sms/webhooks/twilio/inbound';
      const canonical = Object.keys(params)
        .sort()
        .reduce((acc, key) => acc + key + params[key], `${PUBLIC_BASE}${path}`);
      const res = await inject(
        'POST',
        path,
        { 'x-twilio-signature': createHmac('sha1', AUTH_TOKEN).update(canonical).digest('base64') },
        new URLSearchParams(params).toString(),
        { contentType: 'application/x-www-form-urlencoded' },
      );
      const [inbound] = await rows<{ action: string | null }>(sql`
        SELECT keyword_action AS action FROM sms_inbound WHERE org_id = ${org}::uuid AND from_phone = ${from}
      `);
      const [consents] = await rows<{ n: number }>(sql`
        SELECT count(*)::int AS n FROM sms_consents WHERE org_id = ${org}::uuid AND phone = ${from}
      `);
      out[body === JOIN ? 'org keyword' : 'START'] = {
        answer: res.status,
        twiml: res.body,
        inboundAction: inbound?.action ?? null,
        contacts: (await byPhone(from)).length,
        smsConsents: consents!.n,
      };
    }
    cells['K signed webhook'] = out;
    console.log(`[z172] K signed webhook: ${JSON.stringify(out)}`);
    expect(out['org keyword']).toMatchObject({ answer: 200, contacts: 0 });
    expect(out.START).toMatchObject({ answer: 200, contacts: 0 });
  }, 120_000);
});

describe('N — statements of one subscribe', () => {
  it('N new address / active / pending, publishable key', async () => {
    const counted = async (start: Start) => {
      const email = address(`n-${start}`);
      await prepare(start, email);
      const key = await publishable();
      const seen: string[] = [];
      const stop = observeQueries((q) => seen.push(q.replace(/\s+/g, ' ')));
      let status = 0;
      try {
        status = (await inject('POST', PATH.bis, apiKey(key), { sku: BIS_SKU, email })).status;
      } finally {
        stop();
      }
      return {
        answer: status,
        statements: seen.length,
        suppressionReads: seen.filter((q) => /from "suppressions"/i.test(q)).length,
        suppressionStatement:
          seen
            .find((q) => /from "suppressions"/i.test(q))
            ?.split(TAG)
            .join('<TAG>') ?? null,
      };
    };
    const cell = {
      new: await counted('new'),
      active: await counted('active'),
      pending: await counted('pending'),
    };
    cells.N = cell;
    console.log(`[z172] N: ${JSON.stringify(cell)}`);
    expect(cell.new.answer).toBe(202);
    expect(cell.new.suppressionReads).toBeLessThanOrEqual(1);
  }, 300_000);
});
