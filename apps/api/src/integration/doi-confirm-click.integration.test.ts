/**
 * A double opt-in is confirmed by the person pressing a button, not by the link
 * being opened (Z176, položka 7). The routes, the rows and the answers; the
 * whole path to a campaign is in apps/workers/src/integration/doi-confirm-click.
 *
 * ─── What was wrong (measured on master 022655a, Z176 Sonda 1–5) ─────────────
 *
 * GET /api/v1/confirm/:token confirmed on the spot: resubscribeContact, the
 * list row, the token deleted. Mail security scanners (Outlook Safe Links,
 * company gateways, prefetch) open every link in a message before the person
 * does — a GET with a scanner's User-Agent and no cookies made the contact
 * active, wrote a double_opt_in consent event with the scanner's User-Agent as
 * its proof, and lifted an earlier unsubscribe. HEAD did the same: Fastify
 * answers HEAD from the GET handler. The per-purpose GDPR confirmation (GET
 * /public/gdpr/doi/confirm) granted the consent the same way.
 *
 * And POST /api/v1/lists/:listId/subscribe answered with `_devToken` and
 * `_confirmUrl` outside production — also over the limit of three — and logged
 * the token with the address (`doi_token_generated`).
 *
 * ─── How it is measured ──────────────────────────────────────────────────────
 *
 * The real app (buildApp with a log stream this file reads), database and
 * Redis; no worker runs in this process, so "the e-mail" is the confirmation's
 * job on the mta-other queue and the link is read out of its HTML — never out
 * of the API's answer. An organisation of this file (INSERT), the owner session
 * from POST /me/orgs/switch; the public routes from this file's own address.
 *
 *   D   the subscribe answer and its log line, under the limit and over it;
 *   G   GET of the link by a scanner; H HEAD; G2 GET twice;
 *   U   an unsubscribed contact signs up again, a scanner opens the link;
 *   K   a person opens the link and presses the button (master: the GET is
 *       the confirmation and there is no button — the same steps, the same end);
 *   KT  the same with the list's thank-you URL; KF through a signup form;
 *   E   an unknown token;
 *   PP  the per-purpose GDPR confirmation.
 *
 * Everything measured is printed as `Z176_API_CELLS_JSON …` chunks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Writable } from 'node:stream';
import { createHash, randomUUID } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import type { JobType } from 'bullmq';
import { createTrackingToken } from '@forgemsg/shared';
import { redis } from '@forgemsg/shared/redis';
import { login, SEED, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { mtaOtherQueue } from '../lib/queues.js';

const { buildApp } = await import('../index.js');

const TAG = `z176-${randomUUID().slice(0, 8)}`;
const DOMAIN = `${TAG}.test`;
const octet = () => 1 + Math.floor(Math.random() * 250);
// This file's own address: its own rate-limit buckets.
const IP = `100.64.176.${octet()}`;
const ALL: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active', 'completed'];
/** What a mail security scanner sends when it opens a link ahead of the person. */
const SCANNER_UA = 'Mozilla/5.0 (compatible; MSOffice 16; Microsoft Outlook 16.0; ms-office)';
const PERSON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';
const THANK_YOU = `https://example.test/dekujeme-${TAG}`;
const MESSAGE = 'Confirmation email sent. Please check your inbox.';

let app: FastifyInstance;
const logLines: string[] = [];
let seedSession: Session;
let seedOrgId = '';
let org = '';
let owner: Record<string, string> = {};
let seedBefore: Record<string, unknown> = {};
const rawKeys: string[] = [];
const listIds: string[] = [];
const report: Record<string, unknown> = {
  tag: TAG,
  scannerUserAgent: SCANNER_UA,
  personUserAgent: PERSON_UA,
  mock: 'none — the real app, database and Redis; no worker runs in this process',
};
const cells: Record<string, unknown> = {};
let n = 0;
let L = '';
let LT = '';
let formId = '';

const rows = async <T>(q: SQL) => (await db.execute(q)) as unknown as T[];
const address = (label: string) => `${label}-${n++}-${TAG}@${DOMAIN}`;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Windows this file waited out on a 429 — the limit is honoured, not lifted. */
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
      rateLimitWaits.push({
        url: url.split('?')[0]!.replace(/[0-9a-f-]{36}/g, ':id'),
        retryAfterS,
      });
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
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId}::uuid AND email_hash IS NOT NULL) AS hash_rows,
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

async function newList(name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const b = await asOwner('POST', '/api/v1/lists', {
    name: `${TAG} ${name}`,
    doubleOptIn: true,
    ...extra,
  });
  listIds.push(b.data.id);
  return b.data.id;
}

async function contactIdOf(email: string): Promise<string | null> {
  const [r] = await rows<{ id: string }>(sql`
    SELECT id FROM contacts WHERE org_id = ${org}::uuid AND lower(email) = lower(${email})
  `);
  return r?.id ?? null;
}

interface Link {
  path: string | null;
  token: string | null;
}

/** The link in the confirmation e-mail queued for `email` (the newest one). */
async function mailedLink(email: string): Promise<Link> {
  const jobs = (await mtaOtherQueue.getJobs(ALL, 0, 10_000))
    .filter(
      (j) =>
        j?.data?.orgId === org &&
        j.data.toEmail?.toLowerCase() === email.toLowerCase() &&
        /^Confirm your subscription to /.test(j.data.subject),
    )
    .sort((a, b) => a.timestamp - b.timestamp);
  const html = String(jobs.at(-1)?.data.htmlBody ?? '');
  const path = /href="[^"]*?(\/api\/v1\/confirm\/[0-9a-f-]{36})"/.exec(html)?.[1] ?? null;
  return { path, token: path ? path.slice('/api/v1/confirm/'.length) : null };
}

interface State {
  status: string;
  consent: string[];
  row: string;
  token: boolean | null;
  suppressions: string[];
}

/** What the confirmation writes: the contact, its proof, its list row, the token. */
async function stateOf(email: string, listId: string, token: string | null): Promise<State> {
  const id = await contactIdOf(email);
  const [c] = id
    ? await rows<{ status: string }>(
        sql`SELECT status::text AS status FROM contacts WHERE id = ${id}::uuid`,
      )
    : [];
  const consent = id
    ? await rows<{ type: string; source: string; ip: boolean; ua: string | null }>(sql`
        SELECT event_type::text AS type, source, ip_hash IS NOT NULL AS ip, user_agent AS ua
        FROM consent_events WHERE org_id = ${org}::uuid AND contact_id = ${id}::uuid
        ORDER BY occurred_at
      `)
    : [];
  const [row] = id
    ? await rows<{ confirmed: boolean; unsub: boolean }>(sql`
        SELECT confirmed_at IS NOT NULL AS confirmed, unsubscribed_at IS NOT NULL AS unsub
        FROM contact_lists WHERE contact_id = ${id}::uuid AND list_id = ${listId}::uuid
      `)
    : [];
  const supp = await rows<{ reason: string }>(sql`
    SELECT reason::text AS reason FROM suppressions
    WHERE org_id = ${org}::uuid AND lower(email) = lower(${email}) ORDER BY reason
  `);
  return {
    status: c?.status ?? 'no contact',
    consent: consent.map((e) => `${e.type}/${e.source}/ip:${e.ip}/ua:${e.ua ?? '-'}`),
    row: row ? `confirmed:${row.confirmed} unsub:${row.unsub}` : 'no row',
    token: token ? (await redis.exists(`doi:${token}`)) === 1 : null,
    suppressions: supp.map((s) => s.reason),
  };
}

/** The answer as a page: what a browser (or a scanner) gets. */
const page = (r: Res) => ({
  status: r.status,
  contentType: r.contentType,
  location: r.location,
  form: /<form[^>]*>/i.exec(r.body)?.[0] ?? null,
  script: /<script/i.test(r.body),
});

async function signUp(label: string, listId: string) {
  const email = address(label);
  const r = await inject('POST', `/api/v1/lists/${listId}/subscribe`, {}, { email });
  return { email, answer: r, link: await mailedLink(email) };
}

/**
 * A person: opens the link, and presses the button if the page has one — the
 * form's own action, an empty form body (or none, `bodyless`), the browser's
 * User-Agent and no cookie. On master the GET is already the confirmation and
 * there is no button.
 */
async function person(path: string, bodyless = false) {
  const get = await inject('GET', path, { 'user-agent': PERSON_UA });
  const action = /<form method="post" action="([^"]+)">/
    .exec(get.body)?.[1]
    ?.replace(/&amp;/g, '&');
  const post = action
    ? bodyless
      ? await inject('POST', action, { 'user-agent': PERSON_UA })
      : await inject(
          'POST',
          action,
          { 'user-agent': PERSON_UA, 'content-type': 'application/x-www-form-urlencoded' },
          '',
        )
    : null;
  return { get: page(get), post: post ? page(post) : null, last: post ?? get };
}

beforeAll(async () => {
  const sink = new Writable({
    write(chunk, _enc, cb) {
      for (const line of chunk.toString().split('\n')) if (line.trim()) logLines.push(line);
      cb();
    },
  });
  // The real app with its real logger, writing where this file can read it.
  app = await buildApp({ loggerStream: sink });
  await app.ready();
  seedSession = await login(app);
  seedOrgId = seedSession.orgId;
  seedBefore = await seedState();

  const [o] = await rows<{ id: string }>(sql`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`${TAG} org`}, ${TAG}, 'production', 'Obchod z176 s.r.o.', 'Nádražní 1, 110 00 Praha')
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
  L = await newList('L');
  LT = await newList('LT', { thankYouUrl: THANK_YOU });
  const f = await asOwner('POST', '/api/v1/signup-forms', {
    name: `${TAG} form`,
    listId: L,
    fields: [{ name: 'email', label: 'E-mail', type: 'email', required: true }],
    config: { doubleOptIn: true },
  });
  formId = f.data.id;
}, 120_000);

afterAll(async () => {
  let jobsRemoved = 0;
  for (const j of await mtaOtherQueue.getJobs(ALL, 0, 10_000)) {
    if (j?.data?.orgId === org) {
      await j.remove().catch(() => {});
      jobsRemoved++;
    }
  }
  // Confirmation tokens and per-purpose tokens of this org, limit keys of its lists.
  const doiKeys = async (remove: boolean) => {
    let found = 0;
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:*', 'COUNT', 1000);
      cursor = next;
      for (const k of keys) {
        let mine = false;
        if (k.startsWith('doi:limit:'))
          mine = listIds.some((id) => k.startsWith(`doi:limit:${id}:`));
        else if ((await redis.type(k)) === 'string') mine = !!(await redis.get(k))?.includes(org);
        if (!mine) continue;
        found++;
        if (remove) await redis.del(k);
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
      for (const k of keys) {
        await redis.del(k);
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
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${org}::uuid) AS suppressions,
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
      `Z176_API_CELLS_JSON ${String(i).padStart(4, '0')}/${parts} ${all.slice(i * 3000, (i + 1) * 3000)}`,
    );
  await app.close();
  expect(left, 'what this file made was not all removed').toEqual({
    orgs: 0,
    contacts: 0,
    suppressions: 0,
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

describe('double opt-in — the button confirms, opening the link does not (Z176)', () => {
  it('D — the subscribe answer carries no token, under the limit and over it; the log line names the list only', async () => {
    const email = address('d');
    const answers: { status: number; keys: string[]; message: unknown }[] = [];
    const before = logLines.length;
    for (let i = 0; i < 4; i++) {
      const r = await inject('POST', `/api/v1/lists/${L}/subscribe`, {}, { email });
      const data = (JSON.parse(r.body) as { data?: Record<string, unknown> }).data ?? {};
      answers.push({ status: r.status, keys: Object.keys(data).sort(), message: data.message });
    }
    const tokens = (await mtaOtherQueue.getJobs(ALL, 0, 10_000))
      .filter((j) => j?.data?.orgId === org && j.data.toEmail === email)
      .map((j) => /\/api\/v1\/confirm\/([0-9a-f-]{36})/.exec(String(j.data.htmlBody))?.[1] ?? '');
    const generated = logLines.slice(before).filter((l) => l.includes('doi_token_generated'));
    const parsed = generated.map((l) => JSON.parse(l) as Record<string, unknown>);
    const cell = {
      answers,
      mailsQueued: tokens.length,
      log: {
        lines: generated.length,
        withToken: generated.filter((l) => tokens.some((t) => t && l.includes(t))).length,
        withAddress: generated.filter((l) => l.toLowerCase().includes(email.toLowerCase())).length,
        fields: [...new Set(parsed.flatMap((p) => Object.keys(p)))].sort(),
        listIds: [...new Set(parsed.map((p) => p.listId))],
      },
    };
    cells.D = cell;
    expect(cell.mailsQueued, 'three confirmations, the fourth over the limit').toBe(3);
    for (const a of answers) {
      expect(a.status).toBe(202);
      expect(a.keys, 'the answer carries more than the message').toEqual(['message']);
      expect(a.message).toBe(MESSAGE);
    }
    expect(cell.log.lines).toBe(4);
    expect(cell.log.withToken, 'a confirmation token in the log').toBe(0);
    expect(cell.log.withAddress, 'the address in the log').toBe(0);
    expect(cell.log.fields).not.toContain('token');
    expect(cell.log.fields).not.toContain('email');
    expect(cell.log.listIds).toEqual([L]);
  });

  it('G — a scanner opens the link (GET, no cookie): a page with the button, nothing written', async () => {
    const s = await signUp('g', L);
    const before = await stateOf(s.email, L, s.link.token);
    const r = await inject('GET', s.link.path!, { 'user-agent': SCANNER_UA });
    const after = await stateOf(s.email, L, s.link.token);
    const cell = { answer: s.answer.status, before, open: page(r), after };
    cells.G = cell;
    expect(s.answer.status).toBe(202);
    expect(before).toEqual({
      status: 'pending',
      consent: [],
      row: 'no row',
      token: true,
      suppressions: [],
    });
    expect(cell.open.status).toBe(200);
    expect(cell.open.contentType).toMatch(/^text\/html/);
    expect(cell.open.form).toBe(`<form method="post" action="${s.link.path}">`);
    expect(cell.open.script, 'nothing may submit the form for the person').toBe(false);
    expect(after, 'opening the link changed something').toEqual(before);
  });

  it('H — HEAD of the link: nothing written', async () => {
    const s = await signUp('h', L);
    const before = await stateOf(s.email, L, s.link.token);
    const r = await inject('HEAD', s.link.path!, { 'user-agent': SCANNER_UA });
    const after = await stateOf(s.email, L, s.link.token);
    cells.H = { before, status: r.status, after };
    expect(r.status).toBe(200);
    expect(after, 'HEAD changed something').toEqual(before);
    expect(after.status).toBe('pending');
    expect(after.token).toBe(true);
  });

  it('G2 — the link opened twice: the same page both times, the token stays', async () => {
    const s = await signUp('g2', L);
    const before = await stateOf(s.email, L, s.link.token);
    const first = page(await inject('GET', s.link.path!, { 'user-agent': SCANNER_UA }));
    const second = page(await inject('GET', s.link.path!, { 'user-agent': SCANNER_UA }));
    const after = await stateOf(s.email, L, s.link.token);
    cells.G2 = { before, first, second, after };
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(second.form).toBe(first.form);
    expect(after).toEqual(before);
  });

  it('U — unsubscribed (preference centre), signs up again, a scanner opens the link: the unsubscribe stays', async () => {
    const email = address('u');
    const c = await asOwner('POST', '/api/v1/contacts', { email, firstName: 'Petra' });
    const on = await inject('POST', `/api/v1/lists/${L}/contacts`, owner, { contactId: c.data.id });
    expect(on.status).toBe(204);
    const pref = createTrackingToken({
      type: 'pref',
      orgId: org,
      contactId: c.data.id,
      ts: Math.floor(Date.now() / 1000),
    });
    const unsub = await inject('POST', `/p/center/${pref}`, {}, { globalUnsubscribe: true });
    const sub = await inject('POST', `/api/v1/lists/${L}/subscribe`, {}, { email });
    const link = await mailedLink(email);
    const before = await stateOf(email, L, link.token);
    const r = await inject('GET', link.path!, { 'user-agent': SCANNER_UA });
    const after = await stateOf(email, L, link.token);
    cells.U = { unsubscribe: unsub.status, subscribe: sub.status, before, open: page(r), after };
    expect(unsub.status).toBe(200);
    expect(before).toEqual({
      status: 'unsubscribed',
      consent: [],
      row: 'confirmed:true unsub:true',
      token: true,
      suppressions: ['unsubscribe'],
    });
    expect(r.status).toBe(200);
    expect(after, 'opening the link lifted the unsubscribe').toEqual(before);
  });

  it('K — a person opens the link and presses the button: active, the proof, the list row, the token gone', async () => {
    const s = await signUp('k', L);
    const before = await stateOf(s.email, L, s.link.token);
    const p = await person(s.link.path!);
    const after = await stateOf(s.email, L, s.link.token);
    cells.K = { before, get: p.get, post: p.post, after };
    expect(before.status).toBe('pending');
    expect(p.last.status).toBe(200);
    expect(p.last.contentType).toMatch(/^text\/html/);
    expect(after).toEqual({
      status: 'active',
      consent: [`double_opt_in/double_opt_in/ip:true/ua:${PERSON_UA}`],
      row: 'confirmed:true unsub:false',
      token: false,
      suppressions: [],
    });
  });

  it("KT — the list's thank-you URL: the person ends there", async () => {
    const s = await signUp('kt', LT);
    const p = await person(s.link.path!);
    const after = await stateOf(s.email, LT, s.link.token);
    cells.KT = { get: p.get, post: p.post, after };
    // 303 from the button's POST; 302 was master's answer to the GET.
    expect([302, 303]).toContain(p.last.status);
    expect(p.last.location).toBe(THANK_YOU);
    expect(after.status).toBe('active');
    expect(after.row).toBe('confirmed:true unsub:false');
    expect(after.token).toBe(false);
  });

  it('KF — the signup form with double opt-in; the button pressed with no body at all', async () => {
    const email = address('kf');
    const r = await inject('POST', `/public/forms/${formId}/submit`, {}, { email });
    const link = await mailedLink(email);
    const before = await stateOf(email, L, link.token);
    const p = await person(link.path!, true);
    const after = await stateOf(email, L, link.token);
    cells.KF = { submit: r.status, before, get: p.get, post: p.post, after };
    expect(r.status).toBe(200);
    expect(before.status).toBe('pending');
    expect(p.last.status).toBe(200);
    expect(after).toEqual({
      status: 'active',
      consent: [`double_opt_in/double_opt_in/ip:true/ua:${PERSON_UA}`],
      row: 'confirmed:true unsub:false',
      token: false,
      suppressions: [],
    });
  });

  it('E — an unknown token: the expired page, nothing written', async () => {
    const t = randomUUID();
    const get = page(await inject('GET', `/api/v1/confirm/${t}`, {}));
    const head = page(await inject('HEAD', `/api/v1/confirm/${t}`, {}));
    const post = page(
      await inject(
        'POST',
        `/api/v1/confirm/${t}`,
        { 'content-type': 'application/x-www-form-urlencoded' },
        '',
      ),
    );
    cells.E = { get, head, post };
    expect(get.status).toBe(400);
    expect(get.contentType).toMatch(/^text\/html/);
    expect(head.status).toBe(400);
    // 400 with the same page from the button's route; master has no such route (404).
    expect(post.status).toBeGreaterThanOrEqual(400);
  });

  it('PP — the per-purpose GDPR confirmation: opening the link grants nothing, the button grants', async () => {
    const email = address('pp');
    const c = await asOwner('POST', '/api/v1/contacts', { email, firstName: 'Petra' });
    const slug = `${TAG}-pp`;
    await asOwner('POST', '/api/v1/gdpr/purposes', {
      slug,
      name: `${TAG} pp`,
      legalBasis: 'consent',
    });
    const start = await inject('POST', `/api/v1/contacts/${c.data.id}/gdpr/doi/${slug}`, owner, {});
    const job = (await mtaOtherQueue.getJobs(ALL, 0, 10_000)).find(
      (j) =>
        j?.data?.orgId === org &&
        j.data.toEmail === email &&
        /^Potvrzení souhlasu/.test(j.data.subject),
    );
    const href = /<a href="([^"]+)"/.exec(String(job?.data.htmlBody ?? ''))?.[1] ?? '';
    const token = /token=([0-9a-f]{64})/.exec(href)?.[1] ?? '';
    const consents = async () =>
      (
        await rows<{ granted: boolean; source: string }>(sql`
          SELECT granted, source FROM contact_gdpr_consents
          WHERE org_id = ${org}::uuid AND contact_id = ${c.data.id}::uuid ORDER BY granted_at
        `)
      ).map((r) => `${r.granted}/${r.source}`);
    const stored = async () => (await redis.exists(`doi:purpose:${token}`)) === 1;
    const url = `/public/gdpr/doi/confirm?token=${token}`;
    const get = page(await inject('GET', url, { 'user-agent': SCANNER_UA }));
    const afterGet = { consents: await consents(), stored: await stored() };
    const head = page(await inject('HEAD', url, { 'user-agent': SCANNER_UA }));
    const afterHead = { consents: await consents(), stored: await stored() };
    const action = /<form method="post" action="([^"]+)">/.exec(
      (await inject('GET', url, { 'user-agent': PERSON_UA })).body,
    )?.[1];
    const post = action
      ? page(await inject('POST', action.replace(/&amp;/g, '&'), { 'user-agent': PERSON_UA }))
      : null;
    const afterPost = { consents: await consents(), stored: await stored() };
    cells.PP = {
      start: start.status,
      href: href.replace(/token=[0-9a-f]{64}/, 'token=<token>'),
      get,
      afterGet,
      head,
      afterHead,
      action: action?.replace(/[0-9a-f]{64}/, '<token>') ?? null,
      post,
      afterPost,
    };
    expect(start.status).toBe(200);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(get.status).toBe(200);
    expect(get.form).toBe(`<form method="post" action="/public/gdpr/doi/confirm?token=${token}">`);
    expect(get.script).toBe(false);
    expect(afterGet, 'opening the link granted the consent').toEqual({
      consents: [],
      stored: true,
    });
    expect(head.status).toBe(200);
    expect(afterHead, 'HEAD granted the consent').toEqual({ consents: [], stored: true });
    // Without a target from the start the API's own "confirmed" page; it used
    // to be 303 to APP_BASE_URL/gdpr/confirmed, which nothing serves (Z184).
    expect(post?.status).toBe(200);
    expect(post?.location).toBeNull();
    expect(afterPost).toEqual({ consents: ['true/doi_email'], stored: false });
  });
});
