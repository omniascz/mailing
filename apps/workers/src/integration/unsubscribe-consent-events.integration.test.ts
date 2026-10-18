/**
 * A recipient's own unsubscribe and way back are on the consent timeline —
 * walked from the e-mail to the engine (Z186, Zásobník e-mail 6). The routes,
 * rows and answers of every path are pinned in apps/api/src/integration/
 * unsubscribe-consent-events.
 *
 * ─── What was wrong (measured in Z157 and Z177) ──────────────────────────────
 *
 * The footer link and the preference link of a campaign e-mail unsubscribed
 * the recipient — status, suppression, list rows, the email_events row — and
 * left no consent_events row; a way back to a list they had left reopened the
 * row with none either.
 *
 * ─── How it is measured ──────────────────────────────────────────────────────
 *
 * Real HTTP to the running API (127.0.0.1): an organisation of this file
 * (INSERT), the owner session from POST /me/orgs/switch, a secret key from POST
 * /api/v1/api-keys; the verified sending domain is INSERTed (DNS cannot be
 * verified in CI). A campaign to L, campaign → splitter → batch-sender →
 * mta-sender; the gRPC client of the engine is the only stub: "engine" below
 * means it was handed the message. Every link used is read out of the message
 * the engine was handed.
 *
 *   U   `a` opens the footer link of the e-mail (twice): one opt_out naming the
 *       campaign, the repeat none;
 *   R   `b` leaves L and comes back to it with the e-mail's preference link
 *       (twice): one opt_out (list), one re_consent, the repeats none;
 *   K   the next campaign to L reaches the control and `b`, not `a`; a
 *       transactional e-mail to `a` still goes out.
 *
 * Everything measured is printed as `Z186_FLOW_CELLS_JSON …` chunks.
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

const addr = (name: string) => `z186-${name}-${tag}@test.local`.toLowerCase();

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
    throw new Error(`[z186] ${method} ${path} → ${r.status}: ${r.text.slice(0, 300)}`);
  return (r.text ? JSON.parse(r.text) : { data: { id: '' } }) as Created;
}

async function makeOrg(): Promise<Org> {
  const domain = `z186-${tag}.test`;
  const [o] = await sql<{ id: string }[]>`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`z186 ${tag}`}, ${`z186-${tag}`}, 'production', 'Obchod z186 s.r.o.',
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
  const k = await api(owner, 'POST', '/api/v1/api-keys', { name: `z186 ${tag}` });
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
    id: `z186-${randomUUID()}`,
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
    name: `z186 ${tag}`,
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

interface ConsentRow {
  id: string;
  event_type: string;
  channel: string | null;
  purpose_code: string | null;
  source: string;
  ip_hash: boolean;
  user_agent: string | null;
  proof_payload: Record<string, unknown> | null;
}

async function state(contactId: string, L: string) {
  const [c] = await sql<{ status: string }[]>`
    SELECT status::text AS status FROM contacts WHERE id = ${contactId}
  `;
  const consent = await sql<ConsentRow[]>`
    SELECT id, event_type::text AS event_type, channel, purpose_code, source,
           ip_hash IS NOT NULL AS ip_hash, user_agent, proof_payload
    FROM consent_events WHERE org_id = ${org.id} AND contact_id = ${contactId}
    ORDER BY occurred_at, id
  `;
  const events = await sql<{ id: string; campaign_id: string | null }[]>`
    SELECT id, campaign_id FROM email_events
    WHERE org_id = ${org.id} AND contact_id = ${contactId} AND event_type = 'unsubscribe'
    ORDER BY created_at, id
  `;
  const [m] = await sql<{ unsub: boolean }[]>`
    SELECT unsubscribed_at IS NOT NULL AS unsub FROM contact_lists
    WHERE contact_id = ${contactId} AND list_id = ${L}
  `;
  return {
    status: c?.status ?? 'no contact',
    L: m ? (m.unsub ? 'SET' : 'NULL') : 'no row',
    consent: [...consent],
    unsubscribeEvents: [...events],
  };
}
type State = Awaited<ReturnType<typeof state>>;

function newRows(before: State, after: State) {
  const seen = new Set(before.consent.map((c) => c.id));
  const seenEv = new Set(before.unsubscribeEvents.map((e) => e.id));
  return {
    consent: after.consent.filter((c) => !seen.has(c.id)),
    unsubscribeEvents: after.unsubscribeEvents.filter((e) => !seenEv.has(e.id)),
    status: after.status,
    L: after.L,
  };
}

const view = (d: ReturnType<typeof newRows>, campaignId: string, L: string) => ({
  status: d.status,
  L: d.L,
  unsubscribeEvents: d.unsubscribeEvents.map((e) =>
    e.campaign_id === campaignId ? '<campaign>' : e.campaign_id,
  ),
  consent: d.consent.map(({ id: _id, proof_payload, ...rest }) => ({
    ...rest,
    proof_payload: proof_payload
      ? (JSON.parse(
          JSON.stringify(proof_payload)
            .split(campaignId)
            .join('<campaign>')
            .split(L)
            .join('<L>')
            .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>'),
        ) as unknown)
      : null,
  })),
});

async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await sql<Record<string, unknown>[]>`
    SELECT (SELECT count(*)::int FROM email_events WHERE org_id = o.id) AS email_events,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id) AS suppressions,
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
  seedKey = await seedApiKey(sql, `z186-${tag}`);
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
  if (id) {
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
  const seedKeyName = `integration z186-${tag}`;
  await sql`DELETE FROM api_keys WHERE name = ${seedKeyName}`;
  const [left] = await sql<Record<string, number>[]>`
    SELECT (SELECT count(*)::int FROM organizations WHERE id::text = ${id}) AS orgs,
           (SELECT count(*)::int FROM contacts WHERE org_id::text = ${id}) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id::text = ${id}) AS suppressions,
           (SELECT count(*)::int FROM email_events WHERE org_id::text = ${id}) AS email_events,
           (SELECT count(*)::int FROM consent_events WHERE org_id::text = ${id}) AS consent_events,
           (SELECT count(*)::int FROM campaigns WHERE org_id::text = ${id}) AS campaigns,
           (SELECT count(*)::int FROM lists WHERE org_id::text = ${id}) AS lists,
           (SELECT count(*)::int FROM api_keys WHERE name = ${seedKeyName}) AS seed_key
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
      `Z186_FLOW_CELLS_JSON ${String(i).padStart(4, '0')}/${parts} ${all.slice(i * 3000, (i + 1) * 3000)}`,
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

describe("a recipient's own unsubscribe and way back are on the consent timeline — from the e-mail (Z186)", () => {
  const NAMES = ['ctrl', 'a', 'b'] as const;
  type Name = (typeof NAMES)[number];
  const people = {} as Record<Name, { id: string; email: string }>;
  let L = '';
  let first: Awaited<ReturnType<typeof campaignTo>>;

  it('1 — the first campaign to L reaches all three, with the footer and preference links', async () => {
    L = (await api(org.key, 'POST', '/api/v1/lists', { name: `z186 L ${tag}` })).data.id;
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
    cells.S1 = {
      send: first.send,
      reached: first.reached,
      errors: first.errors,
      links: NAMES.map((k) => ({
        k,
        pref: !!first.links[people[k].email]?.pref,
        unsub: !!first.links[people[k].email]?.unsub,
      })),
    };
    expect(first.errors).toEqual([]);
    expect(first.reached).toEqual(['z186-a', 'z186-b', 'z186-ctrl']);
    for (const k of NAMES) expect(first.links[people[k].email]?.unsub, k).toBeTruthy();
    for (const k of NAMES) expect(first.links[people[k].email]?.pref, k).toBeTruthy();
  }, 300_000);

  it('U — `a` opens the footer link twice: one opt_out naming the campaign, the repeat none', async () => {
    const token = first.links[people.a.email]!.unsub!;
    const open = () =>
      call('GET', `/api/v1/unsubscribe/${token}`, null, undefined, {
        Accept: 'text/html',
        'User-Agent': PERSON_UA,
      });
    const s0 = await state(people.a.id, L);
    const r1 = await open();
    const s1 = await state(people.a.id, L);
    const r2 = await open();
    const s2 = await state(people.a.id, L);
    const d1 = newRows(s0, s1);
    const d2 = newRows(s1, s2);
    cells.U = {
      answers: [r1.status, r2.status],
      first: view(d1, first.campaignId, L),
      second: view(d2, first.campaignId, L),
    };
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(d1).toMatchObject({ status: 'unsubscribed', L: 'SET' });
    expect(d1.unsubscribeEvents.map((e) => e.campaign_id)).toEqual([first.campaignId]);
    expect(view(d1, first.campaignId, L).consent).toEqual([
      {
        event_type: 'opt_out',
        channel: 'email',
        purpose_code: 'marketing_email',
        source: 'footer_link',
        ip_hash: true,
        user_agent: PERSON_UA,
        proof_payload: {
          scope: 'global',
          campaignId: '<campaign>',
          emailEventId: '<uuid>',
          fromStatus: 'active',
          method: 'GET',
        },
      },
    ]);
    expect(d1.consent[0]!.proof_payload?.emailEventId).toBe(d1.unsubscribeEvents[0]!.id);
    expect(d2.consent).toEqual([]);
    expect(d2.unsubscribeEvents).toEqual([]);
  }, 120_000);

  it('R — `b` leaves L and comes back with the preference link: one opt_out, one re_consent, the repeats none', async () => {
    const token = first.links[people.b.email]!.pref!;
    const centre = async (body: Record<string, unknown>) =>
      (await call('POST', `/p/center/${token}`, null, body, { 'User-Agent': PERSON_UA })).status;
    const s0 = await state(people.b.id, L);
    const leave = [await centre({ unsubscribeFromLists: [L] })];
    const s1 = await state(people.b.id, L);
    leave.push(await centre({ unsubscribeFromLists: [L] }));
    const s2 = await state(people.b.id, L);
    const back = [await centre({ resubscribeToLists: [L] })];
    const s3 = await state(people.b.id, L);
    back.push(await centre({ resubscribeToLists: [L] }));
    const s4 = await state(people.b.id, L);
    const dl1 = newRows(s0, s1);
    const dl2 = newRows(s1, s2);
    const db1 = newRows(s2, s3);
    const db2 = newRows(s3, s4);
    cells.R = {
      answers: { leave, back },
      leave: [view(dl1, first.campaignId, L), view(dl2, first.campaignId, L)],
      back: [view(db1, first.campaignId, L), view(db2, first.campaignId, L)],
    };
    expect(leave).toEqual([200, 200]);
    expect(back).toEqual([200, 200]);
    expect(dl1).toMatchObject({ status: 'active', L: 'SET' });
    expect(db1).toMatchObject({ status: 'active', L: 'NULL' });
    expect(view(dl1, first.campaignId, L).consent.map((c) => c.proof_payload)).toEqual([
      {
        scope: 'list',
        listId: '<L>',
        emailEventId: '<uuid>',
        fromStatus: 'active',
        method: 'POST',
      },
    ]);
    expect(dl2.consent).toEqual([]);
    expect(view(db1, first.campaignId, L).consent).toEqual([
      {
        event_type: 're_consent',
        channel: 'email',
        purpose_code: 'marketing_email',
        source: 'preference_center',
        ip_hash: true,
        user_agent: PERSON_UA,
        proof_payload: { listId: '<L>', via: 'api' },
      },
    ]);
    expect(db2.consent).toEqual([]);
  }, 120_000);

  it('K — the next campaign to L reaches the control and `b`, not `a`', async () => {
    const next = await campaignTo(
      L,
      NAMES.map((k) => people[k].email),
    );
    cells.K_campaign = { send: next.send, reached: next.reached, errors: next.errors };
    expect(next.errors).toEqual([]);
    expect(next.reached).toEqual(['z186-b', 'z186-ctrl']);
  }, 300_000);

  it('K — a transactional e-mail to `a`, who unsubscribed, still goes out', async () => {
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
