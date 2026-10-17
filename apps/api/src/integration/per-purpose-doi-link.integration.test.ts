/**
 * The per-purpose GDPR double opt-in can be confirmed from its own e-mail, and
 * after the button it goes only where the organisation said when it started
 * the confirmation (Z184, Zásobník e-mail 5 = Z176 MIMO 1 and MIMO 5).
 *
 * ─── What was wrong (measured on master 13a0b46, Z184 Sonda 1–3) ─────────────
 *
 * The confirmation e-mail ("Potvrzení souhlasu — <účel>") linked to
 * APP_BASE_URL/gdpr/doi/confirm. No such page exists, neither on the API nor in
 * the web app, so the link answered 404 and the consent the law asks for could
 * not be given by the person it belongs to; the route with the button
 * (/public/gdpr/doi/confirm) was reachable only by typing it.
 *
 * And the `redirect` query parameter was taken from the URL as it came: the
 * page put it into its form, and the button answered 303 to it — so anyone
 * could rewrite a link to go, after a real confirmation, to a page of their
 * choosing under our domain. Without it the button answered 303 to
 * APP_BASE_URL/gdpr/confirmed, which does not exist either. `redirectUrl` in
 * the body of the start was put into the e-mail's link unchecked.
 *
 * ─── How it is measured ──────────────────────────────────────────────────────
 *
 * The real app, database and Redis; no worker runs in this process, so "the
 * e-mail" is the confirmation's job on the mta-other queue and the link is read
 * out of its HTML and its text. An organisation of this file (INSERT), its
 * owner session from POST /me/orgs/switch, its own API key for the starts, and
 * this file's own address for the public routes.
 *
 *   L   the link: its URL in the e-mail; GET of exactly that link;
 *   C   a person: GET the link from the e-mail, press the button — without a
 *       target, and with the organisation's target;
 *   R   `redirect` in the query of the page and of the button; a start with a
 *       redirectUrl that is not an absolute http(s) URL;
 *   K   unchanged: the list DOI e-mail, page and button; an unknown token;
 *       opening the per-purpose link grants nothing;
 *   Q   SQL statements and Redis commands of one start and one confirmation.
 *
 * Everything measured is printed as `Z184_API_CELLS_JSON …` chunks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import type { JobType } from 'bullmq';
import { resolveLocale, t } from '@forgemsg/shared';
import { redis } from '@forgemsg/shared/redis';
import { login, SEED, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { mtaOtherQueue } from '../lib/queues.js';
import { observeQueries } from '../db/explain-guard.js';

const { buildApp } = await import('../index.js');

const TAG = `z184-${randomUUID().slice(0, 8)}`;
const DOMAIN = `${TAG}.test`;
const octet = () => 1 + Math.floor(Math.random() * 250);
// This file's own address: its own rate-limit buckets.
const IP = `100.64.184.${octet()}`;
const ALL: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active', 'completed'];
const SCANNER_UA = 'Mozilla/5.0 (compatible; MSOffice 16; Microsoft Outlook 16.0; ms-office)';
const PERSON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';
/** The base the list DOI builds its link from (services/subscriptions/doi.ts). */
const BASE = process.env.API_PUBLIC_URL ?? process.env.APP_URL ?? 'http://localhost:3001';
const TARGET = 'https://example.org/dik';
const EVIL = 'https://evil.example';
const PP_SUBJECT = /^Potvrzení souhlasu/;
/** The page a list DOI shows after the button when the list has no thank-you URL. */
const CONFIRMED_HEADING = t(
  'doi_confirmed_page.heading',
  resolveLocale({ orgLocale: null, contactLocale: null, acceptLanguage: null }),
);

let app: FastifyInstance;
let seedSession: Session;
let seedOrgId = '';
let org = '';
let owner: Record<string, string> = {};
let apiKey: Record<string, string> = {};
let seedBefore: Record<string, unknown> = {};
let slug = '';
const rawKeys: string[] = [];
const listIds: string[] = [];
const report: Record<string, unknown> = {
  tag: TAG,
  base: BASE,
  mock: 'none — the real app, database and Redis; no worker runs in this process, the e-mail is the mta-other job',
};
const cells: Record<string, unknown> = {};
let n = 0;

const rows = async <T>(q: SQL) => (await db.execute(q)) as unknown as T[];
const address = (label: string) => `${label}-${n++}-${TAG}@${DOMAIN}`;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const hide = (s: string | null) =>
  s?.replace(/[0-9a-f]{64}/g, '<token>').replace(/[0-9a-f-]{36}/g, '<uuid>') ?? null;

const rateLimitWaits: { url: string; retryAfterS: number }[] = [];

interface Res {
  status: number;
  body: string;
  contentType: string | null;
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
      rateLimitWaits.push({ url: url.split('?')[0]!, retryAfterS });
      await new Promise((r) => setTimeout(r, (retryAfterS + 1) * 1000));
      continue;
    }
    const ct = res.headers['content-type'];
    const loc = res.headers['location'];
    return {
      status: res.statusCode,
      body: res.body,
      contentType: typeof ct === 'string' ? ct : null,
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
           (SELECT count(*)::int FROM lists WHERE org_id = ${seedOrgId}::uuid) AS lists,
           (SELECT count(*)::int FROM contact_lists cl JOIN contacts c ON c.id = cl.contact_id WHERE c.org_id = ${seedOrgId}::uuid) AS memberships,
           (SELECT count(*)::int FROM consent_events WHERE org_id = ${seedOrgId}::uuid) AS consent_events,
           (SELECT count(*)::int FROM contact_gdpr_consents WHERE org_id = ${seedOrgId}::uuid) AS gdpr_consents,
           (SELECT count(*)::int FROM processing_purposes WHERE org_id = ${seedOrgId}::uuid) AS purposes,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${seedOrgId}::uuid) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${seedOrgId}::uuid) AS api_keys
  `);
  return r!;
}

async function newContact(label: string): Promise<{ id: string; email: string }> {
  const email = address(label);
  const c = await asOwner('POST', '/api/v1/contacts', { email, firstName: 'Petra' });
  return { id: c.data.id, email };
}

/** The confirmation e-mails queued for `email`, oldest first. */
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

interface Mail {
  count: number;
  href: string | null;
  textUrl: string | null;
  token: string;
}

/** Start the confirmation for `contactId` with the org's API key, and read the e-mail. */
async function start(contact: { id: string; email: string }, body: Record<string, unknown> = {}) {
  const answer = await inject(
    'POST',
    `/api/v1/contacts/${contact.id}/gdpr/doi/${slug}`,
    apiKey,
    body,
  );
  const jobs = await mails(contact.email, PP_SUBJECT);
  const last = jobs.at(-1);
  const href = /<a href="([^"]+)"/.exec(String(last?.data.htmlBody ?? ''))?.[1] ?? null;
  const textUrl = /kliknutím na odkaz: (\S+)/.exec(String(last?.data.textBody ?? ''))?.[1] ?? null;
  const mail: Mail = {
    count: jobs.length,
    href,
    textUrl,
    token: /token=([0-9a-f]{64})/.exec(href ?? '')?.[1] ?? '',
  };
  return { answer, mail };
}

/** A link as a request path: what the browser asks the host for. */
const pathOf = (href: string) => {
  const u = new URL(href);
  return `${u.pathname}${u.search}`;
};

const page = (r: Res) => ({
  status: r.status,
  contentType: r.contentType,
  location: r.location,
  form: hide(/<form[^>]*>/i.exec(r.body)?.[0] ?? null),
  confirmedPage: r.body.includes(CONFIRMED_HEADING),
});

/** A person: opens `path`, presses the button if the page has one (its own action). */
async function person(path: string, actionOverride?: (action: string) => string) {
  const get = await inject('GET', path, { 'user-agent': PERSON_UA });
  const formAction = /<form method="post" action="([^"]+)">/
    .exec(get.body)?.[1]
    ?.replace(/&amp;/g, '&');
  const action = formAction && actionOverride ? actionOverride(formAction) : formAction;
  const post = action
    ? await inject(
        'POST',
        action,
        { 'user-agent': PERSON_UA, 'content-type': 'application/x-www-form-urlencoded' },
        '',
      )
    : null;
  return {
    get: page(get),
    action: hide(action ?? null),
    post: post ? page(post) : null,
  };
}

async function consentsOf(contactId: string): Promise<string[]> {
  return (
    await rows<{ granted: boolean; source: string }>(sql`
      SELECT granted, source FROM contact_gdpr_consents
      WHERE org_id = ${org}::uuid AND contact_id = ${contactId}::uuid ORDER BY granted_at
    `)
  ).map((r) => `${r.granted}/${r.source}`);
}

const stored = async (token: string) => (await redis.exists(`doi:purpose:${token}`)) === 1;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  seedSession = await login(app);
  seedOrgId = seedSession.orgId;
  seedBefore = await seedState();

  const [o] = await rows<{ id: string }>(sql`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`${TAG} org`}, ${TAG}, 'production', 'Obchod z184 s.r.o.', 'Nádražní 1, 110 00 Praha')
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
  const k = await asOwner('POST', '/api/v1/api-keys', { name: `${TAG} key` });
  const rawKey = (k.data as unknown as { rawKey: string }).rawKey;
  apiKey = { 'x-api-key': rawKey };
  // The sessions' and the key's own rate-limit buckets are removed at the end.
  rawKeys.push(ownerToken, seedSession.token, rawKey);
  slug = `${TAG}-souhlas`;
  await asOwner('POST', '/api/v1/gdpr/purposes', {
    slug,
    name: `${TAG} souhlas`,
    legalBasis: 'consent',
  });
}, 120_000);

afterAll(async () => {
  let jobsRemoved = 0;
  for (const j of await mtaOtherQueue.getJobs(ALL, 0, 10_000)) {
    if (j?.data?.orgId === org) {
      await j.remove().catch(() => {});
      jobsRemoved++;
    }
  }
  // Per-purpose and list confirmation tokens of this org, limit keys of its lists.
  const doiKeys = async (remove: boolean) => {
    let found = 0;
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:*', 'COUNT', 1000);
      cursor = next;
      for (const key of keys) {
        let mine = false;
        if (key.startsWith('doi:limit:'))
          mine = listIds.some((id) => key.startsWith(`doi:limit:${id}:`));
        else if ((await redis.type(key)) === 'string')
          mine = !!(await redis.get(key))?.includes(org);
        if (!mine) continue;
        found++;
        if (remove) await redis.del(key);
      }
    } while (cursor !== '0');
    return found;
  };
  const doiKeysRemoved = org ? await doiKeys(true) : 0;
  let limitKeysRemoved = 0;
  const digests = rawKeys.map((k) => createHash('sha256').update(k).digest('hex').slice(0, 32));
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
    await db.execute(sql`DELETE FROM contact_gdpr_consents WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM audit_logs WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM api_keys WHERE org_id = ${org}::uuid`);
    // Everything else of the organisation goes with it (ON DELETE CASCADE).
    await db.execute(sql`DELETE FROM organizations WHERE id = ${org}::uuid`);
  }
  const [left] = await rows<Record<string, number>>(sql`
    SELECT (SELECT count(*)::int FROM organizations WHERE id = ${org}::uuid) AS orgs,
           (SELECT count(*)::int FROM contacts WHERE org_id = ${org}::uuid) AS contacts,
           (SELECT count(*)::int FROM lists WHERE org_id = ${org}::uuid) AS lists,
           (SELECT count(*)::int FROM consent_events WHERE org_id = ${org}::uuid) AS consent_events,
           (SELECT count(*)::int FROM contact_gdpr_consents WHERE org_id = ${org}::uuid) AS gdpr_consents,
           (SELECT count(*)::int FROM processing_purposes WHERE org_id = ${org}::uuid) AS purposes,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${org}::uuid) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${org}::uuid) AS api_keys
  `);
  const doiKeysLeft = org ? await doiKeys(false) : 0;
  const seedAfter = await seedState();
  report.cells = cells;
  report.rateLimitWaits = rateLimitWaits;
  report.leftover = { ...left, doiKeysLeft, doiKeysRemoved, limitKeysRemoved, jobsRemoved };
  report.seedOrg = { before: seedBefore, after: seedAfter };
  const all = JSON.stringify(report);
  const parts = Math.ceil(all.length / 3000);
  for (let i = 0; i < parts; i++)
    console.log(
      `Z184_API_CELLS_JSON ${String(i).padStart(4, '0')}/${parts} ${all.slice(i * 3000, (i + 1) * 3000)}`,
    );
  await app.close();
  expect(left, 'what this file made was not all removed').toEqual({
    orgs: 0,
    contacts: 0,
    lists: 0,
    consent_events: 0,
    gdpr_consents: 0,
    purposes: 0,
    members: 0,
    api_keys: 0,
  });
  expect(doiKeysLeft).toBe(0);
  expect(seedAfter, 'the seed organisation changed').toEqual(seedBefore);
}, 120_000);

describe('per-purpose DOI — the e-mail link leads to the button (Z184 L, C)', () => {
  it('L — the link in the e-mail is the API page; GET of exactly that link is the page with the button and grants nothing', async () => {
    const c = await newContact('l');
    const { answer, mail } = await start(c);
    const get = mail.href
      ? await inject('GET', pathOf(mail.href), { 'user-agent': SCANNER_UA })
      : null;
    const afterGet = { consents: await consentsOf(c.id), stored: await stored(mail.token) };
    cells.L = {
      start: answer.status,
      mails: mail.count,
      href: hide(mail.href),
      textUrl: hide(mail.textUrl),
      get: get ? page(get) : null,
      afterGet,
    };
    expect(answer.status, answer.body).toBe(200);
    expect(mail.count).toBe(1);
    expect(mail.token).toMatch(/^[0-9a-f]{64}$/);
    expect(mail.href).toBe(`${BASE}/public/gdpr/doi/confirm?token=${mail.token}`);
    expect(mail.textUrl).toBe(mail.href);
    expect(get?.status).toBe(200);
    expect(page(get!).form).toBe(
      `<form method="post" action="/public/gdpr/doi/confirm?token=<token>">`,
    );
    expect(afterGet, 'opening the link granted the consent').toEqual({
      consents: [],
      stored: true,
    });
  });

  it('C — a person: the link from the e-mail, the button; without a target the API answers the confirmed page', async () => {
    const c = await newContact('c');
    const { mail } = await start(c);
    const p = mail.href ? await person(pathOf(mail.href)) : null;
    const after = { consents: await consentsOf(c.id), stored: await stored(mail.token) };
    // The same through the route itself, with the query the e-mail carries.
    const cd = await newContact('c-direct');
    const sd = await start(cd);
    const direct = await person(`/public/gdpr/doi/confirm${new URL(sd.mail.href!).search}`);
    const afterDirect = { consents: await consentsOf(cd.id), stored: await stored(sd.mail.token) };
    const again = await inject('POST', `/public/gdpr/doi/confirm?token=${sd.mail.token}`, {});
    cells.C = { fromMail: p, after, direct, afterDirect, again: page(again) };
    expect(p?.get.status).toBe(200);
    expect(p?.post?.status).toBe(200);
    expect(p?.post?.contentType).toMatch(/^text\/html/);
    expect(p?.post?.location).toBeNull();
    expect(p?.post?.confirmedPage).toBe(true);
    expect(after).toEqual({ consents: ['true/doi_email'], stored: false });
    expect(direct.post?.status).toBe(200);
    expect(direct.post?.location).toBeNull();
    expect(direct.post?.confirmedPage).toBe(true);
    expect(afterDirect).toEqual({ consents: ['true/doi_email'], stored: false });
    expect(again.status).toBe(410);
  });

  it("CT — with the organisation's target the button answers 303 to it", async () => {
    const c = await newContact('ct');
    const { answer, mail } = await start(c, { redirectUrl: TARGET });
    // The query the e-mail carries, on the route of the page.
    const p = await person(`/public/gdpr/doi/confirm${new URL(mail.href!).search}`);
    const after = { consents: await consentsOf(c.id), stored: await stored(mail.token) };
    cells.CT = { start: answer.status, mails: mail.count, href: hide(mail.href), person: p, after };
    expect(answer.status, answer.body).toBe(200);
    expect(mail.count).toBe(1);
    expect(p.post?.status).toBe(303);
    expect(p.post?.location).toBe(TARGET);
    expect(after).toEqual({ consents: ['true/doi_email'], stored: false });
  });
});

describe('per-purpose DOI — redirect only to the target stored at the start (Z184 R)', () => {
  it('R1 — no target: `redirect` in the query of the page and of the button is ignored', async () => {
    const c = await newContact('r1');
    const { mail } = await start(c);
    const withEvil = `/public/gdpr/doi/confirm?token=${mail.token}&redirect=${encodeURIComponent(EVIL)}`;
    const get = await inject('GET', withEvil, { 'user-agent': PERSON_UA });
    const post = await inject(
      'POST',
      withEvil,
      { 'user-agent': PERSON_UA, 'content-type': 'application/x-www-form-urlencoded' },
      '',
    );
    const after = { consents: await consentsOf(c.id), stored: await stored(mail.token) };
    cells.R1 = { get: page(get), post: page(post), after };
    expect(page(get).form).toBe(
      `<form method="post" action="/public/gdpr/doi/confirm?token=<token>">`,
    );
    expect(post.status).toBe(200);
    expect(post.location).toBeNull();
    expect(page(post).confirmedPage).toBe(true);
    expect(after).toEqual({ consents: ['true/doi_email'], stored: false });
  });

  it("R2 — the organisation's target: another `redirect` in the query is ignored, the button goes to the target", async () => {
    const c = await newContact('r2');
    const { mail } = await start(c, { redirectUrl: TARGET });
    const p = await person(
      `/public/gdpr/doi/confirm?token=${mail.token}&redirect=${encodeURIComponent(EVIL)}`,
      (action) => `${action.split('&redirect=')[0]}&redirect=${encodeURIComponent(EVIL)}`,
    );
    const after = { consents: await consentsOf(c.id), stored: await stored(mail.token) };
    cells.R2 = { person: p, after };
    expect(p.post?.status).toBe(303);
    expect(p.post?.location).toBe(TARGET);
    expect(after).toEqual({ consents: ['true/doi_email'], stored: false });
  });

  it('R3 — a start with a redirectUrl that is not an absolute http(s) URL: 400, no e-mail, no token', async () => {
    const shapes = ['javascript:alert(1)', '//evil.example', '/relativni', 'ftp://x'];
    const out: Record<string, unknown> = {};
    for (const redirectUrl of shapes) {
      const c = await newContact('r3');
      const { answer, mail } = await start(c, { redirectUrl });
      out[redirectUrl] = {
        status: answer.status,
        code: answer.status >= 400 ? (JSON.parse(answer.body) as { code?: string }).code : null,
        mails: mail.count,
        tokens: await tokensOf(c.id),
        href: hide(mail.href),
      };
    }
    // An absolute http: URL is a target like https:.
    const ch = await newContact('r3-http');
    const http = await start(ch, { redirectUrl: 'http://example.org/dik' });
    out['http://example.org/dik'] = {
      status: http.answer.status,
      mails: http.mail.count,
      tokens: await tokensOf(ch.id),
    };
    cells.R3 = out;
    for (const redirectUrl of shapes)
      expect(out[redirectUrl], redirectUrl).toEqual({
        status: 400,
        code: 'INVALID_REDIRECT_URL',
        mails: 0,
        tokens: 0,
        href: null,
      });
    expect(out['http://example.org/dik']).toEqual({ status: 200, mails: 1, tokens: 1 });
  });
});

describe('unchanged (Z184 K)', () => {
  it('K1 — the list DOI: one e-mail, its link, the page, the button confirms', async () => {
    const l = await asOwner('POST', '/api/v1/lists', { name: `${TAG} L`, doubleOptIn: true });
    listIds.push(l.data.id);
    const email = address('k1');
    const sub = await inject('POST', `/api/v1/lists/${l.data.id}/subscribe`, {}, { email });
    const jobs = await mails(email, /^Confirm your subscription to /);
    const href = /<a href="([^"]+)"/.exec(String(jobs.at(-1)?.data.htmlBody ?? ''))?.[1] ?? '';
    const p = await person(pathOf(href));
    const [c] = await rows<{ status: string }>(sql`
      SELECT status::text AS status FROM contacts WHERE org_id = ${org}::uuid AND lower(email) = lower(${email})
    `);
    cells.K1 = {
      subscribe: sub.status,
      mails: jobs.length,
      href: hide(href),
      person: p,
      status: c?.status,
    };
    expect(sub.status).toBe(202);
    expect(jobs).toHaveLength(1);
    expect(href).toMatch(new RegExp(`^${BASE}/api/v1/confirm/[0-9a-f-]{36}$`));
    expect(p.get.status).toBe(200);
    expect(p.post?.status).toBe(200);
    expect(p.post?.confirmedPage).toBe(true);
    expect(c?.status).toBe('active');
  });

  it('K2 — an unknown token: 410 on the page and on the button', async () => {
    const unknown = randomBytes(32).toString('hex');
    const get = await inject('GET', `/public/gdpr/doi/confirm?token=${unknown}`, {});
    const post = await inject('POST', `/public/gdpr/doi/confirm?token=${unknown}`, {});
    cells.K2 = { get: get.status, post: post.status };
    expect(get.status).toBe(410);
    expect(post.status).toBe(410);
  });

  it('K3 — GET and HEAD of the per-purpose route without the button grant nothing', async () => {
    const c = await newContact('k3');
    const { mail } = await start(c);
    const url = `/public/gdpr/doi/confirm?token=${mail.token}`;
    const get = await inject('GET', url, { 'user-agent': SCANNER_UA });
    const head = await inject('HEAD', url, { 'user-agent': SCANNER_UA });
    const after = { consents: await consentsOf(c.id), stored: await stored(mail.token) };
    cells.K3 = { get: get.status, head: head.status, after };
    expect(get.status).toBe(200);
    expect(head.status).toBe(200);
    expect(after).toEqual({ consents: [], stored: true });
  });
});

describe('cost (Z184 Q, recorded)', () => {
  it('Q — SQL statements and Redis commands of one start and one confirmation', async () => {
    const c = await newContact('q');
    const measure = async (fn: () => Promise<unknown>) => {
      const statements: string[] = [];
      const commands: string[] = [];
      const monitor = await redis.monitor();
      monitor.on('monitor', (_time: string, args: string[]) =>
        commands.push(String(args[0]).toLowerCase()),
      );
      const stop = observeQueries((q) => statements.push(q.replace(/\s+/g, ' ').slice(0, 120)));
      try {
        await fn();
      } finally {
        stop();
        await new Promise((r) => setTimeout(r, 300));
        monitor.disconnect();
      }
      const histogram: Record<string, number> = {};
      for (const cmd of commands) histogram[cmd] = (histogram[cmd] ?? 0) + 1;
      return { sql: statements.length, statements: statements.map(hide), redis: histogram };
    };
    const startCost = await measure(() =>
      inject('POST', `/api/v1/contacts/${c.id}/gdpr/doi/${slug}`, apiKey, {}),
    );
    const jobs = await mails(c.email, PP_SUBJECT);
    const token = /token=([0-9a-f]{64})/.exec(String(jobs.at(-1)?.data.htmlBody ?? ''))?.[1] ?? '';
    const confirmCost = await measure(() =>
      inject(
        'POST',
        `/public/gdpr/doi/confirm?token=${token}`,
        { 'content-type': 'application/x-www-form-urlencoded' },
        '',
      ),
    );
    cells.Q = {
      note: 'the request alone; Redis MONITOR sees every client of the server (rate limit, BullMQ)',
      start: startCost,
      confirm: confirmCost,
    };
    expect(await consentsOf(c.id)).toEqual(['true/doi_email']);
  });
});
