/**
 * The preference-centre link brings a person back only while it is young —
 * walked to the engine (Z177, položka 7). The routes, rows, answers and the page
 * alone are pinned in apps/api/src/integration/preference-centre-link-age.
 *
 * ─── What was wrong (measured on master 6cce6f1, Z177 Sonda 1–4, 6) ──────────
 *
 * The pref token in `{{preference_center_url}}` (`type:'pref'`, `ts` = when the
 * batch sender minted it) never expired. With a link 31 days old an
 * unsubscribed recipient was brought back (globalResubscribe, the page's
 * "subscribe again" form), a list they had left was reopened
 * (resubscribeToLists), and the next campaign reached them. The JSON body put a
 * contact on a list they had never been on, and that list's campaign reached
 * them. The view-in-browser copy of an old e-mail minted a fresh pref token,
 * so the old e-mail got round any age limit.
 *
 * ─── How it is measured ──────────────────────────────────────────────────────
 *
 * Real HTTP to the running API (127.0.0.1): an organisation of this file
 * (INSERT), the owner session from POST /me/orgs/switch, a secret key from POST
 * /api/v1/api-keys; the verified sending domain is INSERTed (DNS cannot be
 * verified in CI). A first campaign to L carries the preference, view and
 * unsubscribe links; every link used "from the e-mail" is read out of the
 * message the engine was handed. Campaign → splitter → batch-sender →
 * mta-sender; the gRPC client of the engine is the only stub: "engine" below
 * means it was handed the message.
 *
 * The OLD links (31 days, 29 days) are MINTED here with the same TRACKING_SECRET
 * and in the shape of the e-mail's token — the test checks the keys and ids are
 * the same and only `ts` differs. Time cannot be moved in CI, and the e-mail's
 * own link is seconds old.
 *
 *   O   unsubscribed with the e-mail link, a 31-day link: globalResubscribe;
 *   OF  the same through the page's "subscribe again" form;
 *   OL  left L with the e-mail link, a 31-day link: resubscribeToLists [L];
 *   V   the view-in-browser copy of a 31-day e-mail: its pref link, then back;
 *   N   the e-mail link: resubscribeToLists [M], a list they were never on;
 *   F   unsubscribed and back with the e-mail link; B the same at 29 days;
 *   C   with a 31-day link: unsubscribe globally, from L, from the copy of an
 *       old e-mail; the control member; a transactional e-mail to an
 *       unsubscribed contact.
 *
 * Everything measured is printed as `Z177_FLOW_CELLS_JSON …` chunks.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { type Job, type JobType, type Queue } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { createTrackingToken } from '@forgemsg/shared';
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
  handed: [] as { to: string; subject: string; html: string; text: string }[],
}));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string; subject: string; htmlBody: string; textBody: string }) => {
    engine.handed.push({
      to: msg.toEmail.toLowerCase(),
      subject: msg.subject,
      html: msg.htmlBody,
      text: msg.textBody,
    });
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
const DAY = 86_400;
const OLD = 31 * DAY;
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
  personUserAgent: PERSON_UA,
  mock: 'the gRPC client of the engine only; real API over HTTP (127.0.0.1), queues, splitter, batch-sender, mta-sender',
  tokens:
    'links "from the e-mail" are read out of the message the engine got; old links are minted with the same secret and shape, only ts set back',
};
const cells: Record<string, unknown> = {};
const rateLimitWaits: string[] = [];

const addr = (name: string) => `z177-${name}-${tag}@test.local`.toLowerCase();

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
    const isForm = typeof body === 'string';
    const res = await fetch(`${API}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        ...(credential ? authHeaders(credential) : {}),
        ...(body === undefined
          ? {}
          : {
              'Content-Type': isForm ? 'application/x-www-form-urlencoded' : 'application/json',
            }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: isForm ? body : JSON.stringify(body) }),
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
    throw new Error(`[z177] ${method} ${path} → ${r.status}: ${r.text.slice(0, 300)}`);
  return (r.text ? JSON.parse(r.text) : { data: { id: '' } }) as Created;
}

async function makeOrg(): Promise<Org> {
  const domain = `z177-${tag}.test`;
  const [o] = await sql<{ id: string }[]>`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`z177 ${tag}`}, ${`z177-${tag}`}, 'production', 'Obchod z177 s.r.o.',
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
  const k = await api(owner, 'POST', '/api/v1/api-keys', { name: `z177 ${tag}` });
  const key = (k.data.key ?? k.data.rawKey ?? k.data.apiKey) as string;
  return { id: o!.id, owner, key, domain };
}

async function newList(name: string): Promise<string> {
  return (await api(org.key, 'POST', '/api/v1/lists', { name: `z177 ${name} ${tag}` })).data.id;
}

async function newContact(name: string): Promise<{ id: string; email: string }> {
  const email = addr(name);
  const b = await api(org.key, 'POST', '/api/v1/contacts', { email, firstName: 'Petra' });
  return { id: b.data.id, email };
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
    id: `z177-${randomUUID()}`,
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
    content:
      '<p>Dobrý den.</p><p><a href="{{preference_center_url}}">Nastavení odběru</a> · <a href="{{view_in_browser_url}}">Zobrazit v prohlížeči</a></p>',
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

function decode(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}

interface Mail {
  pref: string | null;
  view: string | null;
  unsub: string | null;
}

/** A campaign to `listId`, all the way to the engine; who it reached and their links. */
async function campaignTo(listId: string, recipients: string[]) {
  const subject = `Novinky ${randomUUID().slice(0, 8)}`;
  const created = await api(org.owner, 'POST', '/api/v1/campaigns', {
    name: `z177 ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail: `noreply@${org.domain}`,
    listId,
    content: { subject, blocks, globalStyles },
  });
  const campaignId = created.data.id;
  const beforeSplit = await idsOn(campaignSplitterQueue);
  const sentAt = nowS();
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
  const links: Record<string, Mail> = {};
  for (const m of mails) {
    const l = hrefs(m.html);
    links[m.to] = {
      pref: tokenIn(l, '/p/center/'),
      view: tokenIn(l, '/api/v1/browser/'),
      unsub: tokenIn(l, '/api/v1/unsubscribe/'),
    };
  }
  return {
    campaignId,
    sentAt,
    send:
      send.status === 200 || send.status === 202
        ? send.status
        : `${send.status} ${send.text.slice(0, 160)}`,
    reached,
    links,
    errors,
  };
}

async function state(contactId: string, listIds: Record<string, string>) {
  const [c] = await sql<{ status: string }[]>`
    SELECT status::text AS status FROM contacts WHERE id = ${contactId}
  `;
  const consent = await sql<{ type: string; source: string }[]>`
    SELECT event_type::text AS type, source FROM consent_events
    WHERE org_id = ${org.id} AND contact_id = ${contactId} ORDER BY occurred_at
  `;
  const memberships = await sql<{ list_id: string; unsub: boolean }[]>`
    SELECT list_id, unsubscribed_at IS NOT NULL AS unsub FROM contact_lists WHERE contact_id = ${contactId}
  `;
  const suppressions = (
    await sql<{ reason: string }[]>`
      SELECT s.reason::text AS reason FROM suppressions s JOIN contacts c
        ON c.org_id = s.org_id AND lower(c.email) = lower(s.email)
      WHERE c.id = ${contactId} ORDER BY s.reason
    `
  ).map((r) => r.reason);
  const lists: Record<string, string> = {};
  for (const m of memberships) {
    const name = Object.entries(listIds).find(([, id]) => id === m.list_id)?.[0] ?? 'other';
    lists[name] = m.unsub ? 'unsubscribed_at SET' : 'unsubscribed_at NULL';
  }
  return {
    status: c?.status ?? 'no contact',
    suppressions,
    lists,
    consent: consent.map((e) => `${e.type}/${e.source}`),
  };
}

async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await sql<Record<string, unknown>[]>`
    SELECT (SELECT count(*)::int FROM email_events WHERE org_id = o.id) AS email_events,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM contacts WHERE org_id = o.id) AS contacts,
           (SELECT count(*)::int FROM lists WHERE org_id = o.id) AS lists,
           (SELECT count(*)::int FROM contact_lists cl JOIN contacts c ON c.id = cl.contact_id WHERE c.org_id = o.id) AS memberships,
           (SELECT count(*)::int FROM consent_events WHERE org_id = o.id) AS consent_events,
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
  seedKey = await seedApiKey(sql, `z177-${tag}`);
  org = await makeOrg();
}, 180_000);

afterAll(async () => {
  const ids = org ? [org.id] : [];
  for (const j of (await mtaQueues.other.getJobs(ALL, 0, 10_000)) as Job<MtaSendJobData>[]) {
    if (j && ids.includes(j.data?.orgId)) await j.remove().catch(() => {});
  }
  for (const j of await batchSenderQueue.getJobs(ALL, 0, 10_000)) {
    if (j && ids.includes((j.data as BatchSenderJobData)?.orgId)) await j.remove().catch(() => {});
  }
  for (const j of await campaignSplitterQueue.getJobs(ALL, 0, 10_000)) {
    if (j && ids.includes((j.data as CampaignSplitterJobData)?.orgId))
      await j.remove().catch(() => {});
  }
  if (ids.length) {
    await sql`DELETE FROM email_events WHERE org_id = ANY(${ids})`;
    await sql`DELETE FROM campaigns WHERE org_id = ANY(${ids})`;
    await sql`DELETE FROM consent_events WHERE org_id = ANY(${ids})`;
    await sql`DELETE FROM audit_logs WHERE org_id = ANY(${ids})`;
    await sql`DELETE FROM api_keys WHERE org_id = ANY(${ids})`;
    // Everything else of the organisation goes with it (ON DELETE CASCADE).
    await sql`DELETE FROM organizations WHERE id = ANY(${ids})`;
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
  await sql`DELETE FROM api_keys WHERE name = ${`integration z177-${tag}`}`;
  const [left] = await sql<Record<string, number>[]>`
    SELECT (SELECT count(*)::int FROM organizations WHERE id = ANY(${ids})) AS orgs,
           (SELECT count(*)::int FROM contacts WHERE org_id = ANY(${ids})) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ANY(${ids})) AS suppressions,
           (SELECT count(*)::int FROM email_events WHERE org_id = ANY(${ids})) AS email_events,
           (SELECT count(*)::int FROM consent_events WHERE org_id = ANY(${ids})) AS consent_events,
           (SELECT count(*)::int FROM campaigns WHERE org_id = ANY(${ids})) AS campaigns,
           (SELECT count(*)::int FROM lists WHERE org_id = ANY(${ids})) AS lists,
           (SELECT count(*)::int FROM api_keys WHERE name = ${`integration z177-${tag}`}) AS seed_key
  `;
  const seedAfter = await seedState();
  report.cells = cells;
  report.rateLimitWaits = rateLimitWaits;
  report.leftover = { ...left, limitKeysRemoved };
  report.seedOrg = { before: seedBefore, after: seedAfter };
  const all = JSON.stringify(report);
  const parts = Math.ceil(all.length / 3000);
  for (let i = 0; i < parts; i++)
    console.log(
      `Z177_FLOW_CELLS_JSON ${String(i).padStart(4, '0')}/${parts} ${all.slice(i * 3000, (i + 1) * 3000)}`,
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
    seed_key: 0,
  });
  expect(seedAfter, 'the seed organisation changed').toEqual(seedBefore);
}, 300_000);

describe('the preference-centre link brings a person back only while it is young — to the engine (Z177)', () => {
  const NAMES = ['ctrl', 'a', 'af', 'b', 'v', 'n', 'f', 'bb', 'c1', 'c2', 'cv'] as const;
  type Name = (typeof NAMES)[number];
  const people = {} as Record<Name, { id: string; email: string }>;
  const mail = {} as Record<Name, Mail>;
  let lists: Record<string, string> = {};
  let first: Awaited<ReturnType<typeof campaignTo>>;
  let last: Awaited<ReturnType<typeof campaignTo>>;
  let onM: Awaited<ReturnType<typeof campaignTo>>;
  let acts: Record<string, unknown> = {};
  const all = () => NAMES.map((k) => people[k].email);

  /** A pref token in the e-mail's shape, `ageS` seconds old. */
  const prefToken = (k: Name, ageS: number) =>
    createTrackingToken({
      type: 'pref',
      orgId: org.id,
      contactId: people[k].id,
      ts: nowS() - ageS,
    });

  async function center(token: string, body: Record<string, unknown>) {
    const r = await call('POST', `/p/center/${token}`, null, body, { 'User-Agent': PERSON_UA });
    return {
      status: r.status,
      data: r.status === 200 ? JSON.parse(r.text).data : r.text.slice(0, 200),
    };
  }

  it('1 — the first campaign to L carries the preference, view and unsubscribe links (the shape and ts of the pref token)', async () => {
    lists = { L: await newList('L'), M: await newList('M') };
    for (const k of NAMES) {
      people[k] = await newContact(k);
      await api(org.key, 'POST', `/api/v1/lists/${lists.L}/contacts`, { contactId: people[k].id });
    }
    first = await campaignTo(lists.L!, all());
    for (const k of NAMES) mail[k] = first.links[people[k].email]!;
    const p = decode(mail.a.pref ?? '.');
    const v = decode(mail.a.view ?? '.');
    cells.S1 = {
      send: first.send,
      reached: first.reached,
      errors: first.errors,
      sentAt: first.sentAt,
      pref: {
        keys: Object.keys(p).sort(),
        type: p.type,
        ts: p.ts,
        tsMinusSentAt: Number(p.ts) - first.sentAt,
      },
      view: {
        keys: Object.keys(v).sort(),
        type: v.type,
        tsMinusSentAt: Number(v.ts) - first.sentAt,
      },
      everyMailHasAllThree: NAMES.every(
        (k) => !!mail[k]?.pref && !!mail[k]?.view && !!mail[k]?.unsub,
      ),
    };
    expect(first.errors).toEqual([]);
    expect(first.reached).toEqual([...NAMES].map((k) => `z177-${k}`).sort());
    expect(Object.keys(p).sort()).toEqual(['contactId', 'orgId', 'ts', 'type']);
    expect(p).toMatchObject({ type: 'pref', orgId: org.id, contactId: people.a.id });
    expect(typeof p.ts).toBe('number');
    expect(Math.abs(Number(p.ts) - first.sentAt)).toBeLessThan(120);
    expect(v).toMatchObject({
      type: 'view',
      orgId: org.id,
      campaignId: first.campaignId,
      contactId: people.a.id,
    });
    expect(cells.S1).toMatchObject({ everyMailHasAllThree: true });
    // The minted old token has the e-mail token's shape; only ts differs.
    const minted = decode(prefToken('a', OLD));
    expect(Object.keys(minted).sort()).toEqual(Object.keys(p).sort());
    expect({ ...minted, ts: 0 }).toEqual({ ...p, ts: 0 });
  }, 300_000);

  it('2 — the recipients act: O, OF, OL, V, N, F, B and C', async () => {
    const L = lists.L!;
    const M = lists.M!;
    const out: Record<string, unknown> = {};

    // O — unsubscribed with the e-mail link, back with a 31-day one.
    const oUnsub = await center(mail.a.pref!, { globalUnsubscribe: true });
    const oBefore = await state(people.a.id, lists);
    const oBack = await center(prefToken('a', OLD), { globalResubscribe: true });
    out.O = {
      unsubscribe: oUnsub,
      before: oBefore,
      back: oBack,
      after: await state(people.a.id, lists),
    };

    // OF — the same through the page's form.
    const ofUnsub = await center(mail.af.pref!, { globalUnsubscribe: true });
    const ofBefore = await state(people.af.id, lists);
    const ofTok = prefToken('af', OLD);
    const ofBack = await call(
      'POST',
      `/p/center/${ofTok}`,
      null,
      new URLSearchParams([
        ['action', 'resubscribe'],
        ['list', L],
      ]).toString(),
      {
        Accept: 'text/html',
        'User-Agent': PERSON_UA,
      },
    );
    out.OF = {
      unsubscribe: ofUnsub,
      before: ofBefore,
      back: { status: ofBack.status, location: ofBack.location?.replace(ofTok, '<token>') ?? null },
      after: await state(people.af.id, lists),
    };

    // OL — left L with the e-mail link, a 31-day link asks to reopen it.
    const olLeave = await center(mail.b.pref!, { unsubscribeFromLists: [L] });
    const olBefore = await state(people.b.id, lists);
    const olBack = await center(prefToken('b', OLD), { resubscribeToLists: [L] });
    out.OL = {
      leave: olLeave,
      before: olBefore,
      back: olBack,
      after: await state(people.b.id, lists),
    };

    // V — the copy of a 31-day e-mail: its pref link, then back with it.
    const vUnsub = await center(mail.v.pref!, { globalUnsubscribe: true });
    const viewMail = decode(mail.v.view!);
    const viewTs = nowS() - OLD;
    const oldView = createTrackingToken({
      type: 'view',
      orgId: org.id,
      campaignId: first.campaignId,
      contactId: people.v.id,
      ts: viewTs,
    });
    const minted = decode(oldView);
    const copy = await call('GET', `/api/v1/browser/${oldView}`, null, undefined, {
      Accept: 'text/html',
    });
    const copyLinks = hrefs(copy.text);
    const copyPref = tokenIn(copyLinks, '/p/center/');
    const copyPrefPayload = copyPref ? decode(copyPref) : {};
    const vBack = copyPref
      ? await center(copyPref, { globalResubscribe: true, resubscribeToLists: [L] })
      : null;
    out.V = {
      unsubscribe: vUnsub,
      viewTokenShapeAsInEmail:
        JSON.stringify(Object.keys(minted).sort()) ===
          JSON.stringify(Object.keys(viewMail).sort()) &&
        JSON.stringify({ ...minted, ts: 0 }) === JSON.stringify({ ...viewMail, ts: 0 }),
      copy: copy.status,
      viewTs,
      copyPref: {
        found: !!copyPref,
        ts: copyPrefPayload.ts ?? null,
        equalsViewTs: copyPrefPayload.ts === viewTs,
        ageS: typeof copyPrefPayload.ts === 'number' ? nowS() - copyPrefPayload.ts : null,
      },
      back: vBack,
      after: await state(people.v.id, lists),
    };

    // N — the e-mail link names M, a live list they were never on.
    const nBefore = await state(people.n.id, lists);
    const nJoin = await center(mail.n.pref!, { resubscribeToLists: [M] });
    out.N = { before: nBefore, join: nJoin, after: await state(people.n.id, lists) };

    // F — out and back with the e-mail link; B — back with a 29-day link.
    const fUnsub = await center(mail.f.pref!, { globalUnsubscribe: true });
    const fBack = await center(mail.f.pref!, { globalResubscribe: true, resubscribeToLists: [L] });
    out.F = { unsubscribe: fUnsub, back: fBack, after: await state(people.f.id, lists) };
    const bUnsub = await center(mail.bb.pref!, { globalUnsubscribe: true });
    const bBack = await center(prefToken('bb', 29 * DAY), {
      globalResubscribe: true,
      resubscribeToLists: [L],
    });
    out.B = { unsubscribe: bUnsub, back: bBack, after: await state(people.bb.id, lists) };

    // C — leaving with a 31-day link, and from the copy of an old e-mail.
    const c1 = await center(prefToken('c1', OLD), { globalUnsubscribe: true });
    const c2 = await center(prefToken('c2', OLD), { unsubscribeFromLists: [L] });
    const cvView = createTrackingToken({
      type: 'view',
      orgId: org.id,
      campaignId: first.campaignId,
      contactId: people.cv.id,
      ts: viewTs,
    });
    const cvCopy = await call('GET', `/api/v1/browser/${cvView}`, null, undefined, {
      Accept: 'text/html',
    });
    const cvUnsubToken = tokenIn(hrefs(cvCopy.text), '/api/v1/unsubscribe/');
    const cvUnsub = cvUnsubToken
      ? await call('GET', `/api/v1/unsubscribe/${cvUnsubToken}`, null, undefined, {
          Accept: 'text/html',
          'User-Agent': PERSON_UA,
        })
      : null;
    out.C = {
      global: { answer: c1, after: await state(people.c1.id, lists) },
      list: { answer: c2, after: await state(people.c2.id, lists) },
      fromCopy: {
        copy: cvCopy.status,
        unsubTs: cvUnsubToken ? decode(cvUnsubToken).ts : null,
        viewTs,
        answer: cvUnsub?.status ?? null,
        after: await state(people.cv.id, lists),
      },
    };
    acts = out;
    cells.acts = out;
    // Every act answered; what each one did is asserted cell by cell below.
    for (const k of ['O', 'OL', 'N', 'F', 'B'])
      expect(JSON.stringify(out[k]), k).not.toContain('"status":4');
  }, 600_000);

  const leftAll = {
    status: 'unsubscribed',
    suppressions: ['unsubscribe'],
    lists: { L: 'unsubscribed_at SET' },
    consent: [],
  };
  const leftL = {
    status: 'active',
    suppressions: [],
    lists: { L: 'unsubscribed_at SET' },
    consent: [],
  };
  const back = {
    status: 'active',
    suppressions: [],
    lists: { L: 'unsubscribed_at NULL' },
    consent: ['re_consent/preference_center'],
  };
  const cell = (k: string) => acts[k] as Record<string, unknown>;

  it('O — a 31-day link lifts no unsubscribe', () => {
    expect(cell('O')).toMatchObject({ unsubscribe: { status: 200 }, before: leftAll });
    expect(cell('O').back).toEqual({
      status: 200,
      data: { globallyUnsubscribed: true, listChanges: [], resubscribeRefused: 'link_expired' },
    });
    expect(cell('O').after, 'the 31-day link lifted the unsubscribe').toEqual(leftAll);
  });

  it('OF — the page’s “subscribe again” form with a 31-day link changes nothing', () => {
    expect(cell('OF')).toMatchObject({ unsubscribe: { status: 200 }, before: leftAll });
    expect(cell('OF').back).toEqual({ status: 303, location: '/p/center/<token>?saved=1' });
    expect(cell('OF').after, 'the form brought them back').toEqual(leftAll);
  });

  it('OL — a 31-day link does not reopen the list they left', () => {
    expect(cell('OL')).toMatchObject({ leave: { status: 200 }, before: leftL });
    expect(cell('OL').back).toEqual({
      status: 200,
      data: { globallyUnsubscribed: false, listChanges: [], resubscribeRefused: 'link_expired' },
    });
    expect(cell('OL').after, 'the old link reopened L').toEqual(leftL);
  });

  it('V — the copy of a 31-day e-mail carries a 31-day preference link, which brings nobody back', () => {
    expect(cell('V')).toMatchObject({
      unsubscribe: { status: 200 },
      viewTokenShapeAsInEmail: true,
      copy: 200,
    });
    const p = cell('V').copyPref as { found: boolean; ts: unknown };
    expect(p.found, 'the copy carries no preference link').toBe(true);
    expect(p.ts, 'the copy minted a fresh preference link').toBe(cell('V').viewTs);
    expect(cell('V').after, 'back through the copy of an old e-mail').toEqual(leftAll);
  });

  it('N — the e-mail link does not put the contact on a list they were never on', () => {
    const before = {
      status: 'active',
      suppressions: [],
      lists: { L: 'unsubscribed_at NULL' },
      consent: [],
    };
    expect(cell('N').before).toEqual(before);
    expect(cell('N').join).toEqual({
      status: 200,
      data: { globallyUnsubscribed: false, listChanges: [] },
    });
    expect(cell('N').after, 'a membership of M appeared').toEqual(before);
  });

  it('F / B — the e-mail link, and one 29 days old, bring the person back as before', () => {
    for (const k of ['F', 'B']) {
      expect(cell(k).unsubscribe, k).toMatchObject({ status: 200 });
      expect(cell(k).back, k).toEqual({
        status: 200,
        data: { globallyUnsubscribed: false, listChanges: [{ listId: lists.L, subscribed: true }] },
      });
      expect(cell(k).after, k).toEqual(back);
    }
  });

  it('C — with a 31-day link, and from the copy of an old e-mail, the person still leaves', () => {
    expect(cell('C')).toMatchObject({
      global: {
        answer: { status: 200, data: { globallyUnsubscribed: true, listChanges: [] } },
        after: leftAll,
      },
      list: {
        answer: { status: 200, data: { listChanges: [{ listId: lists.L, subscribed: false }] } },
        after: leftL,
      },
      fromCopy: { copy: 200, answer: 200, after: leftAll },
    });
  });

  it('3 — the next campaign to L and one to M, to the engine', async () => {
    last = await campaignTo(lists.L!, all());
    onM = await campaignTo(lists.M!, all());
    cells.campaignL = { send: last.send, reached: last.reached, errors: last.errors };
    cells.campaignM = { send: onM.send, reached: onM.reached, errors: onM.errors };
    expect(last.errors).toEqual([]);
    expect(onM.errors).toEqual([]);
  }, 600_000);

  it('O / OF / OL / V / N / F / B — the campaign to L reaches the control, N and those who came back with a young link; the one to M nobody', () => {
    expect(last.reached).toEqual(['z177-bb', 'z177-ctrl', 'z177-f', 'z177-n']);
    expect(onM.reached, 'N: the campaign to M reached a contact who never joined it').toEqual([]);
  });

  it('C — the campaign to L: the control and F / B are reached, those who left with an old link are not', () => {
    expect(last.reached).toEqual(expect.arrayContaining(['z177-ctrl', 'z177-f', 'z177-bb']));
    for (const k of ['z177-c1', 'z177-c2', 'z177-cv']) expect(last.reached).not.toContain(k);
  });

  it('C — a transactional e-mail to a contact who unsubscribed with an old link still goes out', async () => {
    const subject = `Faktura ${tag}`;
    const tx = await call('POST', '/api/v1/emails', org.owner, {
      from: `noreply@${org.domain}`,
      to: people.c1.email,
      subject,
      html: '<p>Faktura</p>',
    });
    engine.handed.length = 0;
    const d = await deliver(people.c1.email);
    const receipt = {
      answer: tx.status,
      mta: d,
      engine: engine.handed.filter((m) => m.subject === subject).length,
    };
    cells.transactional = receipt;
    expect(receipt.answer).toBe(200);
    expect(receipt.engine).toBe(1);
  }, 120_000);
});
