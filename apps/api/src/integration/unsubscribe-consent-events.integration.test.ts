/**
 * A recipient's own unsubscribe, and their way back to a list, are written on
 * the consent timeline (Z186, Zásobník e-mail 6: Z157 MIMO 5 + Z177 MIMO 2).
 *
 * ─── What was wrong (measured in Z157 and Z177, read again on 23ae963) ───────
 *
 * consent_events is the timeline that proves consent (GDPR Art. 7, zákon
 * 480/2004 Sb.). unsubscribeContact wrote contacts, suppressions,
 * contact_lists and email_events, and no consent_events row: someone who
 * confirmed a double opt-in and left through the footer link, the one-click
 * POST or the preference centre had a timeline ending on the consent, and
 * GET /consent-graph/:contactId/summary read them as consenting. And a way
 * back to a list they had left (resubscribeToLists, a link under 30 days)
 * reopened the row with no consent recorded for it.
 *
 * ─── How it is measured ──────────────────────────────────────────────────────
 *
 * The real app (`buildApp` + `inject`), database and Redis; no worker runs in
 * this process (the way to the engine is apps/workers/src/integration/
 * unsubscribe-consent-events). An organisation of this file (INSERT) with the
 * seed user as owner, switched in; every contact signs up to the double
 * opt-in list D (POST /lists/:id/subscribe), the confirmation e-mail is read
 * from its mta-other job and its button pressed — the contact is active with a
 * double_opt_in row — and is then added to L2 by the owner.
 *
 * Tokens: the signed unsubscribe and preference tokens are minted with
 * createTrackingToken in exactly the shape batch-sender signs them
 * ({type, orgId, contactId, campaignId?, ts}) — sending a campaign needs the
 * workers, which do not run here; the workers file reads them out of the
 * e-mail. The legacy UUID token comes from generateUnsubscribeToken.
 *
 *   U   every path a recipient unsubscribes by, twice: GET / HEAD / POST
 *       /api/v1/unsubscribe/:token (signed, signed with a campaign, legacy
 *       UUID), POST /api/v1/unsubscribe, the preference centre's page (all,
 *       a list) and JSON (globalUnsubscribe, unsubscribeFromLists), the legacy
 *       POST /api/v1/preferences/:token (unsubscribe_all, list_ids_to_remove);
 *   R   back to a list left, by JSON and by the page's form, twice; with a
 *       31-day link; a list never on; another organisation's list; the
 *       page's "subscribe again" with a list ticked;
 *   K   unchanged: globalResubscribe, the double opt-in, the admin PUT, the
 *       workflow action, a topic; the answers of every U and R request;
 *   Q   SQL statements of one unsubscribe and one way back (observeQueries
 *       does not see the statements inside db.transaction).
 *
 * Everything measured is printed as `Z186_API_CELLS_JSON …` chunks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import type { JobType } from 'bullmq';
import { createTrackingToken } from '@forgemsg/shared';
import { redis } from '@forgemsg/shared/redis';
import { login, SEED, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { mtaOtherQueue } from '../lib/queues.js';
import { observeQueries } from '../db/explain-guard.js';
import { generateUnsubscribeToken } from '../routes/v1/subscriptions.js';

const { buildApp } = await import('../index.js');

const TAG = `z186-${randomUUID().slice(0, 8)}`;
const DOMAIN = `${TAG}.test`;
const octet = () => 1 + Math.floor(Math.random() * 250);
// This file's own address: its own rate-limit buckets on the public routes.
const IP = `100.64.186.${octet()}`;
const IP_HASH = createHash('sha256').update(IP).digest('hex');
const DAY = 86_400;
const ALL: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active', 'completed'];
const PERSON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';
const AS_BROWSER = {
  accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
  'accept-language': 'cs',
  'user-agent': PERSON_UA,
};
const FORM = { ...AS_BROWSER, 'content-type': 'application/x-www-form-urlencoded' };
const JSON_UA = { 'user-agent': PERSON_UA };

let app: FastifyInstance;
let seedSession: Session;
let seedOrgId = '';
let org = '';
let other = '';
let owner: Record<string, string> = {};
let seedBefore: Record<string, unknown> = {};
let campaignId = '';
const rawKeys: string[] = [];
const legacyTokens: string[] = [];
const report: Record<string, unknown> = {
  tag: TAG,
  mock: 'none — the real app, database and Redis; no worker runs in this process',
  tokens:
    'signed tokens minted with createTrackingToken in the shape batch-sender signs; legacy UUID token from generateUnsubscribeToken',
};
const cells: Record<string, unknown> = {};
const rateLimitWaits: { url: string; retryAfterS: number }[] = [];
let n = 0;
let D = '';
let L2 = '';
let M = '';
let FOREIGN = '';

const rows = async <T>(q: SQL) => (await db.execute(q)) as unknown as T[];
const address = (label: string) => `${label}-${n++}-${TAG}@${DOMAIN}`;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const nowS = () => Math.floor(Date.now() / 1000);
const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

interface Res {
  status: number;
  body: string;
  location: string | null;
  contentType: string | null;
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
      rateLimitWaits.push({ url: url.split('/').slice(0, 4).join('/'), retryAfterS });
      await new Promise((r) => setTimeout(r, (retryAfterS + 1) * 1000));
      continue;
    }
    const loc = res.headers['location'];
    const ct = res.headers['content-type'];
    return {
      status: res.statusCode,
      body: res.body,
      location: typeof loc === 'string' ? loc : null,
      contentType: typeof ct === 'string' ? ct : null,
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
           (SELECT count(*)::int FROM contacts WHERE org_id = ${seedOrgId}::uuid AND status = 'unsubscribed') AS unsubscribed,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId}::uuid) AS suppressions,
           (SELECT count(*)::int FROM lists WHERE org_id = ${seedOrgId}::uuid) AS lists,
           (SELECT count(*)::int FROM contact_lists cl JOIN contacts c ON c.id = cl.contact_id WHERE c.org_id = ${seedOrgId}::uuid) AS memberships,
           (SELECT count(*)::int FROM consent_events WHERE org_id = ${seedOrgId}::uuid) AS consent_events,
           (SELECT count(*)::int FROM email_events WHERE org_id = ${seedOrgId}::uuid) AS email_events,
           (SELECT count(*)::int FROM campaigns WHERE org_id = ${seedOrgId}::uuid) AS campaigns,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${seedOrgId}::uuid) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${seedOrgId}::uuid) AS api_keys
  `);
  return r!;
}

async function newList(name: string, doubleOptIn = false): Promise<string> {
  return (
    await asOwner('POST', '/api/v1/lists', {
      name: `${TAG} ${name}`,
      ...(doubleOptIn ? { doubleOptIn } : {}),
    })
  ).data.id;
}

interface Person {
  id: string;
  email: string;
}

/** The link in the newest confirmation e-mail queued for `email`. */
async function mailedConfirmPath(email: string): Promise<string | null> {
  const jobs = (await mtaOtherQueue.getJobs(ALL, 0, 10_000))
    .filter(
      (j) =>
        j?.data?.orgId === org &&
        String(j.data.toEmail).toLowerCase() === email.toLowerCase() &&
        /^Confirm your subscription to /.test(String(j.data.subject)),
    )
    .sort((a, b) => a.timestamp - b.timestamp);
  const html = String(jobs.at(-1)?.data.htmlBody ?? '');
  return /href="[^"]*?(\/api\/v1\/confirm\/[0-9a-f-]{36})"/.exec(html)?.[1] ?? null;
}

/**
 * A person who signed up to D with double opt-in and pressed the button in the
 * confirmation e-mail, then was put on L2 by the owner: active, one
 * double_opt_in row.
 */
async function doiPerson(label: string): Promise<Person & { confirm: Record<string, unknown> }> {
  const email = address(label);
  const sub = await inject('POST', `/api/v1/lists/${D}/subscribe`, {}, { email });
  const path = await mailedConfirmPath(email);
  expect(path, `no confirmation e-mail for ${label}: ${sub.status} ${sub.body}`).toBeTruthy();
  const get = await inject('GET', path!, JSON_UA);
  const action = /<form method="post" action="([^"]+)">/
    .exec(get.body)?.[1]
    ?.replace(/&amp;/g, '&');
  const post = await inject(
    'POST',
    action ?? path!,
    { ...JSON_UA, 'content-type': 'application/x-www-form-urlencoded' },
    '',
  );
  const [c] = await rows<{ id: string }>(sql`
    SELECT id FROM contacts WHERE org_id = ${org}::uuid AND lower(email) = lower(${email})
  `);
  expect(c, `contact ${label}`).toBeTruthy();
  await asOwner('POST', `/api/v1/lists/${L2}/contacts`, { contactId: c!.id });
  return {
    id: c!.id,
    email,
    confirm: { subscribe: sub.status, get: get.status, post: post.status },
  };
}

const unsubToken = (p: Person, withCampaign = false) =>
  createTrackingToken({
    type: 'unsub',
    orgId: org,
    contactId: p.id,
    ...(withCampaign ? { campaignId } : {}),
    ts: nowS(),
  });
const prefToken = (p: Person, ageS = 0) =>
  createTrackingToken({ type: 'pref', orgId: org, contactId: p.id, ts: nowS() - ageS });
async function legacyToken(p: Person): Promise<string> {
  const t = await generateUnsubscribeToken(p.id, org);
  legacyTokens.push(t);
  return t;
}

interface ConsentRow {
  id: string;
  event_type: string;
  legal_basis: string;
  channel: string | null;
  purpose_code: string | null;
  consent_version: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  source: string;
  source_url: string | null;
  proof_payload: Record<string, unknown> | null;
  operator_id: string | null;
}

interface EmailEventRow {
  id: string;
  campaign_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
}

interface State {
  status: string;
  suppressions: string[];
  lists: Record<string, string>;
  consent: ConsentRow[];
  unsubscribeEvents: EmailEventRow[];
  summary: { hasActiveConsent: unknown; email: unknown; totalEvents: unknown };
}

/** Everything an unsubscribe or a way back writes, and what the summary reads from it. */
async function stateOf(p: Person): Promise<State> {
  const [c] = await rows<{ status: string }>(
    sql`SELECT status::text AS status FROM contacts WHERE id = ${p.id}::uuid`,
  );
  const supp = await rows<{ reason: string }>(sql`
    SELECT reason::text AS reason FROM suppressions
    WHERE org_id = ${org}::uuid AND lower(email) = lower(${p.email}) ORDER BY reason
  `);
  const memberships = await rows<{ list_id: string; unsub: boolean }>(sql`
    SELECT list_id, unsubscribed_at IS NOT NULL AS unsub FROM contact_lists WHERE contact_id = ${p.id}::uuid
  `);
  const consent = await rows<ConsentRow>(sql`
    SELECT id, event_type::text AS event_type, legal_basis::text AS legal_basis, channel, purpose_code,
           consent_version, ip_hash, user_agent, source, source_url, proof_payload, operator_id
    FROM consent_events WHERE org_id = ${org}::uuid AND contact_id = ${p.id}::uuid
    ORDER BY occurred_at, id
  `);
  const events = await rows<EmailEventRow>(sql`
    SELECT id, campaign_id, ip_address, user_agent, metadata FROM email_events
    WHERE org_id = ${org}::uuid AND contact_id = ${p.id}::uuid AND event_type = 'unsubscribe'
    ORDER BY created_at, id
  `);
  const name = (id: string) => (id === D ? 'D' : id === L2 ? 'L2' : id === M ? 'M' : 'other');
  const lists: Record<string, string> = {};
  for (const m of memberships) lists[name(m.list_id)] = m.unsub ? 'SET' : 'NULL';
  const s = await inject('GET', `/api/v1/consent-graph/${p.id}/summary`, owner);
  const data = (
    JSON.parse(s.body) as {
      data: {
        hasActiveConsent: unknown;
        totalEvents: unknown;
        latestEventPerChannel: Record<string, { eventType?: unknown }>;
      };
    }
  ).data;
  return {
    status: c?.status ?? 'no contact',
    suppressions: supp.map((r) => r.reason),
    lists,
    consent,
    unsubscribeEvents: events,
    summary: {
      hasActiveConsent: data.hasActiveConsent,
      email: data.latestEventPerChannel.email?.eventType ?? null,
      totalEvents: data.totalEvents,
    },
  };
}

/** What a request answered, with the tokens taken out — the same on master and branch. */
/** This run's ids and times named, so two runs (master, branch) compare as text. */
function hide(s: string): string {
  const named: [string, string][] = [
    [D, '<D>'],
    [L2, '<L2>'],
    [M, '<M>'],
    [FOREIGN, '<FOREIGN>'],
    [campaignId, '<campaign>'],
    [org, '<org>'],
  ];
  let out = s.split(TAG).join('<TAG>');
  for (const [id, name] of named) if (id) out = out.split(id).join(name);
  return out
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '<ts>');
}

function answer(r: Res, token: string) {
  const body = hide(r.body.split(token).join('<token>'));
  return {
    status: r.status,
    contentType: r.contentType,
    location: r.location ? hide(r.location.split(token).join('<token>')) : null,
    bodyHash: sha(body),
    bodyLength: body.length,
  };
}

/** The difference two states make: the rows that came, the stores as they stand. */
function delta(before: State, after: State) {
  const seen = new Set(before.consent.map((c) => c.id));
  const seenEvents = new Set(before.unsubscribeEvents.map((e) => e.id));
  return {
    newConsent: after.consent.filter((c) => !seen.has(c.id)),
    newUnsubscribeEvents: after.unsubscribeEvents.filter((e) => !seenEvents.has(e.id)),
    status: after.status,
    suppressions: after.suppressions,
    lists: after.lists,
    summary: after.summary,
  };
}

/** A consent row without its id, the hash and UA reduced to whether they are this request's. */
function shape(c: ConsentRow) {
  const { id: _id, ip_hash, user_agent, ...rest } = c;
  return { ...rest, ip_hash: ip_hash === IP_HASH ? '<sha256(IP)>' : ip_hash, user_agent };
}
function eventShape(e: EmailEventRow) {
  return {
    campaign: e.campaign_id === null ? null : e.campaign_id === campaignId ? '<campaign>' : 'other',
    ip: e.ip_address,
    ua: e.user_agent,
    metadata: e.metadata ? (JSON.parse(hide(JSON.stringify(e.metadata))) as unknown) : null,
  };
}

interface Click {
  answer: ReturnType<typeof answer>;
  delta: ReturnType<typeof delta>;
}

/** One request against `p`, and what it wrote. */
async function click(p: Person, token: string, send: () => Promise<Res>): Promise<Click> {
  const before = await stateOf(p);
  const r = await send();
  const after = await stateOf(p);
  return { answer: answer(r, token), delta: delta(before, after) };
}

function record(name: string, value: { first: Click; second: Click; [k: string]: unknown }) {
  cells[name] = {
    ...value,
    first: {
      answer: value.first.answer,
      ...value.first.delta,
      newConsent: value.first.delta.newConsent.map(shape),
      newUnsubscribeEvents: value.first.delta.newUnsubscribeEvents.map(eventShape),
    },
    second: {
      answer: value.second.answer,
      ...value.second.delta,
      newConsent: value.second.delta.newConsent.map(shape),
      newUnsubscribeEvents: value.second.delta.newUnsubscribeEvents.map(eventShape),
    },
  };
}

/** The opt_out row a recipient's unsubscribe must leave — exactly, every field. */
function expectOptOut(
  c: Click,
  want: {
    source: string;
    scope: 'global' | 'list';
    listId?: string;
    campaignId?: string;
    method?: string;
  },
) {
  expect(c.delta.newUnsubscribeEvents, 'one email_events unsubscribe row').toHaveLength(1);
  expect(c.delta.newConsent.map(shape), 'one opt_out row on the consent timeline').toEqual([
    {
      event_type: 'opt_out',
      legal_basis: 'consent',
      channel: 'email',
      purpose_code: 'marketing_email',
      consent_version: null,
      ip_hash: '<sha256(IP)>',
      user_agent: PERSON_UA,
      source: want.source,
      source_url: null,
      operator_id: null,
      proof_payload: {
        scope: want.scope,
        ...(want.listId ? { listId: want.listId } : {}),
        ...(want.campaignId ? { campaignId: want.campaignId } : {}),
        emailEventId: c.delta.newUnsubscribeEvents[0]!.id,
        fromStatus: 'active',
        ...(want.method ? { method: want.method } : {}),
      },
    },
  ]);
}

/** A repeat: nothing written, the answer as the first one's. */
function expectRepeat(c: Click) {
  expect(c.delta.newConsent, 'a second opt_out row').toEqual([]);
  expect(c.delta.newUnsubscribeEvents, 'a second unsubscribe event').toEqual([]);
}

const LEFT_ALL = {
  status: 'unsubscribed',
  suppressions: ['unsubscribe'],
  lists: { D: 'SET', L2: 'SET' },
};
const LEFT_D = { status: 'active', suppressions: [], lists: { D: 'SET', L2: 'NULL' } };

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  seedSession = await login(app);
  seedOrgId = seedSession.orgId;
  seedBefore = await seedState();

  const [o] = await rows<{ id: string }>(sql`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`${TAG} org`}, ${TAG}, 'production', 'Obchod z186 s.r.o.', 'Nádražní 1, 110 00 Praha')
    RETURNING id
  `);
  org = o!.id;
  const otherSlug = `${TAG}-other`;
  const [x] = await rows<{ id: string }>(sql`
    INSERT INTO organizations (name, slug) VALUES (${otherSlug}, ${otherSlug}) RETURNING id
  `);
  other = x!.id;
  const foreignName = `${TAG} foreign`;
  const [fl] = await rows<{ id: string }>(sql`
    INSERT INTO lists (org_id, name) VALUES (${other}::uuid, ${foreignName}) RETURNING id
  `);
  FOREIGN = fl!.id;
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
  // DNS cannot be verified in CI; the campaign the token names needs a sender of its own domain.
  await db.execute(sql`
    INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
    VALUES (${org}::uuid, ${DOMAIN}, 'fm1', true, true, true, true)
  `);
  D = await newList('D', true);
  L2 = await newList('L2');
  M = await newList('M');
  const subject = `Novinky ${TAG}`;
  const c = await asOwner('POST', '/api/v1/campaigns', {
    name: `${TAG} campaign`,
    subject,
    fromName: 'Obchod',
    fromEmail: `noreply@${DOMAIN}`,
    listId: D,
    content: {
      subject,
      blocks: [
        {
          id: 'b1',
          type: 'footer',
          content: '{{company_name}}',
          showUnsubscribe: true,
          textAlign: 'center',
          fontSize: '12px',
          color: '#6b7280',
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
  campaignId = c.data.id;
}, 180_000);

afterAll(async () => {
  let jobsRemoved = 0;
  for (const j of await mtaOtherQueue.getJobs(ALL, 0, 10_000)) {
    if (j?.data?.orgId === org) {
      await j.remove().catch(() => {});
      jobsRemoved++;
    }
  }
  // The double opt-in tokens and limit counters of this file's list D.
  let doiKeysRemoved = 0;
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:*', 'COUNT', 1000);
    cursor = next;
    for (const k of keys) {
      if (k.startsWith('doi:limit-purpose:')) continue;
      const mine = k.startsWith('doi:limit:')
        ? k.startsWith(`doi:limit:${D}:`)
        : ((await redis.get(k)) ?? '').includes(org);
      if (mine && D) {
        await redis.del(k);
        doiKeysRemoved++;
      }
    }
  } while (cursor !== '0');
  for (const tk of legacyTokens) await redis.del(`unsub:${tk}`);
  let legacyKeysLeft = 0;
  for (const tk of legacyTokens) legacyKeysLeft += await redis.exists(`unsub:${tk}`);
  let limitKeysRemoved = 0;
  const digests = rawKeys.map((k) => createHash('sha256').update(k).digest('hex').slice(0, 32));
  // The sessions' buckets, and this file's own address's on the public routes.
  for (const pattern of [...digests.map((d) => `*${d}*`), `*${IP}*`]) {
    let cur = '0';
    do {
      const [next, keys] = await redis.scan(cur, 'MATCH', pattern, 'COUNT', 1000);
      cur = next;
      for (const k of keys) {
        await redis.del(k);
        limitKeysRemoved++;
      }
    } while (cur !== '0');
  }
  for (const o of [org, other]) {
    if (!o) continue;
    await db.execute(sql`DELETE FROM email_events WHERE org_id = ${o}::uuid`);
    await db.execute(sql`DELETE FROM campaigns WHERE org_id = ${o}::uuid`);
    await db.execute(sql`DELETE FROM consent_events WHERE org_id = ${o}::uuid`);
    await db.execute(sql`DELETE FROM suppressions WHERE org_id = ${o}::uuid`);
    await db.execute(sql`DELETE FROM audit_logs WHERE org_id = ${o}::uuid`);
    await db.execute(sql`DELETE FROM api_keys WHERE org_id = ${o}::uuid`);
    // Everything else of the organisation goes with it (ON DELETE CASCADE).
    await db.execute(sql`DELETE FROM organizations WHERE id = ${o}::uuid`);
  }
  const like = `${TAG}%`;
  const [left] = await rows<Record<string, number>>(sql`
    SELECT (SELECT count(*)::int FROM organizations WHERE slug LIKE ${like}) AS orgs,
           (SELECT count(*)::int FROM contacts WHERE org_id = ${org}::uuid) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${org}::uuid) AS suppressions,
           (SELECT count(*)::int FROM lists WHERE name LIKE ${like}) AS lists,
           (SELECT count(*)::int FROM consent_events WHERE org_id = ${org}::uuid) AS consent_events,
           (SELECT count(*)::int FROM email_events WHERE org_id = ${org}::uuid) AS email_events,
           (SELECT count(*)::int FROM campaigns WHERE org_id = ${org}::uuid) AS campaigns,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${org}::uuid) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${org}::uuid) AS api_keys
  `);
  const seedAfter = await seedState();
  report.cells = cells;
  report.rateLimitWaits = rateLimitWaits;
  report.leftover = { ...left, legacyKeysLeft, limitKeysRemoved, doiKeysRemoved, jobsRemoved };
  report.seedOrg = { before: seedBefore, after: seedAfter };
  const all = JSON.stringify(report);
  const parts = Math.ceil(all.length / 3000);
  for (let i = 0; i < parts; i++)
    console.log(
      `Z186_API_CELLS_JSON ${String(i).padStart(4, '0')}/${parts} ${all.slice(i * 3000, (i + 1) * 3000)}`,
    );
  await app.close();
  expect(left, 'what this file made was not all removed').toEqual({
    orgs: 0,
    contacts: 0,
    suppressions: 0,
    lists: 0,
    consent_events: 0,
    email_events: 0,
    campaigns: 0,
    members: 0,
    api_keys: 0,
  });
  expect(legacyKeysLeft).toBe(0);
  expect(seedAfter, 'the seed organisation changed').toEqual(seedBefore);
}, 180_000);

// Every contact passes the confirmation route, whose per-address limit this
// file honours by waiting out its Retry-After (rateLimitWaits) — a wait of up
// to a minute inside one test, beyond the default 60 s of the suite.
describe(
  "a recipient's own unsubscribe and way back are on the consent timeline (Z186)",
  { timeout: 240_000 },
  () => {
    it('K — the double opt-in: active, one double_opt_in row, the summary reads consent', async () => {
      const p = await doiPerson('k-doi');
      const s = await stateOf(p);
      cells.K_doi = {
        confirm: p.confirm,
        status: s.status,
        lists: s.lists,
        consent: s.consent.map(shape),
        summary: s.summary,
      };
      expect(s.status).toBe('active');
      expect(s.lists).toEqual({ D: 'NULL', L2: 'NULL' });
      expect(s.consent.map((c) => `${c.event_type}/${c.source}`)).toEqual([
        'double_opt_in/double_opt_in',
      ]);
      expect(s.summary).toEqual({ hasActiveConsent: true, email: 'double_opt_in', totalEvents: 1 });
    });

    describe('U — every path a recipient unsubscribes by, twice', () => {
      const globalPaths: {
        name: string;
        source: string;
        method?: string;
        campaign?: boolean;
        token: (p: Person) => Promise<string>;
        send: (token: string) => Promise<Res>;
      }[] = [
        {
          name: 'U_get_signed',
          source: 'footer_link',
          method: 'GET',
          token: async (p) => unsubToken(p),
          send: (t) => inject('GET', `/api/v1/unsubscribe/${t}`, AS_BROWSER),
        },
        {
          name: 'U_get_signed_campaign',
          source: 'footer_link',
          method: 'GET',
          campaign: true,
          token: async (p) => unsubToken(p, true),
          send: (t) => inject('GET', `/api/v1/unsubscribe/${t}`, AS_BROWSER),
        },
        {
          name: 'U_get_legacy_uuid',
          source: 'footer_link',
          method: 'GET',
          token: legacyToken,
          send: (t) => inject('GET', `/api/v1/unsubscribe/${t}`, AS_BROWSER),
        },
        {
          name: 'U_head_signed',
          source: 'footer_link',
          method: 'HEAD',
          token: async (p) => unsubToken(p),
          send: (t) => inject('HEAD', `/api/v1/unsubscribe/${t}`, AS_BROWSER),
        },
        {
          name: 'U_post_one_click_path',
          source: 'one_click',
          method: 'POST',
          campaign: true,
          token: async (p) => unsubToken(p, true),
          send: (t) =>
            inject(
              'POST',
              `/api/v1/unsubscribe/${t}`,
              { ...JSON_UA, 'content-type': 'application/x-www-form-urlencoded' },
              'List-Unsubscribe=One-Click',
            ),
        },
        {
          name: 'U_post_one_click_body',
          source: 'one_click',
          method: 'POST',
          token: async (p) => unsubToken(p),
          send: (t) => inject('POST', '/api/v1/unsubscribe', JSON_UA, { token: t }),
        },
        {
          name: 'U_post_one_click_body_legacy',
          source: 'one_click',
          method: 'POST',
          token: legacyToken,
          send: (t) => inject('POST', '/api/v1/unsubscribe', JSON_UA, { token: t }),
        },
        {
          name: 'U_centre_page_all',
          source: 'preference_centre',
          method: 'POST',
          token: async (p) => prefToken(p),
          send: (t) =>
            inject(
              'POST',
              `/p/center/${t}`,
              FORM,
              new URLSearchParams([['action', 'unsubscribe_all']]).toString(),
            ),
        },
        {
          name: 'U_centre_json_global',
          source: 'preference_centre',
          method: 'POST',
          token: async (p) => prefToken(p),
          send: (t) => inject('POST', `/p/center/${t}`, JSON_UA, { globalUnsubscribe: true }),
        },
        {
          name: 'U_legacy_preferences_all',
          source: 'preference_centre',
          method: 'POST',
          token: legacyToken,
          send: (t) =>
            inject('POST', `/api/v1/preferences/${t}`, JSON_UA, { unsubscribeAll: true }),
        },
      ];

      for (const path of globalPaths) {
        it(`${path.name} — ${path.source}: one opt_out (global), the repeat none`, async () => {
          const p = await doiPerson(path.name.toLowerCase());
          const token = await path.token(p);
          const first = await click(p, token, () => path.send(token));
          const second = await click(p, token, () => path.send(token));
          record(path.name, { first, second });
          // Unchanged by Z186, on master and branch alike.
          expect(first.delta).toMatchObject(LEFT_ALL);
          expect(first.delta.newUnsubscribeEvents).toHaveLength(1);
          expect(second.delta).toMatchObject(LEFT_ALL);
          // Z186.
          expectOptOut(first, {
            source: path.source,
            scope: 'global',
            ...(path.campaign ? { campaignId } : {}),
            ...(path.method ? { method: path.method } : {}),
          });
          expectRepeat(second);
          expect(first.delta.summary).toEqual({
            hasActiveConsent: false,
            email: 'opt_out',
            totalEvents: 2,
          });
        });
      }

      const listPaths: {
        name: string;
        token: (p: Person) => Promise<string>;
        send: (token: string) => Promise<Res>;
      }[] = [
        {
          name: 'U_centre_page_list',
          token: async (p) => prefToken(p),
          // The "save" form with D's box unticked and L2's ticked.
          send: (t) =>
            inject(
              'POST',
              `/p/center/${t}`,
              FORM,
              new URLSearchParams([
                ['action', 'save'],
                ['list', L2],
              ]).toString(),
            ),
        },
        {
          name: 'U_centre_json_list',
          token: async (p) => prefToken(p),
          send: (t) => inject('POST', `/p/center/${t}`, JSON_UA, { unsubscribeFromLists: [D] }),
        },
        {
          name: 'U_legacy_preferences_list',
          token: legacyToken,
          send: (t) =>
            inject('POST', `/api/v1/preferences/${t}`, JSON_UA, { listIdsToRemove: [D] }),
        },
      ];

      for (const path of listPaths) {
        it(`${path.name} — preference_centre: one opt_out (list D), the repeat none`, async () => {
          const p = await doiPerson(path.name.toLowerCase());
          const token = await path.token(p);
          const first = await click(p, token, () => path.send(token));
          const second = await click(p, token, () => path.send(token));
          record(path.name, { first, second });
          expect(first.delta).toMatchObject(LEFT_D);
          expect(first.delta.newUnsubscribeEvents).toHaveLength(1);
          expect(second.delta).toMatchObject(LEFT_D);
          expectOptOut(first, {
            source: 'preference_centre',
            scope: 'list',
            listId: D,
            method: 'POST',
          });
          expectRepeat(second);
        });
      }

      it('U_centre_ip_ua — the centre hands unsubscribeContact the IP and User-Agent (email_events)', () => {
        const ev = (name: string) =>
          (cells[name] as { first: { newUnsubscribeEvents: ReturnType<typeof eventShape>[] } })
            .first.newUnsubscribeEvents[0];
        const got = {
          page_all: ev('U_centre_page_all'),
          json_global: ev('U_centre_json_global'),
          page_list: ev('U_centre_page_list'),
          json_list: ev('U_centre_json_list'),
        };
        cells.U_centre_ip_ua = got;
        for (const e of Object.values(got))
          expect({ ip: e?.ip, ua: e?.ua }).toEqual({ ip: IP, ua: PERSON_UA });
      });
    });

    describe('R — back to a list left, through the preference centre', () => {
      /** A person who left D by the centre's JSON with a fresh link. */
      async function leftD(label: string): Promise<Person> {
        const p = await doiPerson(label);
        const r = await inject('POST', `/p/center/${prefToken(p)}`, JSON_UA, {
          unsubscribeFromLists: [D],
        });
        expect(r.status).toBe(200);
        return p;
      }
      const reConsent = (c: Click) =>
        c.delta.newConsent.filter((e) => e.event_type === 're_consent');

      it('R_json — resubscribeToLists [D]: one re_consent, the repeat none', async () => {
        const p = await leftD('r-json');
        const token = prefToken(p);
        const send = () =>
          inject('POST', `/p/center/${token}`, JSON_UA, { resubscribeToLists: [D] });
        const first = await click(p, token, send);
        const second = await click(p, token, send);
        record('R_json', { first, second });
        expect(first.delta.lists).toEqual({ D: 'NULL', L2: 'NULL' });
        expect(second.delta.lists).toEqual({ D: 'NULL', L2: 'NULL' });
        expect(first.delta.newUnsubscribeEvents).toEqual([]);
        expect(first.delta.newConsent.map(shape)).toEqual([
          {
            event_type: 're_consent',
            legal_basis: 'consent',
            channel: 'email',
            purpose_code: 'marketing_email',
            consent_version: null,
            ip_hash: '<sha256(IP)>',
            user_agent: PERSON_UA,
            source: 'preference_center',
            source_url: null,
            operator_id: null,
            proof_payload: { listId: D, via: 'api' },
          },
        ]);
        expect(second.delta.newConsent).toEqual([]);
      });

      it('R_page — the "save" form with D ticked again: one re_consent (via page), the repeat none', async () => {
        const p = await leftD('r-page');
        const token = prefToken(p);
        const send = () =>
          inject(
            'POST',
            `/p/center/${token}`,
            FORM,
            new URLSearchParams([
              ['action', 'save'],
              ['list', D],
              ['list', L2],
            ]).toString(),
          );
        const first = await click(p, token, send);
        const second = await click(p, token, send);
        record('R_page', { first, second });
        expect(first.delta.lists).toEqual({ D: 'NULL', L2: 'NULL' });
        expect(
          first.delta.newConsent.map((c) => ({ type: c.event_type, payload: c.proof_payload })),
        ).toEqual([{ type: 're_consent', payload: { listId: D, via: 'page' } }]);
        expect(second.delta.newConsent).toEqual([]);
      });

      it('R_old — a 31-day link: refused, D stays closed, no row', async () => {
        const p = await leftD('r-old');
        const token = prefToken(p, 31 * DAY);
        const send = () =>
          inject('POST', `/p/center/${token}`, JSON_UA, { resubscribeToLists: [D] });
        const first = await click(p, token, send);
        const second = await click(p, token, send);
        record('R_old', { first, second });
        expect(first.delta.lists).toEqual({ D: 'SET', L2: 'NULL' });
        expect(first.delta.newConsent).toEqual([]);
        expect(second.delta.newConsent).toEqual([]);
      });

      it('R_never — a list of the organisation the contact was never on: no row, no membership', async () => {
        const p = await leftD('r-never');
        const token = prefToken(p);
        const send = () =>
          inject('POST', `/p/center/${token}`, JSON_UA, { resubscribeToLists: [M] });
        const first = await click(p, token, send);
        const second = await click(p, token, send);
        record('R_never', { first, second });
        expect(first.delta.lists).toEqual({ D: 'SET', L2: 'NULL' });
        expect(first.delta.newConsent).toEqual([]);
        expect(second.delta.newConsent).toEqual([]);
      });

      it("R_foreign — another organisation's list: no row, no membership", async () => {
        const p = await leftD('r-foreign');
        const token = prefToken(p);
        const send = () =>
          inject('POST', `/p/center/${token}`, JSON_UA, { resubscribeToLists: [FOREIGN] });
        const first = await click(p, token, send);
        const second = await click(p, token, send);
        record('R_foreign', { first, second });
        expect(first.delta.lists).toEqual({ D: 'SET', L2: 'NULL' });
        expect(first.delta.newConsent).toEqual([]);
        expect(second.delta.newConsent).toEqual([]);
      });

      it('R_back_all — the page\'s "subscribe again" with D ticked: the global re_consent as before, and one for D', async () => {
        const p = await doiPerson('r-back-all');
        const token = prefToken(p);
        const unsub = await inject('POST', `/p/center/${token}`, JSON_UA, {
          globalUnsubscribe: true,
        });
        expect(unsub.status).toBe(200);
        const send = () =>
          inject(
            'POST',
            `/p/center/${token}`,
            FORM,
            new URLSearchParams([
              ['action', 'resubscribe'],
              ['list', D],
            ]).toString(),
          );
        const first = await click(p, token, send);
        const second = await click(p, token, send);
        record('R_back_all', { first, second });
        expect(first.delta.status).toBe('active');
        expect(first.delta.lists).toEqual({ D: 'NULL', L2: 'SET' });
        // K: the global way back keeps its own row.
        const global = reConsent(first).filter(
          (c) => (c.proof_payload ?? {}).liftedUnsubscribe !== undefined,
        );
        expect(global.map((c) => c.source)).toEqual(['preference_center']);
        // R: and D's reopened row has its own.
        expect(
          reConsent(first)
            .filter((c) => (c.proof_payload ?? {}).liftedUnsubscribe === undefined)
            .map((c) => c.proof_payload),
        ).toEqual([{ listId: D, via: 'page' }]);
        expect(second.delta.newConsent).toEqual([]);
      });
    });

    describe('K — unchanged', () => {
      it('K_global_resubscribe — globalResubscribe writes its one re_consent, as before', async () => {
        const p = await doiPerson('k-resub');
        const token = prefToken(p);
        const unsub = await inject('POST', `/p/center/${token}`, JSON_UA, {
          globalUnsubscribe: true,
        });
        expect(unsub.status).toBe(200);
        const send = () =>
          inject('POST', `/p/center/${token}`, JSON_UA, { globalResubscribe: true });
        const first = await click(p, token, send);
        const second = await click(p, token, send);
        record('K_global_resubscribe', { first, second });
        expect(first.delta.status).toBe('active');
        expect(first.delta.suppressions).toEqual([]);
        expect(first.delta.lists).toEqual({ D: 'SET', L2: 'SET' });
        expect(first.delta.newConsent.map((c) => `${c.event_type}/${c.source}`)).toEqual([
          're_consent/preference_center',
        ]);
        expect(second.delta.newConsent).toEqual([]);
      });

      it('K_admin_put — PUT /contacts/:id status unsubscribed: an email_events row, no consent row', async () => {
        const p = await doiPerson('k-admin');
        const send = () =>
          inject('PUT', `/api/v1/contacts/${p.id}`, owner, { status: 'unsubscribed' });
        const first = await click(p, '-', send);
        const second = await click(p, '-', send);
        record('K_admin_put', { first, second });
        expect(first.answer.status).toBe(200);
        expect(first.delta).toMatchObject(LEFT_ALL);
        expect(first.delta.newUnsubscribeEvents.map((e) => e.metadata?.source)).toEqual([
          'admin_ui',
        ]);
        expect(first.delta.newConsent).toEqual([]);
        expect(second.delta.newConsent).toEqual([]);
      });

      it('K_workflow — the workflow unsubscribe action: an email_events row, no consent row', async () => {
        const p = await doiPerson('k-flow');
        const { executeAction } = await import('../services/workflows/actions.js');
        const node = { id: 'n1', type: 'unsubscribe', config: {} } as unknown as Parameters<
          typeof executeAction
        >[0];
        const run = { id: randomUUID(), orgId: org, contactId: p.id } as unknown as Parameters<
          typeof executeAction
        >[1];
        const ctx = { orgId: org, contact: null } as unknown as Parameters<typeof executeAction>[2];
        const send = async (): Promise<Res> => {
          const out = await executeAction(node, run, ctx);
          return { status: 0, body: JSON.stringify(out), location: null, contentType: null };
        };
        const first = await click(p, '-', send);
        const second = await click(p, '-', send);
        record('K_workflow', { first, second });
        expect(first.delta).toMatchObject(LEFT_ALL);
        expect(first.delta.newUnsubscribeEvents.map((e) => e.metadata?.source)).toEqual([
          'workflow',
        ]);
        expect(first.delta.newConsent).toEqual([]);
        expect(second.delta.newConsent).toEqual([]);
      });

      it('K_topic — leaving a topic (source preference_centre, scope topic): no consent row', async () => {
        const p = await doiPerson('k-topic');
        const { unsubscribeContact } = await import('../services/contacts/unsubscribe.js');
        const send = async (): Promise<Res> => {
          const out = await unsubscribeContact(org, p.id, {
            scope: { kind: 'topic', topicId: randomUUID() },
            source: 'preference_centre',
          });
          return {
            status: 0,
            body: JSON.stringify({ changed: out.changed }),
            location: null,
            contentType: null,
          };
        };
        const first = await click(p, '-', send);
        record('K_topic', { first, second: first });
        expect(first.delta.newConsent).toEqual([]);
        expect(first.delta.status).toBe('active');
      });

      it('K_gdpr — the Art. 15 export and the erasure: what they do with the consent rows', async () => {
        const p = await doiPerson('k-gdpr');
        const token = unsubToken(p);
        const unsub = await inject('GET', `/api/v1/unsubscribe/${token}`, AS_BROWSER);
        const before = await stateOf(p);
        const exp = await inject('GET', `/api/v1/contacts/${p.id}/export-data`, owner);
        const expBody = exp.status === 200 ? (JSON.parse(exp.body) as { data?: unknown }) : null;
        const expData = (expBody?.data ?? expBody ?? {}) as Record<string, unknown>;
        const erase = await inject('POST', `/api/v1/contacts/${p.id}/anonymize`, owner, {});
        const erased = (JSON.parse(erase.body) as { data?: { relatedRowsDeleted?: unknown } }).data;
        const [left] = await rows<{ n: number }>(sql`
          SELECT count(*)::int AS n FROM consent_events
          WHERE org_id = ${org}::uuid AND contact_id = ${p.id}::uuid
        `);
        cells.K_gdpr = {
          unsubscribe: unsub.status,
          consentBefore: before.consent.map((c) => c.event_type),
          export: {
            status: exp.status,
            keys: Object.keys(expData).sort(),
            mentionsConsent: exp.body.includes('consent'),
          },
          erase: { status: erase.status, relatedRowsDeleted: erased?.relatedRowsDeleted ?? null },
          consentRowsAfter: left!.n,
        };
        expect(unsub.status).toBe(200);
        expect(erase.status).toBe(200);
        expect(left!.n, 'the erasure kept consent rows of the contact').toBe(0);
      });
    });

    it('Q — SQL statements of one unsubscribe (footer link) and one way back (outside transactions)', async () => {
      const p = await doiPerson('q');
      const measure = async (send: () => Promise<Res>) => {
        const statements: string[] = [];
        const stop = observeQueries((q) => statements.push(q.replace(/\s+/g, ' ').slice(0, 100)));
        let status = 0;
        try {
          status = (await send()).status;
        } finally {
          stop();
        }
        return { status, sql: statements.length, statements };
      };
      const token = unsubToken(p);
      const unsubscribe = await measure(() =>
        inject('GET', `/api/v1/unsubscribe/${token}`, AS_BROWSER),
      );
      const p2 = await doiPerson('q2');
      const pref = prefToken(p2);
      await inject('POST', `/p/center/${pref}`, JSON_UA, { unsubscribeFromLists: [D] });
      const back = await measure(() =>
        inject('POST', `/p/center/${pref}`, JSON_UA, { resubscribeToLists: [D] }),
      );
      cells.Q = {
        note: 'observeQueries sees the statements of the db client, not those inside db.transaction',
        unsubscribe: {
          status: unsubscribe.status,
          sql: unsubscribe.sql,
          statements: unsubscribe.statements,
        },
        back: { status: back.status, sql: back.sql, statements: back.statements },
      };
      expect(unsubscribe.status).toBe(200);
      expect(back.status).toBe(200);
    });
  },
);
