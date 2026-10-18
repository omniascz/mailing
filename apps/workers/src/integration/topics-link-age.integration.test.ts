/**
 * The public topic page of the e-mail's preference link — walked from the e-mail
 * to the engine (Z187). The routes, rows, webhooks and answers of every case
 * are pinned in apps/api/src/integration/topics-link-age.
 *
 * ─── What this file answers ──────────────────────────────────────────────────
 *
 * Does a topic decide anything about sending? contact_topic_subscriptions is
 * read by nothing outside services/topics (git grep, Z187 Sonda 3), so a
 * campaign to a list reaches a contact who left a topic, and a transactional
 * e-mail does too — on master and on the branch alike. And the token the topic
 * page takes is the e-mail's own preference link: its shape is read out of the
 * message the engine was handed, not minted here.
 *
 * ─── How it is measured ──────────────────────────────────────────────────────
 *
 * Real HTTP to the running API (127.0.0.1): an organisation of this file
 * (INSERT), the owner session from POST /me/orgs/switch, a secret key from POST
 * /api/v1/api-keys; the verified sending domain is INSERTed (DNS cannot be
 * verified in CI). A campaign to L, campaign → splitter → batch-sender →
 * mta-sender; the gRPC client of the engine is the only stub: "engine" below
 * means it was handed the message.
 *
 *   S1  the first campaign to L reaches ctrl, `a` and `b`; their preference
 *       links carry {type, orgId, contactId, ts};
 *   L   `a` leaves topic T1 through the topic page with the e-mail's link;
 *       `b` views the page and joins T1 with it (a fresh link);
 *   K   the next campaign to L reaches all three; a transactional e-mail to
 *       `a` goes out.
 *
 * Everything measured is printed as `Z187_FLOW_CELLS_JSON …` chunks.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { type Job, type JobType, type Queue } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { redis } from '@forgemsg/shared/redis';
import { SEED_LOGIN, authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processAtOrgRate } from './setup/process-at-org-rate.js';
import { processBatchSender } from '../jobs/batch-sender.js';
import { processCampaignSplitter } from '../jobs/campaign-splitter.js';
import {
  batchSenderQueue,
  campaignSplitterQueue,
  mtaQueues,
  type BatchSenderJobData,
  type CampaignSplitterJobData,
  type MtaSendJobData,
} from '../queues/index.js';

const engine = vi.hoisted(() => ({
  handed: [] as { to: string; subject: string; html: string }[],
}));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string; subject: string; htmlBody: string }) => {
    engine.handed.push({ to: msg.toEmail.toLowerCase(), subject: msg.subject, html: msg.htmlBody });
    return {
      success: true,
      messageId: 'm',
      smtpCode: 250,
      smtpMessage: 'OK',
      error: '',
      durationMs: '1',
      sendingIp: '',
    };
  },
}));

const API = process.env.API_URL!;
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
const tag = randomUUID().slice(0, 8);
const OPEN: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];
const ALL: JobType[] = [...OPEN, 'completed', 'failed'];
const PERSON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';
const nowS = () => Math.floor(Date.now() / 1000);

interface Org {
  id: string;
  owner: string;
  key: string;
  domain: string;
}

let seed: SeedOrg;
let seedKey = '';
let seedBefore: Record<string, unknown> = {};
let org: Org;
const report: Record<string, unknown> = {
  tag,
  mock: 'the gRPC client of the engine only; real API over HTTP (127.0.0.1), queues, splitter, batch-sender, mta-sender',
  tokens: 'every link used is read out of the message the engine got',
};
const cells: Record<string, unknown> = {};
const rateLimitWaits: string[] = [];

const addr = (name: string) => `z187-${name}-${tag}@test.local`.toLowerCase();

interface Res {
  status: number;
  text: string;
  location: string | null;
}

async function call(
  method: string,
  path: string,
  credential: string | null,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Res> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        ...(credential ? authHeaders(credential) : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    if (res.status === 429 && attempt < 20) {
      const wait = Number(res.headers.get('retry-after') ?? '5');
      rateLimitWaits.push(`${method} ${path.split('/').slice(0, 3).join('/')} ${wait}s`);
      await new Promise((r) => setTimeout(r, (Math.max(1, wait) + 1) * 1000));
      continue;
    }
    return { status: res.status, text, location: res.headers.get('location') };
  }
}

interface Created {
  data: { id: string; key?: string; rawKey?: string; apiKey?: string; token?: string };
}

async function api(cred: string, method: string, path: string, body?: unknown): Promise<Created> {
  const r = await call(method, path, cred, body);
  if (r.status >= 300)
    throw new Error(`[z187] ${method} ${path} → ${r.status}: ${r.text.slice(0, 300)}`);
  return (r.text ? JSON.parse(r.text) : { data: { id: '' } }) as Created;
}

async function makeOrg(): Promise<Org> {
  const domain = `z187-${tag}.test`;
  const [o] = await sql<{ id: string }[]>`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`z187 ${tag}`}, ${`z187-${tag}`}, 'production', 'Obchod z187 s.r.o.',
            'Nádražní 1, 110 00 Praha')
    RETURNING id
  `;
  await sql`
    INSERT INTO organization_members (org_id, user_id, email, role, status)
    SELECT ${o!.id}, id, email, 'owner', 'active' FROM users WHERE email = ${SEED_LOGIN.email}
  `;
  const r = await call('POST', '/api/v1/me/orgs/switch', seedKey, { orgId: o!.id });
  expect(r.status, r.text).toBe(200);
  const owner = (JSON.parse(r.text) as { data: { token: string } }).data.token;
  await sql`
    INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
    VALUES (${o!.id}, ${domain}, 'fm1', true, true, true, true)
  `;
  const k = await api(owner, 'POST', '/api/v1/api-keys', { name: `z187 ${tag}` });
  const key = (k.data.key ?? k.data.rawKey ?? k.data.apiKey) as string;
  return { id: o!.id, owner, key, domain };
}

/** Every queued MTA job for `to` through the real processor; returns the statuses. */
async function deliver(to: string): Promise<string[]> {
  const out: string[] = [];
  const jobs = ((await mtaQueues.other.getJobs(OPEN, 0, 10_000)) as Job<MtaSendJobData>[]).filter(
    (j) => j?.data?.toEmail?.toLowerCase() === to.toLowerCase(),
  );
  for (const j of jobs) {
    const last = { data: j.data, opts: { attempts: 1 }, attemptsMade: 0, log: async () => {} };
    try {
      const r = (await processAtOrgRate(last as unknown as Job<MtaSendJobData>)) as {
        status: string;
      };
      out.push(`${r.status}/${j.data.stream}/${j.data.purpose ?? '-'}`);
    } catch (err) {
      out.push(`threw ${(err as Error).message.slice(0, 80)}`);
    }
    await j.remove().catch(() => {});
  }
  return out;
}

const job = <T>(data: T): Job<T> =>
  ({
    id: `z187-${randomUUID()}`,
    timestamp: Date.now(),
    data,
    log: async () => {},
  }) as unknown as Job<T>;

async function idsOn(queue: Queue): Promise<Set<string>> {
  const jobs = await queue.getJobs(ALL, 0, 10_000);
  return new Set(jobs.map((j) => String(j?.id)));
}
async function addedTo<T>(queue: Queue, before: Set<string>): Promise<T[]> {
  const jobs = await queue.getJobs(ALL, 0, 10_000);
  return jobs.filter((j) => j && !before.has(String(j.id))).map((j) => j.data as T);
}

const blocks = [
  {
    id: 'b1',
    type: 'text',
    content: '<p>Dobrý den.</p><p><a href="{{preference_center_url}}">Nastavení odběru</a></p>',
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
const globalStyles = {
  backgroundColor: '#fff',
  contentBackgroundColor: '#fff',
  fontFamily: 'Arial',
  linkColor: '#00f',
  textColor: '#000',
  contentWidth: 600,
};

/** Every href of a message, a click-tracking redirect unwrapped to its destination. */
function hrefs(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const raw = m[1]!.replace(/&amp;/g, '&');
    const tracked = /\/track\/c\/([^".]+)/.exec(raw);
    if (tracked) {
      const json = Buffer.from(tracked[1]!, 'base64url').toString('utf8');
      out.push((JSON.parse(json) as { url: string }).url);
    } else out.push(raw);
  }
  return out;
}

/** The token after `prefix` in the first link that has one. */
function tokenIn(links: string[], prefix: string): string | null {
  for (const l of links) {
    const i = l.indexOf(prefix);
    if (i >= 0) return l.slice(i + prefix.length).split(/[?#"]/)[0]!;
  }
  return null;
}

/** A campaign to `listId`, all the way to the engine; who it reached and their links. */
async function campaignTo(listId: string, recipients: string[]) {
  const subject = `Novinky ${randomUUID().slice(0, 8)}`;
  const created = await api(org.owner, 'POST', '/api/v1/campaigns', {
    name: `z187 ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail: `noreply@${org.domain}`,
    listId,
    content: { subject, blocks, globalStyles },
  });
  const campaignId = created.data.id;
  const beforeSplit = await idsOn(campaignSplitterQueue);
  const send = await call('POST', `/api/v1/campaigns/${campaignId}/send`, org.owner);
  const [split] = (
    await addedTo<CampaignSplitterJobData>(campaignSplitterQueue, beforeSplit)
  ).filter((d) => d.campaignId === campaignId);
  const errors: string[] = [];
  if (split) {
    const beforeBatch = await idsOn(batchSenderQueue);
    await processCampaignSplitter(job(split)).catch((e) =>
      errors.push(`splitter: ${(e as Error).message.slice(0, 200)}`),
    );
    const batches = (await addedTo<BatchSenderJobData>(batchSenderQueue, beforeBatch)).filter(
      (d) => d.campaignId === campaignId,
    );
    for (const b of batches)
      await processBatchSender(job(b)).catch((e) =>
        errors.push(`batch: ${(e as Error).message.slice(0, 200)}`),
      );
  }
  engine.handed.length = 0;
  for (const to of recipients) await deliver(to);
  const mails = engine.handed.filter((m) => m.subject === subject);
  const reached = mails.map((m) => m.to.replace(`-${tag}@test.local`, '')).sort();
  const links: Record<string, { pref: string | null; unsub: string | null }> = {};
  for (const m of mails) {
    const l = hrefs(m.html);
    links[m.to] = { pref: tokenIn(l, '/p/center/'), unsub: tokenIn(l, '/api/v1/unsubscribe/') };
  }
  return {
    campaignId,
    send:
      send.status === 200 || send.status === 202
        ? send.status
        : `${send.status} ${send.text.slice(0, 160)}`,
    reached,
    links,
    errors,
  };
}

/** The payload of a signed token — its fields, not its signature. */
function payloadOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}

async function topicRows(contactId: string): Promise<string[]> {
  const r = await sql<{ status: string }[]>`
    SELECT status FROM contact_topic_subscriptions WHERE contact_id = ${contactId} ORDER BY topic_id
  `;
  return r.map((x) => x.status);
}

async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await sql<Record<string, unknown>[]>`
    SELECT (SELECT count(*)::int FROM email_events WHERE org_id = o.id) AS email_events,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id) AS suppressions,
           (SELECT count(*)::int FROM contacts WHERE org_id = o.id) AS contacts,
           (SELECT count(*)::int FROM lists WHERE org_id = o.id) AS lists,
           (SELECT count(*)::int FROM contact_lists cl JOIN contacts c ON c.id = cl.contact_id WHERE c.org_id = o.id) AS memberships,
           (SELECT count(*)::int FROM consent_events WHERE org_id = o.id) AS consent_events,
           (SELECT count(*)::int FROM subscription_topics WHERE org_id = o.id) AS topics,
           (SELECT count(*)::int FROM contact_topic_subscriptions WHERE org_id = o.id) AS topic_rows,
           (SELECT count(*)::int FROM campaigns WHERE org_id = o.id) AS campaigns,
           (SELECT count(*)::int FROM organization_members WHERE org_id = o.id) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = o.id) AS api_keys
    FROM organizations o WHERE o.id = ${seed.id}
  `;
  return r!;
}

beforeAll(async () => {
  seed = await readSeedOrg(sql);
  seedBefore = await seedState();
  seedKey = await seedApiKey(sql, `z187-${tag}`);
  org = await makeOrg();
}, 180_000);

afterAll(async () => {
  const id = org?.id ?? '';
  for (const j of (await mtaQueues.other.getJobs(ALL, 0, 10_000)) as Job<MtaSendJobData>[]) {
    if (j && j.data?.orgId === id) await j.remove().catch(() => {});
  }
  for (const j of await batchSenderQueue.getJobs(ALL, 0, 10_000)) {
    if (j && (j.data as BatchSenderJobData)?.orgId === id) await j.remove().catch(() => {});
  }
  for (const j of await campaignSplitterQueue.getJobs(ALL, 0, 10_000)) {
    if (j && (j.data as CampaignSplitterJobData)?.orgId === id) await j.remove().catch(() => {});
  }
  // dispatchEvent appends every org event to the org's stream (webhooks/event-stream.ts).
  const streamsRemoved = id ? await redis.del(`events:stream:${id}`) : 0;
  if (id) {
    await sql`DELETE FROM webhook_deliveries WHERE org_id = ${id}`;
    await sql`DELETE FROM email_events WHERE org_id = ${id}`;
    await sql`DELETE FROM campaigns WHERE org_id = ${id}`;
    await sql`DELETE FROM consent_events WHERE org_id = ${id}`;
    await sql`DELETE FROM suppressions WHERE org_id = ${id}`;
    await sql`DELETE FROM audit_logs WHERE org_id = ${id}`;
    await sql`DELETE FROM api_keys WHERE org_id = ${id}`;
    // Everything else of the organisation goes with it (ON DELETE CASCADE).
    await sql`DELETE FROM organizations WHERE id = ${id}`;
  }
  // Rate-limit counters of this file's keys and session (api/plugins/rate-limit.ts).
  let limitKeysRemoved = 0;
  for (const raw of [seedKey, ...(org ? [org.key, org.owner] : [])]) {
    const d = createHash('sha256').update(raw).digest('hex').slice(0, 32);
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
  const seedKeyName = `integration z187-${tag}`;
  await sql`DELETE FROM api_keys WHERE name = ${seedKeyName}`;
  const [left] = await sql<Record<string, number>[]>`
    SELECT (SELECT count(*)::int FROM organizations WHERE id::text = ${id}) AS orgs,
           (SELECT count(*)::int FROM contacts WHERE org_id::text = ${id}) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id::text = ${id}) AS suppressions,
           (SELECT count(*)::int FROM email_events WHERE org_id::text = ${id}) AS email_events,
           (SELECT count(*)::int FROM consent_events WHERE org_id::text = ${id}) AS consent_events,
           (SELECT count(*)::int FROM campaigns WHERE org_id::text = ${id}) AS campaigns,
           (SELECT count(*)::int FROM lists WHERE org_id::text = ${id}) AS lists,
           (SELECT count(*)::int FROM subscription_topics WHERE org_id::text = ${id}) AS topics,
           (SELECT count(*)::int FROM contact_topic_subscriptions WHERE org_id::text = ${id}) AS topic_rows,
           (SELECT count(*)::int FROM api_keys WHERE name = ${seedKeyName}) AS seed_key
  `;
  const seedAfter = await seedState();
  report.cells = cells;
  report.rateLimitWaits = rateLimitWaits;
  report.leftover = { ...left, limitKeysRemoved, streamsRemoved };
  report.seedOrg = { before: seedBefore, after: seedAfter };
  const all = JSON.stringify(report);
  const parts = Math.ceil(all.length / 3000);
  for (let i = 0; i < parts; i++)
    console.log(
      `Z187_FLOW_CELLS_JSON ${String(i).padStart(4, '0')}/${parts} ${all.slice(i * 3000, (i + 1) * 3000)}`,
    );
  await sql.end();
  expect(left).toEqual({
    orgs: 0,
    contacts: 0,
    suppressions: 0,
    email_events: 0,
    consent_events: 0,
    campaigns: 0,
    lists: 0,
    topics: 0,
    topic_rows: 0,
    seed_key: 0,
  });
  expect(seedAfter, 'the seed organisation changed').toEqual(seedBefore);
}, 300_000);

describe('a topic decides nothing about sending; the topic page takes the e-mail link (Z187)', () => {
  const NAMES = ['ctrl', 'a', 'b'] as const;
  type Name = (typeof NAMES)[number];
  const people = {} as Record<Name, { id: string; email: string }>;
  let L = '';
  let T1 = '';
  let first: Awaited<ReturnType<typeof campaignTo>>;

  it('S1 — the first campaign to L reaches all three; the preference link is {type, orgId, contactId, ts}', async () => {
    L = (await api(org.key, 'POST', '/api/v1/lists', { name: `z187 L ${tag}` })).data.id;
    T1 = (
      await api(org.owner, 'POST', '/api/v1/topics', {
        name: `z187-news-${tag}`,
        displayName: `z187 Novinky ${tag}`,
        defaultStatus: 'opt_in',
      })
    ).data.id;
    for (const k of NAMES) {
      const email = addr(k);
      const b = await api(org.key, 'POST', '/api/v1/contacts', { email, firstName: 'Petra' });
      people[k] = { id: b.data.id, email };
      await api(org.key, 'POST', `/api/v1/lists/${L}/contacts`, { contactId: b.data.id });
    }
    first = await campaignTo(
      L,
      NAMES.map((k) => people[k].email),
    );
    const pref = first.links[people.a.email]?.pref ?? null;
    const payload = pref ? payloadOf(pref) : {};
    const s1 = {
      send: first.send,
      reached: first.reached,
      errors: first.errors,
      prefPayloadKeys: Object.keys(payload).sort(),
      prefPayloadType: payload.type,
      prefTsAgeS: typeof payload.ts === 'number' ? nowS() - payload.ts : null,
      prefOrgIsOrg: payload.orgId === org.id,
      prefContactIsA: payload.contactId === people.a.id,
    };
    cells.S1 = s1;
    expect(first.errors).toEqual([]);
    expect(first.reached).toEqual(['z187-a', 'z187-b', 'z187-ctrl']);
    for (const k of NAMES) expect(first.links[people[k].email]?.pref, k).toBeTruthy();
    expect(s1).toMatchObject({
      prefPayloadKeys: ['contactId', 'orgId', 'ts', 'type'],
      prefPayloadType: 'pref',
      prefOrgIsOrg: true,
      prefContactIsA: true,
    });
  }, 300_000);

  it('L — `a` leaves T1 and `b` joins it through the topic page, with the e-mail links', async () => {
    const topicPage = (method: string, who: Name, body?: unknown) =>
      call(method, `/public/topics/${first.links[people[who].email]!.pref!}`, null, body, {
        'User-Agent': PERSON_UA,
      });
    const aGet = await topicPage('GET', 'a');
    const aLeave = await topicPage('POST', 'a', { topicId: T1, status: 'unsubscribed' });
    const bJoin = await topicPage('POST', 'b', { topicId: T1, status: 'subscribed' });
    const [ev] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM email_events
      WHERE contact_id = ${people.a.id} AND event_type = 'unsubscribe' AND metadata->>'scope' = 'topic'
    `;
    const status: Record<string, string> = {};
    for (const k of NAMES) {
      const [c] = await sql<{ status: string }[]>`
        SELECT status::text AS status FROM contacts WHERE id = ${people[k].id}
      `;
      status[k] = c?.status ?? 'no contact';
    }
    const cell = {
      aGet: aGet.status,
      aGetSubscribed:
        aGet.status === 200
          ? (JSON.parse(aGet.text) as { data: { subscribed: boolean }[] }).data.map(
              (t) => t.subscribed,
            )
          : null,
      aLeave: { status: aLeave.status, body: aLeave.text },
      bJoin: { status: bJoin.status, body: bJoin.text },
      rows: { a: await topicRows(people.a.id), b: await topicRows(people.b.id) },
      aTopicUnsubscribeEvents: ev!.n,
      contactStatus: status,
    };
    cells.L = cell;
    expect(cell.aGet).toBe(200);
    expect(cell.aGetSubscribed).toEqual([true]);
    expect(JSON.parse(aLeave.text)).toEqual({ data: { ok: true } });
    expect(JSON.parse(bJoin.text)).toEqual({ data: { ok: true } });
    expect(cell.rows).toEqual({ a: ['unsubscribed'], b: ['subscribed'] });
    expect(cell.aTopicUnsubscribeEvents).toBe(1);
    expect(cell.contactStatus).toEqual({ ctrl: 'active', a: 'active', b: 'active' });
  }, 120_000);

  it('K — the next campaign to L reaches all three: leaving a topic stops no campaign', async () => {
    const next = await campaignTo(
      L,
      NAMES.map((k) => people[k].email),
    );
    cells.K_campaign = { send: next.send, reached: next.reached, errors: next.errors };
    expect(next.errors).toEqual([]);
    expect(next.reached).toEqual(['z187-a', 'z187-b', 'z187-ctrl']);
  }, 300_000);

  it('K — a transactional e-mail to `a`, who left the topic, goes out', async () => {
    const subject = `Vstupenka ${tag} ${nowS()}`;
    const tx = await call('POST', '/api/v1/emails', org.owner, {
      from: `noreply@${org.domain}`,
      to: people.a.email,
      subject,
      html: '<p>Vstupenka</p>',
    });
    engine.handed.length = 0;
    const d = await deliver(people.a.email);
    const receipt = {
      answer: tx.status,
      mta: d,
      engine: engine.handed.filter((m) => m.subject === subject).length,
    };
    cells.K_transactional = receipt;
    expect(receipt.answer).toBe(200);
    expect(receipt.engine).toBe(1);
  }, 120_000);
});
