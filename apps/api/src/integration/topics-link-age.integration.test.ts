/**
 * The public topic page of the preference-centre link — /public/topics/:token —
 * under the rules of /p/center (Z187), and the legacy GET
 * /api/v1/preferences/:token answering with a masked address.
 *
 * ─── What was wrong (Z177 MIMO 1 and 3, measured again here on master) ───────
 *
 * The route took the pref token without looking at its `ts`, so a link out of
 * a year-old e-mail — forwarded, leaked, in an archive — joined the recipient
 * back to a topic they had left, and the `email.group_resubscribe` webhook
 * carried that "consent" into the customer's systems. It never read the
 * contact: a deleted one, an erased one, or one of another organisation (a
 * token of org A naming a contact of org B) was shown topics and could be
 * written to. The topic id was not checked against the organisation either —
 * another organisation's topic, a switched-off one, all accepted by the
 * foreign key. And the legacy GET answered with the full e-mail address.
 *
 * ─── How it is measured ──────────────────────────────────────────────────────
 *
 * The real app (`buildApp` + `inject`), the real database and Redis. No worker
 * runs in this process, so a webhook is measured where dispatchEvent leaves it:
 * the webhook_deliveries row, the BullMQ `webhook-deliver` job and the entry in
 * the org's event stream. Organisations A and B of this file (INSERT), the owner
 * session of A from POST /me/orgs/switch, A's topics, list, webhook endpoint and
 * contacts through the routes; B's contact and topic by INSERT (nothing of B is
 * reached through a route).
 *
 * Tokens are MINTED here with the same TRACKING_SECRET and exactly the shape the
 * batch sender signs into every e-mail (apps/workers/src/jobs/batch-sender.ts,
 * `{type:'pref', orgId, contactId, ts}`) — the only issuer of pref tokens
 * besides the view-in-browser copy, which keeps the e-mail's `ts`. Only `ts` is
 * set back (31 days) or ahead (an hour) or left out; time cannot be moved in CI.
 *
 *   T    joining a topic the contact left: fresh, 31 days, no ts, an hour ahead;
 *   O    leaving a topic: fresh, 31 days, no ts;
 *   D    a deleted contact, an erased one, a contact of org B with A's token;
 *   X    a topic of org B, an unknown topic id, a switched-off topic of A;
 *   P    the legacy GET with a legacy UUID token, and with a signed token;
 *   K    what stays: the topic page of a live contact, the authed contact
 *        topics, /p/center (page, leaving a list, the Z177 refusal);
 *   Q    SQL statements of one GET and one POST.
 *
 * A webhook is fire-and-forget (emitEmailEvent → dispatchEvent, not awaited), so
 * every cell waits SETTLE_MS before counting; a cell expecting none counts none
 * after that wait. Everything measured is printed as `Z187_API_CELLS_JSON …`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { JobType } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import { createTrackingToken, type TrackingPayload } from '@forgemsg/shared';
import { redis } from '@forgemsg/shared/redis';
import { login, SEED, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { observeQueries } from '../db/explain-guard.js';
import { webhookQueue } from '../lib/queues.js';
import { generateUnsubscribeToken } from '../routes/v1/subscriptions.js';

const { buildApp } = await import('../index.js');

const TAG = `z187-${randomUUID().slice(0, 8)}`;
const DOMAIN = `${TAG}.test`;
const octet = () => 1 + Math.floor(Math.random() * 250);
// This file's own address: its own rate-limit buckets.
const IP = `100.64.187.${octet()}`;
const DAY = 86_400;
const OLD = 31 * DAY;
const SETTLE_MS = 1_200;
const PERSON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';
const AS_BROWSER = {
  accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
  'accept-language': 'cs',
  'user-agent': PERSON_UA,
};
const JSON_UA = { 'user-agent': PERSON_UA };
const HOOK_EVENTS = ['email.group_resubscribe', 'email.group_unsubscribe'] as const;
const ALL_JOBS: JobType[] = ['waiting', 'delayed', 'active', 'completed', 'failed', 'paused'];

let app: FastifyInstance;
let seedSession: Session;
let seedOrgId = '';
let orgA = '';
let orgB = '';
let owner: Record<string, string> = {};
let seedBefore: Record<string, unknown> = {};
let T1 = '';
let T_OFF = '';
let T_B = '';
let L = '';
const rawKeys: string[] = [];
const legacyTokens: string[] = [];
const report: Record<string, unknown> = {
  tag: TAG,
  mock: 'none — the real app, database and Redis; no worker runs in this process',
  tokens:
    'minted with the same secret and shape as the batch-sender e-mail one; only ts is changed',
  settleMs: SETTLE_MS,
};
const cells: Record<string, unknown> = {};
let n = 0;

const rows = async <T>(q: SQL) => (await db.execute(q)) as unknown as T[];
const address = (label: string) => `${label}-${n++}-${TAG}@${DOMAIN}`;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const nowS = () => Math.floor(Date.now() / 1000);
const settle = () => new Promise((r) => setTimeout(r, SETTLE_MS));
const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

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
      rateLimitWaits.push({ url: url.split('/').slice(0, 3).join('/'), retryAfterS });
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

/** The body with this run's ids, tag and token taken out — comparable between runs. */
function normalised(body: string, token?: string): string {
  let b = token ? body.split(token).join('<token>') : body;
  b = b.split(TAG).join('<tag>');
  return b
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>')
    .replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, '<ts>');
}

function answer(r: Res): { status: number; data: unknown } {
  let parsed: unknown = r.body;
  try {
    parsed = JSON.parse(r.body);
  } catch {
    // not JSON — kept as text
  }
  const data =
    r.status < 300 && parsed && typeof parsed === 'object' && 'data' in parsed
      ? (parsed as { data: unknown }).data
      : parsed;
  return { status: r.status, data };
}

/** The seed org as a whole: this file must leave it exactly as it found it. */
async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await rows<Record<string, unknown>>(sql`
    SELECT (SELECT count(*)::int FROM contacts WHERE org_id = ${seedOrgId}::uuid) AS contacts,
           (SELECT count(*)::int FROM contacts WHERE org_id = ${seedOrgId}::uuid AND deleted_at IS NOT NULL) AS contacts_deleted,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId}::uuid) AS suppressions,
           (SELECT count(*)::int FROM lists WHERE org_id = ${seedOrgId}::uuid) AS lists,
           (SELECT count(*)::int FROM contact_lists cl JOIN contacts c ON c.id = cl.contact_id WHERE c.org_id = ${seedOrgId}::uuid) AS memberships,
           (SELECT count(*)::int FROM subscription_topics WHERE org_id = ${seedOrgId}::uuid) AS topics,
           (SELECT count(*)::int FROM contact_topic_subscriptions WHERE org_id = ${seedOrgId}::uuid) AS topic_rows,
           (SELECT count(*)::int FROM webhooks WHERE org_id = ${seedOrgId}::uuid) AS webhooks,
           (SELECT count(*)::int FROM webhook_deliveries WHERE org_id = ${seedOrgId}::uuid) AS deliveries,
           (SELECT count(*)::int FROM consent_events WHERE org_id = ${seedOrgId}::uuid) AS consent_events,
           (SELECT count(*)::int FROM email_events WHERE org_id = ${seedOrgId}::uuid) AS email_events,
           (SELECT count(*)::int FROM campaigns WHERE org_id = ${seedOrgId}::uuid) AS campaigns,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${seedOrgId}::uuid) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${seedOrgId}::uuid) AS api_keys
  `);
  return r!;
}

interface Person {
  id: string;
  email: string;
}

/** An active contact of org A, through the route. */
async function person(label: string): Promise<Person> {
  const email = address(label);
  const c = await asOwner('POST', '/api/v1/contacts', { email, firstName: 'Petra' });
  return { id: c.data.id, email };
}

/** A pref token in the shape the batch sender signs, `ageS` seconds old. */
function prefToken(contactId: string, ageS = 0, org = orgA): string {
  return createTrackingToken({ type: 'pref', orgId: org, contactId, ts: nowS() - ageS });
}

/** The same shape without `ts`. */
function noTsPrefToken(contactId: string): string {
  const payload: Record<string, unknown> = { type: 'pref', orgId: orgA, contactId };
  return createTrackingToken(payload as unknown as TrackingPayload);
}

type Mint = (contactId: string) => string;
const MINTS: Record<'fresh' | 'old' | 'noTs' | 'future', Mint> = {
  fresh: (id) => prefToken(id),
  old: (id) => prefToken(id, OLD),
  noTs: (id) => noTsPrefToken(id),
  future: (id) => prefToken(id, -3600),
};

const topicName = (id: string) =>
  id === T1 ? 'T1' : id === T_OFF ? 'T_OFF' : id === T_B ? 'T_B' : 'other';

/** Everything a topic change writes or sends for this contact. */
async function effects(contactId: string) {
  const topicRows = await rows<{ topic_id: string; org_id: string; status: string }>(sql`
    SELECT topic_id, org_id, status FROM contact_topic_subscriptions
    WHERE contact_id = ${contactId}::uuid ORDER BY topic_id
  `);
  const events = await rows<{ scope: string | null; topic_id: string | null }>(sql`
    SELECT metadata->>'scope' AS scope, metadata->>'topicId' AS topic_id FROM email_events
    WHERE contact_id = ${contactId}::uuid AND event_type = 'unsubscribe' ORDER BY created_at
  `);
  const deliveries = await rows<{ id: string; event: string; topic_id: string | null }>(sql`
    SELECT id, event::text AS event, payload->'data'->>'topicId' AS topic_id
    FROM webhook_deliveries
    WHERE org_id = ${orgA}::uuid AND payload->'data'->>'contactId' = ${contactId}
    ORDER BY created_at
  `);
  const deliveryIds = new Set(deliveries.map((d) => d.id));
  const jobs = (await webhookQueue.getJobs(ALL_JOBS, 0, 10_000)).filter((j) =>
    deliveryIds.has((j?.data as { deliveryId?: string } | undefined)?.deliveryId ?? ''),
  );
  // Only the topic events: the stream carries every org event (contact.created…).
  const stream = (await redis.xrange(`events:stream:${orgA}`, '-', '+')).filter(
    ([, f]) =>
      (HOOK_EVENTS as readonly string[]).includes(f[f.indexOf('event') + 1] ?? '') &&
      (f[f.indexOf('data') + 1] ?? '').includes(contactId),
  );
  const [consent] = await rows<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM consent_events WHERE contact_id = ${contactId}::uuid
  `);
  return {
    topicRows: topicRows.map(
      (r) => `${topicName(r.topic_id)}:${r.status}${r.org_id === orgA ? '' : '@other-org'}`,
    ),
    unsubscribeEvents: events.map((e) => `${e.scope}:${e.topic_id ? topicName(e.topic_id) : '-'}`),
    webhookDeliveries: deliveries.map(
      (d) => `${d.event}:${d.topic_id ? topicName(d.topic_id) : '-'}`,
    ),
    webhookJobs: jobs.length,
    streamEntries: stream.map(([, f]) => f[f.indexOf('event') + 1]),
    consentEvents: consent!.n,
  };
}
type Effects = Awaited<ReturnType<typeof effects>>;

async function topicGet(token: string) {
  const r = await inject('GET', `/public/topics/${token}`, JSON_UA);
  return {
    status: r.status,
    body: sha(normalised(r.body, token)),
    text: normalised(r.body, token),
  };
}

async function topicPost(token: string, topicId: string, status: 'subscribed' | 'unsubscribed') {
  const r = await inject('POST', `/public/topics/${token}`, JSON_UA, { topicId, status });
  await settle();
  return answer(r);
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  seedSession = await login(app);
  seedOrgId = seedSession.orgId;
  seedBefore = await seedState();

  const [a] = await rows<{ id: string }>(sql`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`${TAG} org A`}, ${`${TAG}-a`}, 'production', 'Obchod z187 s.r.o.', 'Nádražní 1, 110 00 Praha')
    RETURNING id
  `);
  orgA = a!.id;
  const [b] = await rows<{ id: string }>(sql`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`${TAG} org B`}, ${`${TAG}-b`}, 'production', 'Jiný obchod z187 s.r.o.', 'Nádražní 2, 110 00 Praha')
    RETURNING id
  `);
  orgB = b!.id;
  await db.execute(sql`
    INSERT INTO organization_members (org_id, user_id, email, role, status)
    VALUES (${orgA}::uuid, ${seedSession.userId}::uuid, ${SEED.email}, 'owner', 'active')
  `);
  const r = await inject(
    'POST',
    '/api/v1/me/orgs/switch',
    { cookie: seedSession.cookie },
    { orgId: orgA },
  );
  expect(r.status, r.body).toBe(200);
  const ownerToken = (JSON.parse(r.body) as { data: { token: string } }).data.token;
  owner = bearer(ownerToken);
  // The sessions' own rate-limit buckets are removed at the end.
  rawKeys.push(ownerToken, seedSession.token);

  T1 = (
    await asOwner('POST', '/api/v1/topics', {
      name: `${TAG}-news`,
      displayName: `${TAG} Novinky`,
      defaultStatus: 'opt_out',
    })
  ).data.id;
  T_OFF = (
    await asOwner('POST', '/api/v1/topics', {
      name: `${TAG}-off`,
      displayName: `${TAG} Vypnuté`,
      defaultStatus: 'opt_in',
    })
  ).data.id;
  await asOwner('PATCH', `/api/v1/topics/${T_OFF}`, { active: false });
  const [tb] = await rows<{ id: string }>(sql`
    INSERT INTO subscription_topics (org_id, name, display_name, default_status)
    VALUES (${orgB}::uuid, ${`${TAG}-b-news`}, ${`${TAG} B Novinky`}, 'opt_in')
    RETURNING id
  `);
  T_B = tb!.id;
  L = (await asOwner('POST', '/api/v1/lists', { name: `${TAG} L` })).data.id;
  const hook = await asOwner('POST', '/api/v1/webhooks', {
    url: `https://example.com/${TAG}`,
    events: [...HOOK_EVENTS],
    description: TAG,
  });
  report.setup = {
    webhookCreated: typeof hook.data.id === 'string',
    webhookEvents: HOOK_EVENTS,
    webhookUrl: 'https://example.com/<tag>',
  };
}, 120_000);

afterAll(async () => {
  // The webhook jobs of this file's deliveries: no worker runs here, so they wait.
  const deliveryIds = new Set(
    (
      await rows<{ id: string }>(sql`
        SELECT id FROM webhook_deliveries WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)
      `)
    ).map((d) => d.id),
  );
  let jobsRemoved = 0;
  for (const j of await webhookQueue.getJobs(ALL_JOBS, 0, 10_000)) {
    if (j && deliveryIds.has((j.data as { deliveryId?: string }).deliveryId ?? '')) {
      await j.remove();
      jobsRemoved++;
    }
  }
  const streamsRemoved =
    (await redis.del(`events:stream:${orgA}`)) + (await redis.del(`events:stream:${orgB}`));
  for (const tk of legacyTokens) {
    for (const k of [`unsub:${tk}`, `pref:${tk}`]) await redis.del(k);
  }
  let legacyKeysLeft = 0;
  for (const tk of legacyTokens)
    legacyKeysLeft += (await redis.exists(`unsub:${tk}`)) + (await redis.exists(`pref:${tk}`));
  let limitKeysRemoved = 0;
  const patterns = [
    ...rawKeys.map((k) => `*${createHash('sha256').update(k).digest('hex').slice(0, 32)}*`),
    `*${IP}*`,
  ];
  for (const p of patterns) {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', p, 'COUNT', 1000);
      cursor = next;
      for (const k of keys) {
        await redis.del(k);
        limitKeysRemoved++;
      }
    } while (cursor !== '0');
  }
  for (const org of [orgA, orgB].filter(Boolean)) {
    await db.execute(sql`DELETE FROM webhook_deliveries WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM email_events WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM consent_events WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM audit_logs WHERE org_id = ${org}::uuid`);
    await db.execute(sql`DELETE FROM api_keys WHERE org_id = ${org}::uuid`);
    // Everything else of the organisation goes with it (ON DELETE CASCADE).
    await db.execute(sql`DELETE FROM organizations WHERE id = ${org}::uuid`);
  }
  const [left] = await rows<Record<string, number>>(sql`
    SELECT (SELECT count(*)::int FROM organizations WHERE id IN (${orgA}::uuid, ${orgB}::uuid)) AS orgs,
           (SELECT count(*)::int FROM contacts WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS suppressions,
           (SELECT count(*)::int FROM subscription_topics WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS topics,
           (SELECT count(*)::int FROM contact_topic_subscriptions WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS topic_rows,
           (SELECT count(*)::int FROM webhooks WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS webhooks,
           (SELECT count(*)::int FROM webhook_deliveries WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS deliveries,
           (SELECT count(*)::int FROM email_events WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS email_events,
           (SELECT count(*)::int FROM consent_events WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS consent_events,
           (SELECT count(*)::int FROM lists WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS lists,
           (SELECT count(*)::int FROM organization_members WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS api_keys
  `);
  const jobsLeft = (await webhookQueue.getJobs(ALL_JOBS, 0, 10_000)).filter(
    (j) => j && deliveryIds.has((j.data as { deliveryId?: string }).deliveryId ?? ''),
  ).length;
  const seedAfter = await seedState();
  report.cells = cells;
  report.rateLimitWaits = rateLimitWaits;
  report.leftover = {
    ...left,
    jobsLeft,
    jobsRemoved,
    streamsRemoved,
    legacyKeysLeft,
    limitKeysRemoved,
  };
  report.seedOrg = { before: seedBefore, after: seedAfter };
  const all = JSON.stringify(report);
  const parts = Math.ceil(all.length / 3000);
  for (let i = 0; i < parts; i++)
    console.log(
      `Z187_API_CELLS_JSON ${String(i).padStart(4, '0')}/${parts} ${all.slice(i * 3000, (i + 1) * 3000)}`,
    );
  await app.close();
  expect(left, 'what this file made was not all removed').toEqual({
    orgs: 0,
    contacts: 0,
    suppressions: 0,
    topics: 0,
    topic_rows: 0,
    webhooks: 0,
    deliveries: 0,
    email_events: 0,
    consent_events: 0,
    lists: 0,
    members: 0,
    api_keys: 0,
  });
  expect(jobsLeft).toBe(0);
  expect(legacyKeysLeft).toBe(0);
  expect(seedAfter, 'the seed organisation changed').toEqual(seedBefore);
}, 180_000);

/** What a refused or unknown request leaves: nothing at all. */
const NOTHING: Effects = {
  topicRows: [],
  unsubscribeEvents: [],
  webhookDeliveries: [],
  webhookJobs: 0,
  streamEntries: [],
  consentEvents: 0,
};

describe('the public topic page of the preference-centre link (Z187)', { timeout: 240_000 }, () => {
  it('T — joining a topic the contact left: only a link younger than 30 days does it', async () => {
    const out: Record<string, unknown> = {};
    for (const [name, mint] of Object.entries(MINTS)) {
      const p = await person(`t-${name}`);
      // The contact left T1 through a fresh link first: the realistic case of a
      // way back — someone who said no, and an old e-mail that says yes.
      const left = await topicPost(prefToken(p.id), T1, 'unsubscribed');
      const before = await effects(p.id);
      const token = mint(p.id);
      const get = await topicGet(token);
      const post = await topicPost(token, T1, 'subscribed');
      out[name] = {
        left,
        before,
        get: { status: get.status, body: get.body },
        post,
        after: await effects(p.id),
      };
    }
    cells.T = out;

    const BEFORE: Effects = {
      topicRows: ['T1:unsubscribed'],
      unsubscribeEvents: ['topic:T1'],
      webhookDeliveries: ['email.group_unsubscribe:T1'],
      webhookJobs: 1,
      streamEntries: ['email.group_unsubscribe'],
      consentEvents: 0,
    };
    const fresh = out.fresh as {
      before: Effects;
      get: { status: number };
      post: unknown;
      after: Effects;
    };
    expect(fresh.before).toEqual(BEFORE);
    expect(fresh.get.status).toBe(200);
    expect(fresh.post).toEqual({ status: 200, data: { ok: true } });
    expect(fresh.after).toEqual({
      topicRows: ['T1:subscribed'],
      unsubscribeEvents: ['topic:T1'],
      webhookDeliveries: ['email.group_unsubscribe:T1', 'email.group_resubscribe:T1'],
      webhookJobs: 2,
      streamEntries: ['email.group_unsubscribe', 'email.group_resubscribe'],
      consentEvents: 0,
    });
    for (const name of ['old', 'noTs', 'future']) {
      const c = out[name] as {
        before: Effects;
        get: { status: number };
        post: unknown;
        after: Effects;
      };
      expect(c.before, name).toEqual(BEFORE);
      // Viewing is never limited.
      expect(c.get.status, name).toBe(200);
      expect(c.post, `${name}: the answer`).toEqual({
        status: 200,
        data: { ok: false, resubscribeRefused: 'link_expired' },
      });
      expect(c.after, `${name}: an old link joined the contact back`).toEqual(BEFORE);
    }
  });

  it('O — leaving a topic works with a link of any age, exactly as before', async () => {
    const out: Record<string, unknown> = {};
    for (const name of ['fresh', 'old', 'noTs'] as const) {
      const p = await person(`o-${name}`);
      const post = await topicPost(MINTS[name](p.id), T1, 'unsubscribed');
      out[name] = { post, after: await effects(p.id) };
    }
    cells.O = out;
    for (const name of ['fresh', 'old', 'noTs']) {
      expect(out[name], name).toEqual({
        post: { status: 200, data: { ok: true } },
        after: {
          topicRows: ['T1:unsubscribed'],
          unsubscribeEvents: ['topic:T1'],
          webhookDeliveries: ['email.group_unsubscribe:T1'],
          webhookJobs: 1,
          streamEntries: ['email.group_unsubscribe'],
          consentEvents: 0,
        },
      });
    }
  });

  it('D — a deleted contact, an erased one and a contact of another organisation: 404, nothing written', async () => {
    const deleted = await person('d-deleted');
    const deletedRes = await inject('DELETE', `/api/v1/contacts/${deleted.id}`, owner);
    const erased = await person('d-erased');
    const erasedRes = await inject('POST', `/api/v1/contacts/${erased.id}/anonymize`, owner, {});
    const [foreign] = await rows<{ id: string }>(sql`
      INSERT INTO contacts (org_id, email, first_name, status)
      VALUES (${orgB}::uuid, ${address('d-foreign')}, 'Petra', 'active')
      RETURNING id
    `);
    const subjects: [string, string][] = [
      ['deleted', deleted.id],
      ['erased', erased.id],
      ['foreign', foreign!.id],
    ];
    const out: Record<string, unknown> = {
      setup: { delete: deletedRes.status, anonymize: erasedRes.status },
    };
    for (const [name, id] of subjects) {
      const [row] = await rows<{ exists: boolean; deleted: boolean }>(sql`
        SELECT true AS exists, deleted_at IS NOT NULL AS deleted FROM contacts WHERE id = ${id}::uuid
      `);
      const before = await effects(id);
      const get = await topicGet(prefToken(id));
      const sub = await topicPost(prefToken(id), T1, 'subscribed');
      const unsub = await topicPost(prefToken(id), T1, 'unsubscribed');
      out[name] = {
        contactRow: row ?? { exists: false },
        before,
        get: { status: get.status, body: get.status === 200 ? get.body : get.text },
        subscribed: sub,
        unsubscribed: unsub,
        after: await effects(id),
      };
    }
    cells.D = out;
    expect(deletedRes.status).toBe(204);
    expect(erasedRes.status).toBe(200);
    for (const [name] of subjects) {
      const c = out[name] as {
        get: { status: number };
        subscribed: { status: number };
        unsubscribed: { status: number };
        after: Effects;
      };
      expect(
        [c.get.status, c.subscribed.status, c.unsubscribed.status],
        `${name}: GET, POST subscribed, POST unsubscribed`,
      ).toEqual([404, 404, 404]);
      expect(c.after, `${name}: something was written or sent`).toEqual(NOTHING);
    }
  });

  it('X — a topic of another organisation, an unknown one, a switched-off one: 404, nothing written', async () => {
    const out: Record<string, unknown> = {};
    const topics: [string, string][] = [
      ['otherOrg', T_B],
      ['unknown', randomUUID()],
      ['inactive', T_OFF],
    ];
    for (const [name, topicId] of topics) {
      for (const status of ['subscribed', 'unsubscribed'] as const) {
        const p = await person(`x-${name}-${status}`);
        const post = await topicPost(prefToken(p.id), topicId, status);
        out[`${name}/${status}`] = {
          post: { status: post.status, data: post.status < 500 ? post.data : '<500>' },
          after: await effects(p.id),
        };
      }
    }
    cells.X = out;
    for (const key of Object.keys(out)) {
      const c = out[key] as { post: { status: number }; after: Effects };
      expect(c.post.status, key).toBe(404);
      expect(c.after, `${key}: something was written or sent`).toEqual(NOTHING);
    }
  });

  it('P — the legacy GET /api/v1/preferences/:token answers with the masked address', async () => {
    const p = await person('p-legacy');
    await asOwner('POST', `/api/v1/lists/${L}/contacts`, { contactId: p.id });
    const legacy = await generateUnsubscribeToken(p.id, orgA);
    legacyTokens.push(legacy);
    const r = await inject('GET', `/api/v1/preferences/${legacy}`, JSON_UA);
    const data = (r.status === 200 ? JSON.parse(r.body).data : {}) as Record<string, unknown>;
    const signed = await inject('GET', `/api/v1/preferences/${prefToken(p.id)}`, JSON_UA);
    const local = p.email.slice(0, p.email.indexOf('@'));
    const masked = `${local[0]}*****${local[local.length - 1]}@${DOMAIN}`;
    const cell = {
      status: r.status,
      keys: Object.keys(data).sort(),
      emailIsFullAddress: data.email === p.email,
      emailMasked: typeof data.emailMasked === 'string' ? normalised(data.emailMasked) : null,
      bodyHasFullAddress: r.body.includes(p.email),
      rest: {
        status: data.status,
        memberships: normalised(JSON.stringify(data.memberships ?? null)),
      },
      signedToken: { status: signed.status, body: sha(normalised(signed.body)) },
    };
    cells.P = cell;
    expect(r.status).toBe(200);
    expect(cell.keys).toEqual(['emailMasked', 'memberships', 'status']);
    expect(data.emailMasked).toBe(masked);
    expect(cell.bodyHasFullAddress, 'the full address is in the answer').toBe(false);
    expect(cell.rest.status).toBe('active');
    expect((data.memberships as { listId: string }[]).map((m) => m.listId)).toEqual([L]);
  });

  it('K — what stays: the topic page of a live contact, the authed contact topics, /p/center', async () => {
    const p = await person('k-live');
    await asOwner('POST', `/api/v1/lists/${L}/contacts`, { contactId: p.id });
    const fresh = prefToken(p.id);
    const topicsPage = await topicGet(fresh);
    const authed = await inject('GET', `/api/v1/contacts/${p.id}/topics`, owner);
    const authedPut = await inject('PUT', `/api/v1/contacts/${p.id}/topics`, owner, {
      topicId: T1,
      status: 'subscribed',
    });
    const centrePage = await inject('GET', `/p/center/${fresh}`, AS_BROWSER);
    // The page shows the masked address; its last letter comes from this run's tag.
    const local = p.email.slice(0, p.email.indexOf('@'));
    const maskedHere = `${local[0]}*****${local[local.length - 1]}@${DOMAIN}`;
    const centreList = await inject('POST', `/p/center/${fresh}`, JSON_UA, {
      unsubscribeFromLists: [L],
    });
    const back = await inject('POST', `/p/center/${prefToken(p.id, OLD)}`, JSON_UA, {
      resubscribeToLists: [L],
    });
    await settle();
    const cell = {
      topicsPage: { status: topicsPage.status, body: topicsPage.body, text: topicsPage.text },
      authedContactTopics: { status: authed.status, body: sha(normalised(authed.body)) },
      authedPut: { status: authedPut.status, body: sha(normalised(authedPut.body)) },
      centrePage: {
        status: centrePage.status,
        maskedAddressShown: centrePage.body.includes(maskedHere),
        body: sha(normalised(centrePage.body.split(maskedHere).join('<masked>'), fresh)),
      },
      centreList: answer(centreList),
      centreOldWayBack: answer(back),
      after: await effects(p.id),
    };
    cells.K = cell;
    expect(cell.topicsPage.status).toBe(200);
    expect(JSON.parse(topicsPage.text)).toEqual({
      data: [
        {
          topicId: '<uuid>',
          name: '<tag>-news',
          displayName: '<tag> Novinky',
          description: null,
          subscribed: false,
        },
      ],
    });
    expect(authed.status).toBe(200);
    expect(centrePage.status).toBe(200);
    expect(cell.centreList).toEqual({
      status: 200,
      data: { globallyUnsubscribed: false, listChanges: [{ listId: L, subscribed: false }] },
    });
    expect(cell.centreOldWayBack.status).toBe(200);
    // Leaving the list writes its own rows (email_events, consent_events);
    // nothing of it is a topic row or a topic webhook.
    expect([cell.after.topicRows, cell.after.webhookDeliveries]).toEqual([[], []]);
  });

  it('Q — SQL statements of one GET and one POST of the topic page (fresh link, live contact)', async () => {
    const p = await person('q');
    const measure = async (send: () => Promise<Res>) => {
      let count = 0;
      const stop = observeQueries(() => {
        count += 1;
      });
      let status = 0;
      try {
        status = (await send()).status;
      } finally {
        stop();
      }
      return { status, sql: count };
    };
    const token = prefToken(p.id);
    const get = await measure(() => inject('GET', `/public/topics/${token}`, JSON_UA));
    const post = await measure(() =>
      inject('POST', `/public/topics/${token}`, JSON_UA, { topicId: T1, status: 'subscribed' }),
    );
    await settle();
    cells.Q = {
      get,
      post,
      note: 'POST counts what ran before the answer; the webhook runs after it, not awaited',
    };
    expect(get.status).toBe(200);
    expect(post.status).toBe(200);
  });
});
