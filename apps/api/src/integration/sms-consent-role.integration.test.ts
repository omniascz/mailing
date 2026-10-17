/**
 * Recording SMS or WhatsApp consent and simulating an inbound SMS take owner,
 * admin or editor; a viewer gets 403 and nothing is written (Z178).
 *
 * ─── Why this file exists ────────────────────────────────────────────────────
 *
 * The standing decision: owner, admin and editor may send; a viewer may not;
 * an API key acts with its creator's role (Z129, Z130). POST /sms/consents,
 * POST /whatsapp/consents and POST /sms/inbound had app.authenticate and
 * nothing else, so a viewer — by session or by a key that acts as viewer —
 * could write an sms_consents row on any number. checkSmsCompliance reads that
 * row and lets a flow's marketing SMS (Z167) and an SMS campaign through it.
 * POST /sms/inbound runs the organisation's keywords from any `fromPhone`:
 * 'subscribe' makes a contact, 'unsubscribe' unsubscribes one. The three routes
 * now take requireRole('admin', 'owner', 'editor'), the shape POST
 * /sms/keywords has in the same file and POST /contacts/:id/consent already
 * had. Revoking consent (the DELETE routes, STOP) is the stricter direction and
 * stays open to every role.
 *
 * ─── What this file measures ─────────────────────────────────────────────────
 *
 * Every route × {owner session, owner key, editor session, editor key, viewer
 * session, viewer key, a publishable key}: the HTTP status, the body with ids
 * replaced, and what the organisation held before and after (sms_consents,
 * whatsapp_consents, contacts, list rows, suppressions, consent events, the
 * keywords' hit counts). The viewer: 403 and the organisation as it was. The
 * other roles: the writes, asserted. Controls the same before and after Z178:
 * a viewer's DELETE of either consent (204, revoked), the GET routes, the
 * compliance check, a viewer's own POST /api-keys (refused since Z130).
 *
 * Members are made the way a customer makes them: an organisation of this
 * file with an owner, and users of a second organisation of this file invited
 * through POST /orgs/:id/members/invite and accepting through POST
 * /invitations/:token/accept (the token is read from the row: the invitation
 * e-mail is not sent, routes/v1/cross-account.ts). A session in the
 * organisation is POST /me/orgs/switch. A viewer cannot mint a key, so a key
 * that acts as viewer is made the way a member comes to hold one: minted while
 * an admin, then the owner sets the member to viewer through PATCH
 * /orgs/:id/members/:memberId; the key acts with the lower role from then on
 * (services/auth/api-key-role.ts). An editor's key the same way.
 *
 * No mock: buildApp() and inject, the database and Redis. Every call holds its
 * own credential, so the limiter gives this file buckets of its own; they are
 * removed at the end. Everything measured is printed once as
 * `Z178_API_CELLS_JSON {…}`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { eq, sql, type SQL } from 'drizzle-orm';
import { redis } from '@forgemsg/shared/redis';
import { createTestApp, login, SEED } from './setup/harness.js';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';

let app: FastifyInstance;
const TAG = `z178-${randomUUID().slice(0, 8)}`;
let org = '';
let home = '';
let seedOrg = '';
let seedBefore: Record<string, unknown> = {};

type Who = 'owner' | 'ownerKey' | 'editor' | 'editorKey' | 'viewer' | 'viewerKey' | 'public';
const WHO: Who[] = ['owner', 'ownerKey', 'editor', 'editorKey', 'viewer', 'viewerKey', 'public'];
const REFUSED_BEFORE: Who[] = ['public'];
const VIEWER: Who[] = ['viewer', 'viewerKey'];
const headersOf = {} as Record<Who, Record<string, string>>;
/** Sessions and keys of this file: their rate-limit buckets go at the end. */
const credentials: string[] = [];
const createdUsers: string[] = [];
const report: Record<string, unknown> = { tag: TAG, mock: 'none' };
const cells: Record<string, Record<string, unknown>> = {};
report.cells = cells;
let joinKeyword = '';
let stopKeyword = '';
let list = '';

const rows = async <T>(q: SQL) => (await db.execute(q)) as unknown as T[];

const call = async (who: Who, method: string, url: string, body?: unknown) => {
  const res = await app.inject({
    method: method as 'POST',
    url,
    headers: headersOf[who],
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  });
  return { status: res.statusCode, body: res.body };
};

const normalise = (body: string) =>
  body
    .split(TAG)
    .join('<TAG>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '<TIME>')
    .replace(/\+4207\d{8}/g, '<PHONE>');

let serial = 0;
/** A number nobody in this organisation has yet. */
function phone(): string {
  serial++;
  return `+4207${String(10_000_000 + serial * 7919 + Math.floor(Math.random() * 7_000))}`;
}

/** A contact of this organisation with a number, written as a row. */
async function contact(label: string, status = 'active'): Promise<{ id: string; phone: string }> {
  const p = phone();
  const [c] = await rows<{ id: string }>(sql`
    INSERT INTO contacts (org_id, email, phone, first_name, status)
    VALUES (${org}::uuid, ${`${label}-${serial}-${TAG}@test.local`}, ${p}, 'Petra', ${status})
    RETURNING id
  `);
  return { id: c!.id, phone: p };
}

/** What the organisation holds that these routes could write. */
async function orgState() {
  const [r] = await rows<Record<string, unknown>>(sql`
    SELECT (SELECT count(*)::int FROM sms_consents WHERE org_id = ${org}::uuid) AS sms_consents,
           (SELECT count(*)::int FROM sms_consents WHERE org_id = ${org}::uuid AND revoked_at IS NULL) AS sms_consents_active,
           (SELECT count(*)::int FROM whatsapp_consents WHERE org_id = ${org}::uuid) AS wa_consents,
           (SELECT count(*)::int FROM whatsapp_consents WHERE org_id = ${org}::uuid AND revoked_at IS NULL) AS wa_consents_active,
           (SELECT count(*)::int FROM contacts WHERE org_id = ${org}::uuid) AS contacts,
           (SELECT count(*)::int FROM contacts WHERE org_id = ${org}::uuid AND status = 'unsubscribed') AS unsubscribed,
           (SELECT count(*)::int FROM contact_lists cl JOIN contacts c ON c.id = cl.contact_id WHERE c.org_id = ${org}::uuid) AS list_rows,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${org}::uuid) AS suppressions,
           (SELECT count(*)::int FROM consent_events WHERE org_id = ${org}::uuid) AS consent_events,
           (SELECT COALESCE(sum(hit_count), 0)::int FROM sms_keywords WHERE org_id = ${org}::uuid) AS keyword_hits
  `);
  return r!;
}

/** The seed organisation: what this file must leave as it found it. */
async function seedState() {
  const [r] = await rows<Record<string, unknown>>(sql`
    SELECT (SELECT count(*)::int FROM sms_consents WHERE org_id = ${seedOrg}::uuid) AS sms_consents,
           (SELECT count(*)::int FROM whatsapp_consents WHERE org_id = ${seedOrg}::uuid) AS wa_consents,
           (SELECT count(*)::int FROM contacts WHERE org_id = ${seedOrg}::uuid) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrg}::uuid) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrg}::uuid AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM sms_keywords WHERE org_id = ${seedOrg}::uuid) AS sms_keywords,
           (SELECT count(*)::int FROM users WHERE org_id = ${seedOrg}::uuid) AS users,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${seedOrg}::uuid) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${seedOrg}::uuid) AS api_keys
  `);
  return r!;
}

const diff = (before: Record<string, unknown>, after: Record<string, unknown>) =>
  Object.fromEntries(
    Object.keys(before)
      .filter((k) => before[k] !== after[k])
      .map((k) => [k, `${String(before[k])} → ${String(after[k])}`]),
  );

const cookieOf = (cookie: string) => ({ cookie });
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function newOrg(label: string): Promise<string> {
  const [o] = await rows<{ id: string }>(sql`
    INSERT INTO organizations (name, slug, plan, company_name, postal_address)
    VALUES (${`${TAG} ${label}`}, ${`${TAG}-${label}`}, 'pro', 'Obchod z178 s.r.o.', 'Nádražní 1, 110 00 Praha')
    RETURNING id
  `);
  return o!.id;
}

/** A user of `orgId` with the seed password, logged in for real. */
async function user(orgId: string, role: string, label: string) {
  const [seedUser] = await db
    .select({ hash: users.passwordHash })
    .from(users)
    .where(eq(users.email, SEED.email));
  const email = `${TAG}-${label}@test.local`;
  const [u] = await db
    .insert(users)
    .values({
      orgId,
      email,
      name: `${TAG} ${label}`,
      passwordHash: seedUser!.hash,
      role: role as 'owner',
      emailVerified: true,
    })
    .returning({ id: users.id });
  createdUsers.push(u!.id);
  const session = await login(app, email);
  credentials.push(session.token);
  return { id: u!.id, email, session };
}

/** A user of the home organisation, invited to this one as `role`, accepted, switched in. */
async function member(role: 'viewer' | 'editor' | 'admin', label: string) {
  const u = await user(home, 'owner', label);
  const inv = await call('owner', 'POST', `/api/v1/orgs/${org}/members/invite`, {
    email: u.email,
    role,
  });
  expect(inv.status, inv.body).toBe(201);
  const memberId = (JSON.parse(inv.body) as { data: { memberId: string } }).data.memberId;
  const [m] = await rows<{ t: string }>(
    sql`SELECT invitation_token AS t FROM organization_members WHERE id = ${memberId}::uuid`,
  );
  const acc = await app.inject({
    method: 'POST',
    url: `/api/v1/invitations/${m!.t}/accept`,
    headers: cookieOf(u.session.cookie),
  });
  expect(acc.statusCode, acc.body).toBe(200);
  const sw = await app.inject({
    method: 'POST',
    url: '/api/v1/me/orgs/switch',
    headers: cookieOf(u.session.cookie),
    payload: { orgId: org },
  });
  expect(sw.statusCode, sw.body).toBe(200);
  const token = (sw.json() as { data: { token: string } }).data.token;
  credentials.push(token);
  return { ...u, memberId, token };
}

async function mint(headers: Record<string, string>, name: string, isPublic = false) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/api-keys',
    headers,
    payload: { name, isPublic },
  });
  return { status: res.statusCode, body: res.body };
}

/** A key minted while an admin, then the member set to `role` by the owner. */
async function keyActingAs(role: 'viewer' | 'editor', label: string): Promise<string> {
  const m = await member('admin', label);
  const minted = await mint(bearer(m.token), `${TAG} ${label} key`);
  expect(minted.status, minted.body).toBe(201);
  const raw = (JSON.parse(minted.body) as { data: { rawKey: string } }).data.rawKey;
  credentials.push(raw);
  const set = await call('owner', 'PATCH', `/api/v1/orgs/${org}/members/${m.memberId}`, { role });
  expect(set.status, set.body).toBe(200);
  return raw;
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  const [s] = await rows<{ org_id: string }>(
    sql`SELECT org_id FROM users WHERE email = ${SEED.email} LIMIT 1`,
  );
  seedOrg = s!.org_id;
  seedBefore = await seedState();

  org = await newOrg('org');
  home = await newOrg('home');
  const owner = await user(org, 'owner', 'owner');
  headersOf.owner = cookieOf(owner.session.cookie);

  const ownerKey = await mint(headersOf.owner, `${TAG} owner key`);
  expect(ownerKey.status, ownerKey.body).toBe(201);
  const rawOwner = (JSON.parse(ownerKey.body) as { data: { rawKey: string } }).data.rawKey;
  credentials.push(rawOwner);
  headersOf.ownerKey = { 'x-api-key': rawOwner };
  const pub = await mint(headersOf.owner, `${TAG} public`, true);
  expect(pub.status, pub.body).toBe(201);
  const rawPub = (JSON.parse(pub.body) as { data: { rawKey: string } }).data.rawKey;
  credentials.push(rawPub);
  headersOf.public = { 'x-api-key': rawPub };

  headersOf.editor = bearer((await member('editor', 'editor')).token);
  const viewer = await member('viewer', 'viewer');
  headersOf.viewer = bearer(viewer.token);
  headersOf.editorKey = { 'x-api-key': await keyActingAs('editor', 'editork') };
  headersOf.viewerKey = { 'x-api-key': await keyActingAs('viewer', 'viewerk') };

  // A viewer's own key: refused since Z130 (only an admin mints one).
  const viewerMint = await mint(headersOf.viewer, `${TAG} viewer own key`);
  // Who each credential is, as the API sees it.
  const seen: Record<string, string> = {};
  for (const who of WHO)
    seen[who] = String((await call(who, 'GET', '/api/v1/sms/consents')).status);
  const keyRoles = await rows<{ name: string; role: string | null }>(
    sql`SELECT name, role FROM api_keys WHERE org_id = ${org}::uuid ORDER BY name`,
  );
  const memberRoles = await rows<{ email: string; role: string; status: string }>(
    sql`SELECT email, role, status FROM organization_members WHERE org_id = ${org}::uuid ORDER BY email`,
  );
  report.credentials = {
    getSmsConsents: seen,
    viewerMintsOwnKey: `${viewerMint.status} ${normalise(viewerMint.body).slice(0, 200)}`,
    keys: keyRoles.map((k) => `${k.name.replace(TAG, '<TAG>')}: stored ${k.role}`),
    members: memberRoles.map((m) => `${m.email.replace(TAG, '<TAG>')}: ${m.role} ${m.status}`),
  };
  expect(viewerMint.status, viewerMint.body).toBe(403);

  const [l] = await rows<{ id: string }>(sql`
    INSERT INTO lists (org_id, name) VALUES (${org}::uuid, ${`${TAG} keyword list`}) RETURNING id
  `);
  list = l!.id;
  joinKeyword = `JOIN${serial}${TAG.slice(5, 9)}`.toUpperCase();
  stopKeyword = `KONEC${TAG.slice(5, 9)}`.toUpperCase();
  for (const [keyword, action] of [
    [joinKeyword, 'subscribe'],
    [stopKeyword, 'unsubscribe'],
  ] as const) {
    const k = await call('owner', 'POST', '/api/v1/sms/keywords', {
      keyword,
      action,
      ...(action === 'subscribe' ? { listId: list } : {}),
      reply: `${action} ok`,
    });
    expect(k.status, k.body).toBe(201);
  }
}, 180_000);

afterAll(async () => {
  let limitKeysRemoved = 0;
  for (const c of credentials) {
    const d = createHash('sha256').update(c).digest('hex').slice(0, 32);
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
  for (const o of [org, home]) {
    if (!o) continue;
    await db.execute(sql`DELETE FROM sms_consents WHERE org_id = ${o}::uuid`);
    await db.execute(sql`DELETE FROM whatsapp_consents WHERE org_id = ${o}::uuid`);
    await db.execute(sql`DELETE FROM sms_keywords WHERE org_id = ${o}::uuid`);
    await db.execute(sql`DELETE FROM suppressions WHERE org_id = ${o}::uuid`);
    await db.execute(sql`DELETE FROM consent_events WHERE org_id = ${o}::uuid`);
    await db.execute(sql`DELETE FROM audit_logs WHERE org_id = ${o}::uuid`);
    await db.execute(sql`DELETE FROM api_keys WHERE org_id = ${o}::uuid`);
    await db.execute(sql`DELETE FROM organization_members WHERE org_id = ${o}::uuid`);
  }
  for (const id of createdUsers) {
    await db.execute(sql`DELETE FROM api_keys WHERE user_id = ${id}::uuid`);
    await db.execute(sql`DELETE FROM users WHERE id = ${id}::uuid`);
  }
  for (const o of [org, home]) {
    // Contacts, lists and the rest of the organisation go with it (ON DELETE CASCADE).
    if (o) await db.execute(sql`DELETE FROM organizations WHERE id = ${o}::uuid`);
  }
  const [left] = await rows<Record<string, number>>(sql`
    SELECT (SELECT count(*)::int FROM organizations WHERE slug LIKE ${`${TAG}%`}) AS orgs,
           (SELECT count(*)::int FROM users WHERE email LIKE ${`${TAG}%`}) AS users,
           (SELECT count(*)::int FROM contacts WHERE email LIKE ${`%${TAG}@test.local`}) AS contacts,
           (SELECT count(*)::int FROM api_keys WHERE name LIKE ${`${TAG}%`}) AS api_keys,
           (SELECT count(*)::int FROM organization_members WHERE email LIKE ${`${TAG}%`}) AS members,
           (SELECT count(*)::int FROM sms_consents WHERE consent_context = ${TAG}) AS sms_consents,
           (SELECT count(*)::int FROM whatsapp_consents WHERE consent_context = ${TAG}) AS wa_consents
  `);
  const seedAfter = await seedState();
  report.leftover = { ...left, limitKeysRemoved };
  report.seedOrg = { before: seedBefore, after: seedAfter };
  console.log(`Z178_API_CELLS_JSON ${JSON.stringify(report)}`);
  await app?.close();
  expect(left).toEqual({
    orgs: 0,
    users: 0,
    contacts: 0,
    api_keys: 0,
    members: 0,
    sms_consents: 0,
    wa_consents: 0,
  });
  // The seed organisation exactly as this file found it (a snapshot, not zeros).
  expect(seedAfter).toEqual(seedBefore);
}, 120_000);

interface Route {
  key: string;
  /** Prepare a target and return the request plus the target's own reading. */
  make: (who: Who) => Promise<{
    method: string;
    url: string;
    body: unknown;
    read: () => Promise<Record<string, unknown>>;
  }>;
  /** What the call wrote when allowed, read from `read` before → after. */
  allowed: { status: number; target: Record<string, unknown> };
}

const consentOf = (table: 'sms' | 'wa', p: string) => async () => {
  const r =
    table === 'sms'
      ? await rows<{ revoked: boolean }>(
          sql`SELECT revoked_at IS NOT NULL AS revoked FROM sms_consents WHERE org_id = ${org}::uuid AND phone = ${p}`,
        )
      : await rows<{ revoked: boolean }>(
          sql`SELECT revoked_at IS NOT NULL AS revoked FROM whatsapp_consents WHERE org_id = ${org}::uuid AND phone = ${p}`,
        );
  return { rows: r.length, active: r.filter((x) => !x.revoked).length };
};

/** The contacts on a number: status, list rows, sms_consents rows. */
const byPhone = (p: string) => async () => {
  const c = await rows<{ id: string; status: string }>(
    sql`SELECT id, status FROM contacts WHERE org_id = ${org}::uuid AND phone = ${p}`,
  );
  let listRows = 0;
  for (const x of c) {
    const [n] = await rows<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM contact_lists WHERE contact_id = ${x.id}::uuid`,
    );
    listRows += n!.n;
  }
  const [consents] = await rows<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM sms_consents WHERE org_id = ${org}::uuid AND phone = ${p}`,
  );
  return {
    contacts: c.length,
    status: c.map((x) => x.status).join(',') || '-',
    listRows,
    smsConsents: consents!.n,
  };
};

const ROUTES: Route[] = [
  {
    key: 'POST /api/v1/sms/consents',
    make: async (who) => {
      const c = await contact(`cv-${who}`);
      return {
        method: 'POST',
        url: '/api/v1/sms/consents',
        body: { phone: c.phone, contactId: c.id, consentSource: 'api', consentContext: TAG },
        read: consentOf('sms', c.phone),
      };
    },
    allowed: { status: 201, target: { rows: '0 → 1', active: '0 → 1' } },
  },
  {
    key: 'POST /api/v1/whatsapp/consents',
    make: async (who) => {
      const c = await contact(`cw-${who}`);
      return {
        method: 'POST',
        url: '/api/v1/whatsapp/consents',
        body: { phone: c.phone, contactId: c.id, consentSource: 'api', consentContext: TAG },
        read: consentOf('wa', c.phone),
      };
    },
    allowed: { status: 201, target: { rows: '0 → 1', active: '0 → 1' } },
  },
  {
    key: 'POST /api/v1/sms/inbound subscribe, unknown number',
    make: async () => {
      const p = phone();
      return {
        method: 'POST',
        url: '/api/v1/sms/inbound',
        body: { fromPhone: p, body: `${joinKeyword} ahoj` },
        read: byPhone(p),
      };
    },
    // A new contact, non_subscribed (Z172); the keyword's list is not joined
    // and no consent row is written — what dispatchInboundSms does today.
    allowed: { status: 200, target: { contacts: '0 → 1', status: '- → non_subscribed' } },
  },
  {
    key: 'POST /api/v1/sms/inbound subscribe, known number',
    make: async (who) => {
      const c = await contact(`ci-known-${who}`);
      return {
        method: 'POST',
        url: '/api/v1/sms/inbound',
        body: { fromPhone: c.phone, body: joinKeyword },
        read: byPhone(c.phone),
      };
    },
    // An existing contact keeps its status (Z147); only the hit is counted.
    allowed: { status: 200, target: {} },
  },
  {
    key: 'POST /api/v1/sms/inbound unsubscribe, known number',
    make: async (who) => {
      const c = await contact(`ci-stop-${who}`);
      return {
        method: 'POST',
        url: '/api/v1/sms/inbound',
        body: { fromPhone: c.phone, body: stopKeyword },
        read: byPhone(c.phone),
      };
    },
    allowed: { status: 200, target: { status: 'active → unsubscribed' } },
  },
];

describe('role × route: a viewer may not record SMS or WhatsApp consent nor simulate an inbound SMS (Z178)', () => {
  for (const route of ROUTES) {
    for (const who of WHO) {
      it(`${route.key} — ${who}`, async () => {
        const req = await route.make(who);
        const targetBefore = await req.read();
        const before = await orgState();
        const res = await call(who, req.method, req.url, req.body);
        const after = await orgState();
        const targetAfter = await req.read();
        const cell = {
          status: res.status,
          body: normalise(res.body).slice(0, 600),
          target: diff(targetBefore, targetAfter),
          org: diff(before, after),
        };
        (cells[route.key] ??= {})[who] = cell;
        console.log(
          `[z178] ${route.key} ${who}: ${res.status} target=${JSON.stringify(cell.target)} org=${JSON.stringify(cell.org)}`,
        );
        if (VIEWER.includes(who)) {
          expect(res.status, res.body.slice(0, 300)).toBe(403);
          expect(JSON.parse(res.body)).toMatchObject({
            code: 'FORBIDDEN',
            message: 'Requires one of: admin, owner, editor',
          });
          expect(after, 'a refused call writes nothing').toEqual(before);
          expect(targetAfter).toEqual(targetBefore);
        } else if (REFUSED_BEFORE.includes(who)) {
          expect(res.status, res.body.slice(0, 300)).toBe(403);
          expect(JSON.parse(res.body)).toMatchObject({
            message: 'Public API keys cannot access this endpoint',
          });
          expect(after).toEqual(before);
        } else {
          expect(res.status, res.body.slice(0, 300)).toBe(route.allowed.status);
          expect(cell.target).toEqual(route.allowed.target);
          if (route.key.startsWith('POST /api/v1/sms/inbound')) {
            expect(cell.org.keyword_hits, 'the keyword hit is counted').toMatch(/^\d+ → \d+$/);
          }
        }
      });
    }
  }
});

describe('controls: what Z178 leaves as it was', () => {
  it('revoking either consent stays open to every role, the viewer included (204, revoked)', async () => {
    const out: Record<string, unknown> = {};
    for (const who of WHO) {
      for (const [kind, path] of [
        ['sms', '/api/v1/sms/consents'],
        ['wa', '/api/v1/whatsapp/consents'],
      ] as const) {
        const c = await contact(`rv-${kind}-${who}`);
        const made = await call('owner', 'POST', path, {
          phone: c.phone,
          contactId: c.id,
          consentSource: 'api',
          consentContext: TAG,
        });
        expect(made.status, made.body).toBe(201);
        const before = await consentOf(kind, c.phone)();
        const res = await call(who, 'DELETE', `${path}/${encodeURIComponent(c.phone)}`);
        const after = await consentOf(kind, c.phone)();
        out[`${kind} ${who}`] = { status: res.status, before, after };
        if (who === 'public') {
          expect(res.status, res.body).toBe(403);
          expect(after).toEqual(before);
        } else {
          expect(res.status, res.body).toBe(204);
          expect(after).toEqual({ rows: 1, active: 0 });
        }
      }
    }
    report.revoke = out;
    console.log(`[z178] revoke ${JSON.stringify(out)}`);
  });

  it('the GET routes and the compliance check stay open to a viewer', async () => {
    // The check answers for the number: in the EU (CZ) it needs consent on it,
    // so a number without one gets 403 SMS_COMPLIANCE_BLOCKED — the check's
    // answer, not a role refusal (services/sms/compliance.ts).
    const consented = await contact('check-consented');
    const made = await call('owner', 'POST', '/api/v1/sms/consents', {
      phone: consented.phone,
      contactId: consented.id,
      consentSource: 'api',
      consentContext: TAG,
    });
    expect(made.status, made.body).toBe(201);
    const codeOf = (r: { status: number; body: string }) => {
      const code = /"code":"([A-Z_]+)"/.exec(r.body)?.[1];
      return code ? `${r.status} ${code}` : String(r.status);
    };
    const out: Record<string, string> = {};
    for (const who of VIEWER) {
      out[`GET /sms/consents ${who}`] = codeOf(await call(who, 'GET', '/api/v1/sms/consents'));
      out[`GET /whatsapp/consents ${who}`] = codeOf(
        await call(who, 'GET', '/api/v1/whatsapp/consents'),
      );
      out[`GET /sms/keywords ${who}`] = codeOf(await call(who, 'GET', '/api/v1/sms/keywords'));
      for (const [label, p] of [
        ['consented', consented.phone],
        ['no consent', phone()],
      ] as const) {
        out[`POST /sms/compliance/check ${label} ${who}`] = codeOf(
          await call(who, 'POST', '/api/v1/sms/compliance/check', {
            phone: p,
            body: 'Akce',
            countryCode: 'CZ',
          }),
        );
      }
    }
    report.viewerUnchanged = out;
    console.log(`[z178] viewer unchanged ${JSON.stringify(out)}`);
    for (const who of VIEWER) {
      expect(out[`GET /sms/consents ${who}`]).toBe('200');
      expect(out[`GET /whatsapp/consents ${who}`]).toBe('200');
      expect(out[`GET /sms/keywords ${who}`]).toBe('200');
      expect(out[`POST /sms/compliance/check consented ${who}`]).toBe('200');
      expect(out[`POST /sms/compliance/check no consent ${who}`]).toBe(
        '403 SMS_COMPLIANCE_BLOCKED',
      );
    }
  });
});
