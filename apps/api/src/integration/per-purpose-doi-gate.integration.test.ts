/**
 * Who may start a per-purpose GDPR confirmation, for whom, and how often (Z185,
 * Zásobník e-mail after Z184 MIMO 1).
 *
 * ─── What was wrong (measured on master 13a0b46 in Z184, d8e5272 here) ───────
 *
 * POST /api/v1/contacts/:contactId/gdpr/doi/:purposeSlug sends an e-mail in the
 * organisation's name ("Potvrzení souhlasu — <účel>"), since Z184 with a link
 * that grants the consent. The route had app.authenticate only: a viewer (a
 * session or a key acting as one) started it and the e-mail went. The contact
 * was read by org and id alone: a deleted contact got the e-mail, an erased
 * one (no address left) answered 500 INTERNAL_ERROR (a plain Error carrying
 * statusCode 422). And there was no limit: four starts, four e-mails — where
 * the list DOI has had three per address and list in 24 hours since Z170.
 *
 * ─── How it is measured ──────────────────────────────────────────────────────
 *
 * The real app, database and Redis; no worker runs in this process, so "the
 * e-mail" is the confirmation's job on the mta-other queue, and "the token" a
 * `doi:purpose:*` key naming the contact. An organisation of this file with an
 * owner who logs in, an admin, an editor and a viewer invited from a second
 * organisation of this file (POST /orgs/:id/members/invite, accepted, switched
 * in); a key minted by the owner, one by the admin, an editor's and a viewer's
 * key (minted while admin, then the member set to that role), and a
 * publishable key. Every credential has its own rate-limit bucket, and the
 * public routes this file's own address; all removed at the end.
 *
 *   P   each role and each key: status, e-mail, token;
 *   D   own live contact, deleted, erased (same id), another org's, an unknown
 *       uuid, `abc`;
 *   L   5 starts for one address and purpose; 3 + 3 on two purposes; the
 *       address written in capitals; the limit key read as a token;
 *   K   unchanged: the list DOI (three per 24 h, the link, page and button),
 *       the per-purpose button; Sonda 4 (unsubscribed, complained, 'manual'
 *       and 'unsubscribe' rows) only recorded;
 *   Q   SQL statements and Redis commands of one start.
 *
 * Everything measured is printed as `Z185_API_CELLS_JSON …` chunks.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { eq, sql, type SQL } from 'drizzle-orm';
import type { JobType } from 'bullmq';
import { redis } from '@forgemsg/shared/redis';
import { createTestApp, login, SEED } from './setup/harness.js';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import { mtaOtherQueue } from '../lib/queues.js';
import { observeQueries } from '../db/explain-guard.js';
import { suppressionEmailHash } from '../services/suppressions/email.js';

const TAG = `z185-${randomUUID().slice(0, 8)}`;
const DOMAIN = `${TAG}.test`;
const octet = () => 1 + Math.floor(Math.random() * 250);
// This file's own address: its own rate-limit buckets on the public routes.
const IP = `100.64.185.${octet()}`;
const ALL: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active', 'completed'];
const PP_SUBJECT = /^Potvrzení souhlasu/;
const LIST_SUBJECT = /^Confirm your subscription to /;
const PERSON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';

let app: FastifyInstance;
let org = '';
let home = '';
let other = '';
let seedOrg = '';
let seedBefore: Record<string, unknown> = {};
const purposes: Record<'a' | 'b', { id: string; slug: string }> = {
  a: { id: '', slug: '' },
  b: { id: '', slug: '' },
};
const createdUsers: string[] = [];
const credentials: string[] = [];
const listIds: string[] = [];
const headersOf: Record<string, Record<string, string>> = {};
const report: Record<string, unknown> = {
  tag: TAG,
  mock: 'none — the real app, database and Redis; no worker runs in this process, the e-mail is the mta-other job',
};
const cells: Record<string, unknown> = {};
const rateLimitWaits: { url: string; retryAfterS: number }[] = [];
const warnings: string[] = [];
let n = 0;

const rows = async <T>(q: SQL) => (await db.execute(q)) as unknown as T[];
const address = (label: string) => `${label}-${n++}-${TAG}@${DOMAIN}`;
const cookieOf = (cookie: string) => ({ cookie });
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const hide = (s: string) =>
  s
    .replace(/[0-9a-f]{64}/g, '<token>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>')
    .split(TAG)
    .join('<TAG>');

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
      ...(body === undefined
        ? {}
        : typeof body === 'string'
          ? { payload: body }
          : { payload: body as Record<string, unknown> }),
    });
    if (res.statusCode === 429 && attempt < 3) {
      const retryAfterS = Number(res.headers['retry-after'] ?? 60);
      rateLimitWaits.push({ url: url.split('?')[0]!, retryAfterS });
      await new Promise((r) => setTimeout(r, (retryAfterS + 1) * 1000));
      continue;
    }
    return { status: res.statusCode, body: res.body };
  }
}

async function asOwner(method: string, url: string, body?: unknown) {
  const r = await inject(method, url, headersOf.owner!, body);
  expect(r.status, `${method} ${url}: ${r.body}`).toBeLessThan(300);
  return (r.body ? JSON.parse(r.body) : {}) as { data: Record<string, unknown> & { id: string } };
}

/** The seed organisation: what this file must leave exactly as it found it. */
async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await rows<Record<string, unknown>>(sql`
    SELECT (SELECT count(*)::int FROM contacts WHERE org_id = ${seedOrg}::uuid) AS contacts,
           (SELECT count(*)::int FROM contacts WHERE org_id = ${seedOrg}::uuid AND deleted_at IS NOT NULL) AS contacts_deleted,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrg}::uuid) AS suppressions,
           (SELECT count(*)::int FROM lists WHERE org_id = ${seedOrg}::uuid) AS lists,
           (SELECT count(*)::int FROM consent_events WHERE org_id = ${seedOrg}::uuid) AS consent_events,
           (SELECT count(*)::int FROM contact_gdpr_consents WHERE org_id = ${seedOrg}::uuid) AS gdpr_consents,
           (SELECT count(*)::int FROM processing_purposes WHERE org_id = ${seedOrg}::uuid) AS purposes,
           (SELECT count(*)::int FROM users WHERE org_id = ${seedOrg}::uuid) AS users,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${seedOrg}::uuid) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${seedOrg}::uuid) AS api_keys
  `);
  return r!;
}

async function newOrg(label: string): Promise<string> {
  const [o] = await rows<{ id: string }>(sql`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`${TAG} ${label}`}, ${`${TAG}-${label}`}, 'production', 'Obchod z185 s.r.o.', 'Nádražní 1, 110 00 Praha')
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
  const inv = await inject('POST', `/api/v1/orgs/${org}/members/invite`, headersOf.owner!, {
    email: u.email,
    role,
  });
  expect(inv.status, inv.body).toBe(201);
  const memberId = (JSON.parse(inv.body) as { data: { memberId: string } }).data.memberId;
  const [m] = await rows<{ t: string }>(
    sql`SELECT invitation_token AS t FROM organization_members WHERE id = ${memberId}::uuid`,
  );
  const acc = await inject(
    'POST',
    `/api/v1/invitations/${m!.t}/accept`,
    cookieOf(u.session.cookie),
  );
  expect(acc.status, acc.body).toBe(200);
  const sw = await inject('POST', '/api/v1/me/orgs/switch', cookieOf(u.session.cookie), {
    orgId: org,
  });
  expect(sw.status, sw.body).toBe(200);
  const token = (JSON.parse(sw.body) as { data: { token: string } }).data.token;
  credentials.push(token);
  return { ...u, memberId, token };
}

async function mint(headers: Record<string, string>, name: string, isPublic = false) {
  const r = await inject('POST', '/api/v1/api-keys', headers, { name, isPublic });
  expect(r.status, r.body).toBe(201);
  const raw = (JSON.parse(r.body) as { data: { rawKey: string } }).data.rawKey;
  credentials.push(raw);
  return raw;
}

/** A key minted while an admin, then the member set to `role` by the owner. */
async function keyActingAs(role: 'viewer' | 'editor', label: string): Promise<string> {
  const m = await member('admin', label);
  const raw = await mint(bearer(m.token), `${TAG} ${label} key`);
  const set = await inject('PATCH', `/api/v1/orgs/${org}/members/${m.memberId}`, headersOf.owner!, {
    role,
  });
  expect(set.status, set.body).toBe(200);
  return raw;
}

async function newContact(label: string): Promise<{ id: string; email: string }> {
  const email = address(label);
  const c = await asOwner('POST', '/api/v1/contacts', { email, firstName: 'Petra' });
  return { id: c.data.id, email };
}

/** Confirmation e-mails queued in this org for `email` (any case). */
async function mails(email: string, subject: RegExp) {
  return (await mtaOtherQueue.getJobs(ALL, 0, 10_000))
    .filter(
      (j) =>
        j?.data?.orgId === org &&
        String(j.data.toEmail).toLowerCase() === email.toLowerCase() &&
        subject.test(String(j.data.subject)),
    )
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** Per-purpose tokens stored for `contactId`. */
async function tokensOf(contactId: string): Promise<number> {
  let found = 0;
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:purpose:*', 'COUNT', 1000);
    cursor = next;
    for (const k of keys) if ((await redis.get(k))?.includes(contactId)) found++;
  } while (cursor !== '0');
  return found;
}

interface Start {
  status: number;
  body: string;
  mails: number;
  tokens: number;
}

/** Start the confirmation as `who` for `contact` and count what it left. */
async function start(
  who: string,
  contact: { id: string; email: string },
  purpose: 'a' | 'b' = 'a',
): Promise<Start> {
  const before = (await mails(contact.email, PP_SUBJECT)).length;
  const tokensBefore = await tokensOf(contact.id);
  const r = await inject(
    'POST',
    `/api/v1/contacts/${contact.id}/gdpr/doi/${purposes[purpose].slug}`,
    headersOf[who]!,
    {},
  );
  return {
    status: r.status,
    body: hide(r.body),
    mails: (await mails(contact.email, PP_SUBJECT)).length - before,
    tokens: (await tokensOf(contact.id)) - tokensBefore,
  };
}

const errorBody = (s: Start) => {
  try {
    const b = JSON.parse(s.body) as { code?: string; message?: string; statusCode?: number };
    return { code: b.code, message: b.message, statusCode: b.statusCode };
  } catch {
    return { raw: s.body.slice(0, 200) };
  }
};

/** The limit keys of this file's purposes. */
async function limitKeys(): Promise<string[]> {
  const found: string[] = [];
  for (const p of Object.values(purposes)) {
    if (!p.id) continue;
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(
        cursor,
        'MATCH',
        `doi:limit-purpose:${p.id}:*`,
        'COUNT',
        1000,
      );
      cursor = next;
      found.push(...keys);
    } while (cursor !== '0');
  }
  return found;
}

/** Tokens of this file's orgs: per-purpose and list confirmations. */
async function doiTokens(remove: boolean): Promise<number> {
  let found = 0;
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:*', 'COUNT', 1000);
    cursor = next;
    for (const key of keys) {
      let mine = false;
      if (key.startsWith('doi:limit:'))
        mine = listIds.some((id) => key.startsWith(`doi:limit:${id}:`));
      else if ((await redis.type(key)) === 'string') mine = !!(await redis.get(key))?.includes(org);
      if (!mine) continue;
      found++;
      if (remove) await redis.del(key);
    }
  } while (cursor !== '0');
  return found;
}

const WHO = [
  'owner',
  'admin',
  'editor',
  'viewer',
  'ownerKey',
  'adminKey',
  'editorKey',
  'viewerKey',
  'public',
] as const;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  const [s] = await rows<{ org_id: string }>(
    sql`SELECT org_id FROM users WHERE email = ${SEED.email} LIMIT 1`,
  );
  seedOrg = s!.org_id;
  seedBefore = await seedState();
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    const line = args.map(String).join(' ');
    if (line.includes('[doi]')) warnings.push(line);
  });

  org = await newOrg('org');
  home = await newOrg('home');
  other = await newOrg('other');
  const owner = await user(org, 'owner', 'owner');
  headersOf.owner = cookieOf(owner.session.cookie);
  headersOf.ownerKey = { 'x-api-key': await mint(headersOf.owner, `${TAG} owner key`) };
  headersOf.public = { 'x-api-key': await mint(headersOf.owner, `${TAG} public`, true) };
  const admin = await member('admin', 'admin');
  headersOf.admin = bearer(admin.token);
  headersOf.adminKey = { 'x-api-key': await mint(headersOf.admin, `${TAG} admin key`) };
  headersOf.editor = bearer((await member('editor', 'editor')).token);
  headersOf.viewer = bearer((await member('viewer', 'viewer')).token);
  headersOf.editorKey = { 'x-api-key': await keyActingAs('editor', 'editork') };
  headersOf.viewerKey = { 'x-api-key': await keyActingAs('viewer', 'viewerk') };

  for (const p of ['a', 'b'] as const) {
    const slug = `${TAG}-${p}`;
    const r = await asOwner('POST', '/api/v1/gdpr/purposes', {
      slug,
      name: `${TAG} souhlas ${p}`,
      legalBasis: 'consent',
    });
    purposes[p] = { id: r.data.id, slug };
  }

  // Who each credential is, as the API sees it.
  const keyRoles = await rows<{ name: string; role: string | null; is_public: boolean }>(
    sql`SELECT name, role, is_public FROM api_keys WHERE org_id = ${org}::uuid ORDER BY name`,
  );
  const memberRoles = await rows<{ email: string; role: string; status: string }>(
    sql`SELECT email, role, status FROM organization_members WHERE org_id = ${org}::uuid ORDER BY email`,
  );
  report.credentials = {
    keys: keyRoles.map((k) => `${hide(k.name)}: ${k.role}${k.is_public ? ' public' : ''}`),
    members: memberRoles.map((m) => `${hide(m.email)}: ${m.role} ${m.status}`),
  };
}, 240_000);

afterAll(async () => {
  vi.restoreAllMocks();
  let jobsRemoved = 0;
  for (const j of await mtaOtherQueue.getJobs(ALL, 0, 10_000)) {
    if (j?.data?.orgId === org) {
      await j.remove().catch(() => {});
      jobsRemoved++;
    }
  }
  const doiKeysRemoved = org ? await doiTokens(true) : 0;
  const limitPurposeRemoved = await limitKeys();
  for (const k of limitPurposeRemoved) await redis.del(k);
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
  for (const o of [org, home, other]) {
    if (!o) continue;
    await db.execute(sql`DELETE FROM consent_events WHERE org_id = ${o}::uuid`);
    await db.execute(sql`DELETE FROM contact_gdpr_consents WHERE org_id = ${o}::uuid`);
    await db.execute(sql`DELETE FROM suppressions WHERE org_id = ${o}::uuid`);
    await db.execute(sql`DELETE FROM audit_logs WHERE org_id = ${o}::uuid`);
    await db.execute(sql`DELETE FROM api_keys WHERE org_id = ${o}::uuid`);
    await db.execute(sql`DELETE FROM organization_members WHERE org_id = ${o}::uuid`);
  }
  for (const id of createdUsers) {
    await db.execute(sql`DELETE FROM api_keys WHERE user_id = ${id}::uuid`);
    await db.execute(sql`DELETE FROM users WHERE id = ${id}::uuid`);
  }
  for (const o of [org, home, other]) {
    // Contacts, lists, purposes and the rest go with it (ON DELETE CASCADE).
    if (o) await db.execute(sql`DELETE FROM organizations WHERE id = ${o}::uuid`);
  }
  const [left] = await rows<Record<string, number>>(sql`
    SELECT (SELECT count(*)::int FROM organizations WHERE slug LIKE ${`${TAG}%`}) AS orgs,
           (SELECT count(*)::int FROM users WHERE email LIKE ${`${TAG}%`}) AS users,
           (SELECT count(*)::int FROM contacts WHERE email ILIKE ${`%${TAG}%`}) AS contacts,
           (SELECT count(*)::int FROM api_keys WHERE name LIKE ${`${TAG}%`}) AS api_keys,
           (SELECT count(*)::int FROM organization_members WHERE email LIKE ${`${TAG}%`}) AS members,
           (SELECT count(*)::int FROM processing_purposes WHERE slug LIKE ${`${TAG}%`}) AS purposes,
           (SELECT count(*)::int FROM suppressions WHERE email ILIKE ${`%${TAG}%`}) AS suppressions
  `);
  const doiKeysLeft = org ? await doiTokens(false) : 0;
  const limitPurposeLeft = (await limitKeys()).length;
  const seedAfter = await seedState();
  report.cells = cells;
  report.rateLimitWaits = rateLimitWaits;
  report.leftover = {
    ...left,
    doiKeysLeft,
    limitPurposeLeft,
    doiKeysRemoved,
    limitPurposeRemoved: limitPurposeRemoved.length,
    limitKeysRemoved,
    jobsRemoved,
  };
  report.seedOrg = { before: seedBefore, after: seedAfter };
  const all = JSON.stringify(report);
  const parts = Math.ceil(all.length / 3000);
  for (let i = 0; i < parts; i++)
    console.log(
      `Z185_API_CELLS_JSON ${String(i).padStart(4, '0')}/${parts} ${all.slice(i * 3000, (i + 1) * 3000)}`,
    );
  await app?.close();
  expect(left, 'what this file made was not all removed').toEqual({
    orgs: 0,
    users: 0,
    contacts: 0,
    api_keys: 0,
    members: 0,
    purposes: 0,
    suppressions: 0,
  });
  expect(doiKeysLeft).toBe(0);
  expect(limitPurposeLeft).toBe(0);
  // The seed organisation exactly as this file found it (a snapshot, not zeros).
  expect(seedAfter, 'the seed organisation changed').toEqual(seedBefore);
}, 120_000);

describe('per-purpose DOI start: owner, admin, editor only (Z185 P)', () => {
  it('P — each role and key: owner/admin/editor 200, one e-mail, one token; viewer and the publishable key 403, nothing', async () => {
    const out: Record<string, Start & { error?: unknown }> = {};
    for (const who of WHO) {
      const c = await newContact(`p-${who}`);
      const s = await start(who, c);
      out[who] = s.status === 200 ? s : { ...s, error: errorBody(s) };
    }
    cells.P = out;
    for (const who of ['owner', 'admin', 'editor', 'ownerKey', 'adminKey', 'editorKey'])
      expect(out[who], who).toEqual({
        status: 200,
        body: '{"data":{"ok":true}}',
        mails: 1,
        tokens: 1,
      });
    for (const who of ['viewer', 'viewerKey']) {
      expect(out[who]?.status, who).toBe(403);
      expect(out[who]?.error, who).toEqual({
        code: 'FORBIDDEN',
        message: 'Requires one of: admin, owner, editor',
        statusCode: 403,
      });
      expect([out[who]?.mails, out[who]?.tokens], who).toEqual([0, 0]);
    }
    // The publishable key never reached the route: its scopes stop it in the
    // global scope hook, before app.authenticate. Unchanged.
    expect(out.public?.status).toBe(403);
    expect(out.public?.error).toEqual({
      code: 'FORBIDDEN',
      message: 'API key missing required scope: contacts:write',
      statusCode: 403,
    });
    expect([out.public?.mails, out.public?.tokens]).toEqual([0, 0]);
  });
});

describe('per-purpose DOI start: a live contact of the org with an address (Z185 D)', () => {
  it('D — deleted, erased, another org, unknown: the same 404 Contact, no e-mail, no token; own live contact unchanged', async () => {
    const live = await newContact('d-live');
    const deleted = await newContact('d-deleted');
    const del = await inject('DELETE', `/api/v1/contacts/${deleted.id}`, headersOf.owner!);
    const erased = await newContact('d-erased');
    const er = await inject(
      'POST',
      `/api/v1/contacts/${erased.id}/anonymize`,
      headersOf.owner!,
      {},
    );
    const foreignEmail = address('d-foreign');
    const [f] = await rows<{ id: string }>(sql`
      INSERT INTO contacts (org_id, email, first_name, status)
      VALUES (${other}::uuid, ${foreignEmail}, 'Petra', 'active') RETURNING id
    `);
    const foreign = { id: f!.id, email: foreignEmail };
    const unknown = { id: randomUUID(), email: address('d-unknown') };
    const invalid = { id: 'abc', email: address('d-abc') };
    const out: Record<string, unknown> = {
      setup: { delete: del.status, anonymize: er.status },
    };
    const results: Record<string, Start> = {};
    for (const [name, c] of Object.entries({ live, deleted, erased, foreign, unknown, invalid })) {
      results[name] = await start('ownerKey', c);
      const foreignMails =
        name === 'foreign'
          ? (await mtaOtherQueue.getJobs(ALL, 0, 10_000)).filter(
              (j) => String(j?.data?.toEmail).toLowerCase() === foreignEmail,
            ).length
          : undefined;
      out[name] = {
        ...results[name],
        error: results[name]!.status === 200 ? undefined : errorBody(results[name]!),
        ...(foreignMails === undefined ? {} : { mailsAnyOrg: foreignMails }),
      };
    }
    cells.D = out;
    expect(del.status).toBe(204);
    expect(er.status).toBe(200);
    expect(results.live).toEqual({
      status: 200,
      body: '{"data":{"ok":true}}',
      mails: 1,
      tokens: 1,
    });
    const notFound = {
      status: 404,
      body: '{"code":"NOT_FOUND","message":"Contact not found","statusCode":404}',
      mails: 0,
      tokens: 0,
    };
    for (const name of ['deleted', 'erased', 'foreign', 'unknown'])
      expect(results[name], name).toEqual(notFound);
    expect((out.foreign as { mailsAnyOrg: number }).mailsAnyOrg).toBe(0);
  });

  it('D — `abc` as the contact id: recorded, no e-mail, no token', async () => {
    const r = await inject(
      'POST',
      `/api/v1/contacts/abc/gdpr/doi/${purposes.a.slug}`,
      headersOf.ownerKey!,
      {},
    );
    const mailsAbc = (await mtaOtherQueue.getJobs(ALL, 0, 10_000)).filter(
      (j) => j?.data?.orgId === org && j.data.contactId === 'abc',
    ).length;
    cells.Dabc = { status: r.status, body: hide(r.body), mails: mailsAbc };
    // Not changed here: the uuid cast fails in the contact query (MIMO).
    expect(r.status).toBe(500);
    expect(r.body).toBe(
      '{"code":"INTERNAL_ERROR","message":"Internal server error","statusCode":500}',
    );
    expect(mailsAbc).toBe(0);
  });
});

describe('per-purpose DOI start: three per address and purpose in 24 hours (Z185 L)', () => {
  it('L — five starts for one address and purpose: five identical answers, three e-mails, three tokens', async () => {
    const c = await newContact('l5');
    const warnBefore = warnings.length;
    const answers: Start[] = [];
    for (let i = 0; i < 5; i++) answers.push(await start('ownerKey', c));
    const key = `doi:limit-purpose:${purposes.a.id}:${suppressionEmailHash(c.email.toLowerCase())}`;
    const limitKey = {
      exists: await redis.exists(key),
      type: await redis.type(key),
      members: await redis.zcard(key),
    };
    // The limit key read as a token by the page of the link.
    const asToken = await inject(
      'GET',
      `/public/gdpr/doi/confirm?token=${encodeURIComponent(key.slice('doi:'.length))}`,
      { 'user-agent': PERSON_UA },
    );
    const asTokenTail = await inject(
      'GET',
      `/public/gdpr/doi/confirm?token=${encodeURIComponent(key.slice('doi:limit-purpose:'.length))}`,
      { 'user-agent': PERSON_UA },
    );
    const logs = warnings.slice(warnBefore).map(hide);
    cells.L5 = {
      answers: answers.map((a) => `${a.status} ${a.body}`),
      mails: answers.reduce((s, a) => s + a.mails, 0),
      tokens: await tokensOf(c.id),
      limitKey,
      getLimitKeyAsToken: [asToken.status, asTokenTail.status],
      logs,
    };
    for (const a of answers) {
      expect(a.status).toBe(200);
      expect(a.body).toBe('{"data":{"ok":true}}');
    }
    expect((await mails(c.email, PP_SUBJECT)).length).toBe(3);
    expect(await tokensOf(c.id)).toBe(3);
    expect(answers.map((a) => a.mails)).toEqual([1, 1, 1, 0, 0]);
    expect(limitKey).toEqual({ exists: 1, type: 'zset', members: 3 });
    expect([asToken.status, asTokenTail.status]).toEqual([410, 410]);
    expect(logs).toEqual([
      `[doi] purpose_doi_rate_limited purpose=<uuid> org=<uuid>`,
      `[doi] purpose_doi_rate_limited purpose=<uuid> org=<uuid>`,
    ]);
    for (const l of warnings.slice(warnBefore)) {
      expect(l).not.toContain(c.email);
      expect(l).toContain(`purpose=${purposes.a.id} org=${org}`);
    }
  });

  it('L — three on purpose A and three on purpose B of one contact: six e-mails, six tokens', async () => {
    const c = await newContact('lab');
    const a: Start[] = [];
    const b: Start[] = [];
    for (let i = 0; i < 3; i++) a.push(await start('ownerKey', c, 'a'));
    for (let i = 0; i < 3; i++) b.push(await start('ownerKey', c, 'b'));
    cells.LAB = {
      a: a.map((x) => `${x.status}/${x.mails}/${x.tokens}`),
      b: b.map((x) => `${x.status}/${x.mails}/${x.tokens}`),
      mails: (await mails(c.email, PP_SUBJECT)).length,
      tokens: await tokensOf(c.id),
    };
    expect(cells.LAB).toEqual({
      a: ['200/1/1', '200/1/1', '200/1/1'],
      b: ['200/1/1', '200/1/1', '200/1/1'],
      mails: 6,
      tokens: 6,
    });
  });

  it('L — the same address in capitals on another contact counts against the same limit; a second live contact on one address cannot be made', async () => {
    const c = await newContact('lcase');
    const first: Start[] = [];
    for (let i = 0; i < 3; i++) first.push(await start('ownerKey', c));
    // One live contact per address and org (0036): the route refuses a second.
    const again = await inject('POST', '/api/v1/contacts', headersOf.owner!, { email: c.email });
    const upperAgain = await inject('POST', '/api/v1/contacts', headersOf.owner!, {
      email: c.email.toUpperCase(),
    });
    // The first deleted, a row with the address in capitals as a legacy import
    // left it (the index is on the column as written).
    const del = await inject('DELETE', `/api/v1/contacts/${c.id}`, headersOf.owner!);
    const upper = c.email.toUpperCase();
    const [u] = await rows<{ id: string }>(sql`
      INSERT INTO contacts (org_id, email, first_name, status)
      VALUES (${org}::uuid, ${upper}, 'Petra', 'active') RETURNING id
    `);
    const capital = await start('ownerKey', { id: u!.id, email: upper });
    cells.LCASE = {
      first: first.map((x) => `${x.status}/${x.mails}/${x.tokens}`),
      postSameAddress: `${again.status} ${hide(again.body).slice(0, 160)}`,
      postSameAddressCapitals: `${upperAgain.status} ${hide(upperAgain.body).slice(0, 160)}`,
      delete: del.status,
      capital,
      mailsAnyCase: (await mails(c.email, PP_SUBJECT)).length,
    };
    expect(first.map((x) => `${x.status}/${x.mails}/${x.tokens}`)).toEqual([
      '200/1/1',
      '200/1/1',
      '200/1/1',
    ]);
    expect(again.status).toBe(409);
    expect(upperAgain.status).toBe(409);
    expect(del.status).toBe(204);
    expect(capital).toEqual({ status: 200, body: '{"data":{"ok":true}}', mails: 0, tokens: 0 });
    expect((await mails(c.email, PP_SUBJECT)).length).toBe(3);
  });
});

describe('unchanged (Z185 K)', () => {
  it('K1 — the list DOI: four subscribes, three e-mails; the link, the page and the button confirm', async () => {
    const l = await asOwner('POST', '/api/v1/lists', { name: `${TAG} L`, doubleOptIn: true });
    listIds.push(l.data.id);
    const email = address('k1');
    const answers: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await inject('POST', `/api/v1/lists/${l.data.id}/subscribe`, {}, { email });
      answers.push(`${r.status} ${hide(r.body)}`);
    }
    const jobs = await mails(email, LIST_SUBJECT);
    const href = /<a href="([^"]+)"/.exec(String(jobs[0]?.data.htmlBody ?? ''))?.[1] ?? '';
    const u = new URL(href || 'http://x/');
    const get = await inject('GET', `${u.pathname}${u.search}`, { 'user-agent': PERSON_UA });
    const action =
      /<form method="post" action="([^"]+)">/.exec(get.body)?.[1]?.replace(/&amp;/g, '&') ?? '';
    const post = action
      ? await inject(
          'POST',
          action,
          { 'user-agent': PERSON_UA, 'content-type': 'application/x-www-form-urlencoded' },
          '',
        )
      : null;
    const [c] = await rows<{ status: string }>(sql`
      SELECT status::text AS status FROM contacts WHERE org_id = ${org}::uuid AND email = ${email}
    `);
    const limitKey = `doi:limit:${l.data.id}:${suppressionEmailHash(email.toLowerCase())}`;
    cells.K1 = {
      answers,
      mails: jobs.length,
      href: hide(href),
      get: get.status,
      post: post?.status ?? null,
      status: c?.status,
      limitKey: { type: await redis.type(limitKey), members: await redis.zcard(limitKey) },
    };
    expect(new Set(answers.map((a) => a.split(' ')[0]))).toEqual(new Set(['202']));
    expect(jobs).toHaveLength(3);
    expect(href).toMatch(/\/api\/v1\/confirm\/[0-9a-f-]{36}$/);
    expect(get.status).toBe(200);
    expect(post?.status).toBe(200);
    expect(c?.status).toBe('active');
    expect(cells.K1).toMatchObject({ limitKey: { type: 'zset', members: 3 } });
  });

  it('K2 — the per-purpose button: one e-mail, its link, the button grants true/doi_email', async () => {
    const c = await newContact('k2');
    const s = await start('owner', c);
    const job = (await mails(c.email, PP_SUBJECT)).at(-1);
    const href = /<a href="([^"]+)"/.exec(String(job?.data.htmlBody ?? ''))?.[1] ?? '';
    const u = new URL(href || 'http://x/');
    const get = await inject('GET', `${u.pathname}${u.search}`, { 'user-agent': PERSON_UA });
    const action =
      /<form method="post" action="([^"]+)">/.exec(get.body)?.[1]?.replace(/&amp;/g, '&') ?? '';
    const post = await inject(
      'POST',
      action,
      { 'user-agent': PERSON_UA, 'content-type': 'application/x-www-form-urlencoded' },
      '',
    );
    const consents = (
      await rows<{ granted: boolean; source: string }>(sql`
        SELECT granted, source FROM contact_gdpr_consents
        WHERE org_id = ${org}::uuid AND contact_id = ${c.id}::uuid
      `)
    ).map((r) => `${r.granted}/${r.source}`);
    cells.K2 = { start: s, href: hide(href), get: get.status, post: post.status, consents };
    expect(s).toEqual({ status: 200, body: '{"data":{"ok":true}}', mails: 1, tokens: 1 });
    expect(get.status).toBe(200);
    expect(post.status).toBe(200);
    expect(consents).toEqual(['true/doi_email']);
  });

  it('S4 — unsubscribed, complained, a manual row, an unsubscribe row: recorded, as on master (not changed here)', async () => {
    const unsub = await newContact('s4-unsub');
    const put = await inject('PUT', `/api/v1/contacts/${unsub.id}`, headersOf.owner!, {
      status: 'unsubscribed',
    });
    const complained = await newContact('s4-complained');
    await db.execute(
      sql`UPDATE contacts SET status = 'complained' WHERE id = ${complained.id}::uuid`,
    );
    const sComplaint = await inject('POST', '/api/v1/suppressions', headersOf.owner!, {
      email: complained.email,
      reason: 'complaint',
    });
    const manual = await newContact('s4-manual');
    const sManual = await inject('POST', '/api/v1/suppressions', headersOf.owner!, {
      email: manual.email,
      reason: 'manual',
    });
    const unsubRow = await newContact('s4-unsub-row');
    const sUnsub = await inject('POST', '/api/v1/suppressions', headersOf.owner!, {
      email: unsubRow.email,
      reason: 'unsubscribe',
    });
    const out = {
      setup: {
        put: put.status,
        complaint: sComplaint.status,
        manual: sManual.status,
        unsubscribe: sUnsub.status,
      },
      unsubscribed: await start('ownerKey', unsub),
      complained: await start('ownerKey', complained),
      manual: await start('ownerKey', manual),
      unsubscribeRow: await start('ownerKey', unsubRow),
    };
    cells.S4 = out;
    expect(out.setup).toEqual({ put: 200, complaint: 201, manual: 201, unsubscribe: 201 });
    for (const k of ['unsubscribed', 'complained', 'manual', 'unsubscribeRow'] as const)
      expect(out[k], k).toEqual({
        status: 200,
        body: '{"data":{"ok":true}}',
        mails: 1,
        tokens: 1,
      });
  });
});

describe('cost (Z185 Q, recorded)', () => {
  it('Q — SQL statements and Redis commands of one start', async () => {
    const c = await newContact('q');
    const statements: string[] = [];
    const commands: string[] = [];
    const monitor = await redis.monitor();
    monitor.on('monitor', (_time: string, args: string[]) =>
      commands.push(String(args[0]).toLowerCase()),
    );
    const stop = observeQueries((q) => statements.push(q.replace(/\s+/g, ' ').slice(0, 120)));
    let status = 0;
    try {
      status = (
        await inject(
          'POST',
          `/api/v1/contacts/${c.id}/gdpr/doi/${purposes.a.slug}`,
          headersOf.ownerKey!,
          {},
        )
      ).status;
    } finally {
      stop();
      await new Promise((r) => setTimeout(r, 300));
      monitor.disconnect();
    }
    const histogram: Record<string, number> = {};
    for (const cmd of commands) histogram[cmd] = (histogram[cmd] ?? 0) + 1;
    cells.Q = {
      note: 'the request alone; Redis MONITOR sees every client of the server (rate limit, BullMQ)',
      status,
      sql: statements.length,
      statements: statements.map(hide),
      redis: histogram,
    };
    expect(status).toBe(200);
  });
});
