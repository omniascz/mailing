/**
 * A double opt-in is confirmed by the person pressing a button, not by the link
 * being opened — walked to the engine (Z176, položka 7). The routes, rows and
 * answers alone are pinned in apps/api/src/integration/doi-confirm-click.
 *
 * ─── What was wrong (measured on master 022655a, Z176 Sonda 1–3) ─────────────
 *
 * GET /api/v1/confirm/:token confirmed on the spot. Mail security scanners
 * (Outlook Safe Links, company gateways, prefetch) open every link in a message
 * before the person does: a GET with a scanner's User-Agent and no cookie, a
 * HEAD (Fastify answers it from the GET handler), or the first of two GETs left
 * the contact active with a double_opt_in consent event carrying the scanner's
 * User-Agent, lifted an earlier unsubscribe, and the next campaign to the list
 * reached every one of them. The per-purpose GDPR confirmation (GET /public/
 * gdpr/doi/confirm) granted the consent the same way, and a campaign under
 * that purpose then reached the contact.
 *
 * ─── How it is measured ──────────────────────────────────────────────────────
 *
 * Real HTTP to the running API (127.0.0.1): an organisation of this file
 * (INSERT), the owner session from POST /me/orgs/switch, a secret key from POST
 * /api/v1/api-keys; the verified sending domain is INSERTed (DNS cannot be
 * verified in CI). The sign-ups through POST /lists/:id/subscribe and a signup
 * form with double opt-in; the confirmation link is read out of the e-mail the
 * engine was handed — never out of the API's answer. The recipient's own
 * unsubscribe through the preference centre. Campaign → splitter →
 * batch-sender → mta-sender. The gRPC client of the engine is the only stub:
 * "engine" below means it was handed the message. One exception, said where it
 * happens: POST /campaigns does not take processingPurposeId (Z170 MIMO 5), so
 * the purpose of the PP campaigns is set by UPDATE.
 *
 *   G / H / G2  a scanner opens the link: GET, HEAD, GET twice;
 *   U   an unsubscribed contact signs up again, a scanner opens the link;
 *   K / KT / KF a person opens the link and presses the button (the route, a
 *       list with a thank-you URL, a signup form); on master the GET is the
 *       confirmation and there is no button — the same steps, the same end;
 *   E   an unknown token;
 *   C   as before: the confirmation to an erased address, the limit of three,
 *       a receipt to a pending contact, and the campaign to the control;
 *   PP  the per-purpose GDPR confirmation and a campaign under the purpose.
 *
 * Everything measured is printed as `Z176_FLOW_CELLS_JSON …` chunks.
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
const DOI_SUBJECT = /^Confirm your subscription to /;
/** What a mail security scanner sends when it opens a link ahead of the person. */
const SCANNER_UA = 'Mozilla/5.0 (compatible; MSOffice 16; Microsoft Outlook 16.0; ms-office)';
const PERSON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';
const THANK_YOU = `https://example.test/dekujeme-z176-${tag}`;

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
const listIds: string[] = [];
const report: Record<string, unknown> = {
  tag,
  scannerUserAgent: SCANNER_UA,
  personUserAgent: PERSON_UA,
  mock: 'the gRPC client of the engine only; real API over HTTP (127.0.0.1), queues, splitter, batch-sender, mta-sender',
};
const cells: Record<string, unknown> = {};
const rateLimitWaits: string[] = [];

const addr = (name: string) => `z176-${name}-${tag}@test.local`.toLowerCase();

interface Res {
  status: number;
  text: string;
  location: string | null;
  contentType: string | null;
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
      rateLimitWaits.push(`${method} ${path.split('/').slice(0, 4).join('/')} ${wait}s`);
      await new Promise((r) => setTimeout(r, (Math.max(1, wait) + 1) * 1000));
      continue;
    }
    return {
      status: res.status,
      text,
      location: res.headers.get('location'),
      contentType: res.headers.get('content-type'),
    };
  }
}

interface Created {
  data: { id: string; key?: string; rawKey?: string; apiKey?: string; token?: string };
}

async function api(cred: string, method: string, path: string, body?: unknown): Promise<Created> {
  const r = await call(method, path, cred, body);
  if (r.status >= 300)
    throw new Error(`[z176] ${method} ${path} → ${r.status}: ${r.text.slice(0, 300)}`);
  return (r.text ? JSON.parse(r.text) : { data: { id: '' } }) as Created;
}

async function makeOrg(): Promise<Org> {
  const domain = `z176-${tag}.test`;
  const [o] = await sql<{ id: string }[]>`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`z176 ${tag}`}, ${`z176-${tag}`}, 'production', 'Obchod z176 s.r.o.',
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
  const k = await api(owner, 'POST', '/api/v1/api-keys', { name: `z176 ${tag}` });
  const key = (k.data.key ?? k.data.rawKey ?? k.data.apiKey) as string;
  return { id: o!.id, owner, key, domain };
}

async function newList(name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const id = (
    await api(org.key, 'POST', '/api/v1/lists', {
      name: `z176 ${name} ${tag}`,
      doubleOptIn: true,
      ...extra,
    })
  ).data.id;
  listIds.push(id);
  return id;
}

async function newContact(name: string): Promise<{ id: string; email: string }> {
  const email = addr(name);
  const b = await api(org.key, 'POST', '/api/v1/contacts', { email, firstName: 'Petra' });
  return { id: b.data.id, email };
}

const onList = (listId: string, contactId: string) =>
  api(org.key, 'POST', `/api/v1/lists/${listId}/contacts`, { contactId });

function prefToken(contactId: string): string {
  return createTrackingToken({
    type: 'pref',
    orgId: org.id,
    contactId,
    ts: Math.floor(Date.now() / 1000),
  });
}

async function contactIdOf(email: string): Promise<string | null> {
  const [r] = await sql<{ id: string }[]>`
    SELECT id FROM contacts WHERE org_id = ${org.id} AND lower(email) = lower(${email})
  `;
  return r?.id ?? null;
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

interface Mail {
  mta: string[];
  engine: number;
  href: string | null;
  path: string | null;
  token: string | null;
  textHasLink: boolean;
}

/** The confirmation the engine was handed for `to`: the link as the person sees it. */
async function confirmationMail(to: string, subject: RegExp = DOI_SUBJECT): Promise<Mail> {
  engine.handed.length = 0;
  const mta = await deliver(to);
  const mails = engine.handed.filter((m) => m.to === to.toLowerCase() && subject.test(m.subject));
  const html = mails[0]?.html ?? '';
  const href = /<a href="([^"]+)"/.exec(html)?.[1] ?? null;
  const path = href ? href.slice(href.indexOf('/', href.indexOf('//') + 2)) : null;
  const token = /\/confirm\/([0-9a-f-]{36})/.exec(href ?? '')?.[1] ?? null;
  return {
    mta,
    engine: mails.length,
    href,
    path,
    token,
    textHasLink: !!href && (mails[0]?.text ?? '').includes(href),
  };
}

async function state(contactId: string | null, listId: string, token: string | null) {
  const status = contactId
    ? ((
        await sql<
          { status: string }[]
        >`SELECT status::text AS status FROM contacts WHERE id = ${contactId}`
      )[0]?.status ?? 'no contact')
    : 'no contact';
  const consent = contactId
    ? await sql<{ type: string; source: string; ua: string | null; ip: boolean }[]>`
        SELECT event_type::text AS type, source, user_agent AS ua, ip_hash IS NOT NULL AS ip
        FROM consent_events WHERE org_id = ${org.id} AND contact_id = ${contactId}
        ORDER BY occurred_at
      `
    : [];
  const [row] = contactId
    ? await sql<{ confirmed: boolean; unsub: boolean }[]>`
        SELECT confirmed_at IS NOT NULL AS confirmed, unsubscribed_at IS NOT NULL AS unsub
        FROM contact_lists WHERE contact_id = ${contactId} AND list_id = ${listId}
      `
    : [];
  const suppressions = contactId
    ? (
        await sql<{ reason: string }[]>`
          SELECT s.reason::text AS reason FROM suppressions s JOIN contacts c
            ON c.org_id = s.org_id AND lower(c.email) = lower(s.email)
          WHERE c.id = ${contactId} ORDER BY s.reason
        `
      ).map((r) => r.reason)
    : [];
  return {
    status,
    consent: consent.map((c) => `${c.type}/${c.source}/ip:${c.ip}/ua:${c.ua ?? '-'}`),
    row: row ? `confirmed:${row.confirmed} unsub:${row.unsub}` : 'no row',
    token: token ? (await redis.exists(`doi:${token}`)) === 1 : null,
    suppressions,
  };
}

const page = (r: Res) => ({
  status: r.status,
  contentType: r.contentType,
  location: r.location,
  form: /<form[^>]*method="post"[^>]*>/i.exec(r.text)?.[0] ?? null,
  autoSubmit: /\.submit\(\)/.test(r.text),
  bodyLength: r.text.length,
});

const job = <T>(data: T): Job<T> =>
  ({
    id: `z176-${randomUUID()}`,
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
const globalStyles = {
  backgroundColor: '#fff',
  contentBackgroundColor: '#fff',
  fontFamily: 'Arial',
  linkColor: '#00f',
  textColor: '#000',
  contentWidth: 600,
};

/** A campaign to `listId`, all the way to the engine; returns who it reached. */
async function campaignTo(listId: string, recipients: string[], purposeId?: string) {
  const subject = `Novinky ${randomUUID().slice(0, 8)}`;
  const created = await api(org.owner, 'POST', '/api/v1/campaigns', {
    name: `z176 ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail: `noreply@${org.domain}`,
    listId,
    content: { subject, blocks, globalStyles },
    ...(purposeId ? { processingPurposeId: purposeId } : {}),
  });
  const campaignId = created.data.id;
  let purposeStored: string | null = null;
  if (purposeId) {
    const [c] = await sql<{ p: string | null }[]>`
      SELECT processing_purpose_id AS p FROM campaigns WHERE id = ${campaignId}
    `;
    purposeStored = c?.p ?? null;
    if (!purposeStored)
      await sql`UPDATE campaigns SET processing_purpose_id = ${purposeId} WHERE id = ${campaignId}`;
  }
  const beforeSplit = await idsOn(campaignSplitterQueue);
  const send = await call('POST', `/api/v1/campaigns/${campaignId}/send`, org.owner);
  const [split] = (
    await addedTo<CampaignSplitterJobData>(campaignSplitterQueue, beforeSplit)
  ).filter((d) => d.campaignId === campaignId);
  const errors: string[] = [];
  let batches: BatchSenderJobData[] = [];
  if (split) {
    const beforeBatch = await idsOn(batchSenderQueue);
    await processCampaignSplitter(job(split)).catch((e) =>
      errors.push(`splitter: ${(e as Error).message.slice(0, 200)}`),
    );
    batches = (await addedTo<BatchSenderJobData>(batchSenderQueue, beforeBatch)).filter(
      (d) => d.campaignId === campaignId,
    );
    for (const b of batches)
      await processBatchSender(job(b)).catch((e) =>
        errors.push(`batch: ${(e as Error).message.slice(0, 200)}`),
      );
  }
  engine.handed.length = 0;
  for (const to of recipients) await deliver(to);
  const reached = engine.handed
    .filter((m) => m.subject === subject)
    .map((m) => m.to.replace(`-${tag}@test.local`, ''))
    .sort();
  return {
    send:
      send.status === 200 || send.status === 202
        ? send.status
        : `${send.status} ${send.text.slice(0, 160)}`,
    purposeStoredByRoute: purposeId ? purposeStored !== null : undefined,
    split: batches.reduce((a, b) => a + (b.contactIds?.length ?? 0), 0),
    reached,
    errors,
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
           (SELECT count(*)::int FROM contact_gdpr_consents WHERE org_id = o.id) AS gdpr_consents,
           (SELECT count(*)::int FROM processing_purposes WHERE org_id = o.id) AS purposes,
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
  seedKey = await seedApiKey(sql, `z176-${tag}`);
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
  // Confirmation tokens of this org, limit keys of its lists, per-purpose tokens of its org.
  let doiKeysRemoved = 0;
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:*', 'COUNT', 1000);
    cursor = next;
    for (const key of keys) {
      if (key.startsWith('doi:limit:')) {
        if (listIds.some((id) => key.startsWith(`doi:limit:${id}:`))) {
          await redis.del(key);
          doiKeysRemoved++;
        }
        continue;
      }
      if ((await redis.type(key)) !== 'string') continue;
      const raw = await redis.get(key);
      if (raw && ids.some((id) => raw.includes(id))) {
        await redis.del(key);
        doiKeysRemoved++;
      }
    }
  } while (cursor !== '0');
  if (ids.length) {
    await sql`DELETE FROM email_events WHERE org_id = ANY(${ids})`;
    await sql`DELETE FROM campaigns WHERE org_id = ANY(${ids})`;
    await sql`DELETE FROM consent_events WHERE org_id = ANY(${ids})`;
    await sql`DELETE FROM contact_gdpr_consents WHERE org_id = ANY(${ids})`;
    await sql`DELETE FROM audit_logs WHERE org_id = ANY(${ids})`;
    await sql`DELETE FROM api_keys WHERE org_id = ANY(${ids})`;
    // Everything else of the organisation goes with it (ON DELETE CASCADE).
    await sql`DELETE FROM organizations WHERE id = ANY(${ids})`;
  }
  // Rate-limit counters of this file's keys and session (api/plugins/rate-limit.ts).
  let limitKeysRemoved = 0;
  for (const raw of [seedKey, ...(org ? [org.key, org.owner] : [])]) {
    const d = createHash('sha256').update(raw).digest('hex').slice(0, 32);
    cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `*${d}*`, 'COUNT', 1000);
      cursor = next;
      for (const key of keys) {
        await redis.del(key);
        limitKeysRemoved++;
      }
    } while (cursor !== '0');
  }
  await sql`DELETE FROM api_keys WHERE name = ${`integration z176-${tag}`}`;
  const [left] = await sql<Record<string, number>[]>`
    SELECT (SELECT count(*)::int FROM organizations WHERE id = ANY(${ids})) AS orgs,
           (SELECT count(*)::int FROM contacts WHERE org_id = ANY(${ids})) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ANY(${ids})) AS suppressions,
           (SELECT count(*)::int FROM email_events WHERE org_id = ANY(${ids})) AS email_events,
           (SELECT count(*)::int FROM consent_events WHERE org_id = ANY(${ids})) AS consent_events,
           (SELECT count(*)::int FROM contact_gdpr_consents WHERE org_id = ANY(${ids})) AS gdpr_consents,
           (SELECT count(*)::int FROM processing_purposes WHERE org_id = ANY(${ids})) AS purposes,
           (SELECT count(*)::int FROM lists WHERE org_id = ANY(${ids})) AS lists
  `;
  let doiKeysLeft = 0;
  cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:*', 'COUNT', 1000);
    cursor = next;
    for (const key of keys) {
      if (key.startsWith('doi:limit:')) {
        if (listIds.some((id) => key.startsWith(`doi:limit:${id}:`))) doiKeysLeft++;
        continue;
      }
      if ((await redis.type(key)) !== 'string') continue;
      const raw = await redis.get(key);
      if (raw && ids.some((id) => raw.includes(id))) doiKeysLeft++;
    }
  } while (cursor !== '0');
  const seedAfter = await seedState();
  report.cells = cells;
  report.rateLimitWaits = rateLimitWaits;
  report.leftover = { ...left, doiKeysLeft, doiKeysRemoved, limitKeysRemoved };
  report.seedOrg = { before: seedBefore, after: seedAfter };
  const all = JSON.stringify(report);
  const parts = Math.ceil(all.length / 3000);
  for (let i = 0; i < parts; i++)
    console.log(
      `Z176_FLOW_CELLS_JSON ${String(i).padStart(4, '0')}/${parts} ${all.slice(i * 3000, (i + 1) * 3000)}`,
    );
  await sql.end();
  expect(left).toEqual({
    orgs: 0,
    contacts: 0,
    suppressions: 0,
    email_events: 0,
    consent_events: 0,
    gdpr_consents: 0,
    purposes: 0,
    lists: 0,
  });
  expect(doiKeysLeft).toBe(0);
  expect(seedAfter, 'the seed organisation changed').toEqual(seedBefore);
}, 300_000);

describe('double opt-in — the button confirms, opening the link does not (Z176)', () => {
  let L = '';
  let LT = '';
  let formId = '';
  const onL: string[] = [];

  /** Sign up on `listId` through the route; the confirmation as the engine got it. */
  async function signUp(name: string, listId: string) {
    const email = addr(name);
    const r = await call('POST', `/api/v1/lists/${listId}/subscribe`, null, { email });
    const mail = await confirmationMail(email);
    return { email, contactId: await contactIdOf(email), answer: r.status, mail };
  }

  /**
   * A person: opens the link, and presses the button if the page has one — the
   * form's own action, an empty form body (or none, `bodyless`), the browser's
   * User-Agent and no cookie. On master the GET is already the confirmation and
   * there is no button.
   */
  async function person(path: string, bodyless = false) {
    const get = await call('GET', path, null, undefined, { 'User-Agent': PERSON_UA });
    const action = /<form method="post" action="([^"]+)">/.exec(get.text)?.[1];
    const post = action
      ? await call('POST', action, null, bodyless ? undefined : '', { 'User-Agent': PERSON_UA })
      : null;
    return { get: page(get), post: post ? page(post) : null, last: post ?? get };
  }

  const done = {
    status: 'active',
    consent: [`double_opt_in/double_opt_in/ip:true/ua:${PERSON_UA}`],
    row: 'confirmed:true unsub:false',
    token: false,
    suppressions: [],
  };

  it('setup — lists, a form with double opt-in, a control member', async () => {
    L = await newList('L');
    LT = await newList('LT', { thankYouUrl: THANK_YOU });
    const f = await api(org.owner, 'POST', '/api/v1/signup-forms', {
      name: `z176 form ${tag}`,
      listId: L,
      fields: [{ name: 'email', label: 'E-mail', type: 'email', required: true }],
      config: { doubleOptIn: true },
    });
    formId = f.data.id;
    const ctrl = await newContact('ctrl');
    await onList(L, ctrl.id);
    onL.push(ctrl.email);
  });

  for (const [cell, method, times] of [
    ['G', 'GET', 1],
    ['H', 'HEAD', 1],
    ['G2', 'GET', 2],
  ] as const) {
    it(`${cell} — a scanner opens the link (${method} ×${times}, no cookie): nothing written`, async () => {
      const s = await signUp(cell.toLowerCase(), L);
      onL.push(s.email);
      const before = await state(s.contactId, L, s.mail.token);
      const opens = [];
      for (let i = 0; i < times; i++)
        opens.push(
          page(await call(method, s.mail.path!, null, undefined, { 'User-Agent': SCANNER_UA })),
        );
      const after = await state(s.contactId, L, s.mail.token);
      cells[cell] = {
        answer: s.answer,
        mail: {
          mta: s.mail.mta,
          engine: s.mail.engine,
          href: s.mail.href?.replace(/[0-9a-f-]{36}/, '<token>') ?? null,
          textHasLink: s.mail.textHasLink,
        },
        before,
        opens,
        after,
      };
      expect(s.answer).toBe(202);
      expect(s.mail.engine, 'the confirmation did not reach the engine').toBe(1);
      expect(s.mail.textHasLink).toBe(true);
      expect(before).toEqual({
        status: 'pending',
        consent: [],
        row: 'no row',
        token: true,
        suppressions: [],
      });
      for (const o of opens) {
        expect(o.status).toBe(200);
        if (method === 'GET') {
          expect(o.form).toBe(`<form method="post" action="${s.mail.path}">`);
          expect(o.autoSubmit).toBe(false);
        }
      }
      expect(after, 'opening the link changed something').toEqual(before);
    });
  }

  it('U — unsubscribed (preference centre), signs up again, a scanner opens the link: the unsubscribe stays', async () => {
    const u = await newContact('u');
    await onList(L, u.id);
    const unsub = await call('POST', `/p/center/${prefToken(u.id)}`, null, {
      globalUnsubscribe: true,
    });
    const s = await signUp('u', L);
    onL.push(u.email);
    const before = await state(u.id, L, s.mail.token);
    const open = page(
      await call('GET', s.mail.path!, null, undefined, { 'User-Agent': SCANNER_UA }),
    );
    const after = await state(u.id, L, s.mail.token);
    cells.U = {
      unsubscribe: unsub.status,
      answer: s.answer,
      mail: { mta: s.mail.mta, engine: s.mail.engine },
      before,
      open,
      after,
    };
    expect(unsub.status).toBe(200);
    expect(s.mail.engine).toBe(1);
    expect(before).toEqual({
      status: 'unsubscribed',
      consent: [],
      row: 'confirmed:true unsub:true',
      token: true,
      suppressions: ['unsubscribe'],
    });
    expect(open.status).toBe(200);
    expect(after, 'opening the link lifted the unsubscribe').toEqual(before);
  });

  it('K / KT / KF — a person opens the link and presses the button (route, thank-you URL, signup form)', async () => {
    const k = await signUp('k', L);
    const kp = await person(k.mail.path!);
    const kt = await signUp('kt', LT);
    const ktp = await person(kt.mail.path!);
    const kfEmail = addr('kf');
    const kfSubmit = await call('POST', `/public/forms/${formId}/submit`, null, {
      email: kfEmail,
    });
    const kfMail = await confirmationMail(kfEmail);
    const kfp = await person(kfMail.path!, true);
    onL.push(k.email, kfEmail);
    const kAfter = await state(k.contactId, L, k.mail.token);
    const ktAfter = await state(kt.contactId, LT, kt.mail.token);
    const kfAfter = await state(await contactIdOf(kfEmail), L, kfMail.token);
    cells.K = { get: kp.get, post: kp.post, after: kAfter };
    cells.KT = { get: ktp.get, post: ktp.post, after: ktAfter };
    cells.KF = {
      submit: kfSubmit.status,
      mail: { mta: kfMail.mta, engine: kfMail.engine },
      get: kfp.get,
      post: kfp.post,
      after: kfAfter,
    };
    expect(kp.last.status).toBe(200);
    expect(kAfter).toEqual(done);
    // 303 from the button's POST; 302 was master's answer to the GET.
    expect([302, 303]).toContain(ktp.last.status);
    expect(ktp.last.location).toBe(THANK_YOU);
    expect(ktAfter).toEqual(done);
    expect(kfSubmit.status).toBe(200);
    expect(kfMail.engine).toBe(1);
    expect(kfp.last.status).toBe(200);
    expect(kfAfter).toEqual(done);
  });

  it('E — an unknown token: the expired page, nothing confirmed', async () => {
    const t = randomUUID();
    const get = page(await call('GET', `/api/v1/confirm/${t}`, null));
    const head = page(await call('HEAD', `/api/v1/confirm/${t}`, null));
    const post = page(await call('POST', `/api/v1/confirm/${t}`, null, ''));
    cells.E = { get, head, post };
    expect(get.status).toBe(400);
    expect(head.status).toBe(400);
    // 400 from the button's route; master has no such route (404).
    expect(post.status).toBeGreaterThanOrEqual(400);
  });

  it('C — as before: the confirmation to an erased address, the limit of three, a receipt to a pending contact', async () => {
    const erased = addr('c-erased');
    const c = await api(org.key, 'POST', '/api/v1/contacts', { email: erased });
    await api(org.owner, 'POST', `/api/v1/contacts/${c.data.id}/anonymize`, {});
    const s = await signUp('c-erased', L);
    const limitTo = addr('c-limit');
    const answers: number[] = [];
    for (let i = 0; i < 4; i++)
      answers.push(
        (await call('POST', `/api/v1/lists/${L}/subscribe`, null, { email: limitTo })).status,
      );
    const limit = await confirmationMail(limitTo);
    const pending = await signUp('c-pending', L);
    const subject = `Faktura ${tag}`;
    const tx = await call('POST', '/api/v1/emails', org.owner, {
      from: `noreply@${org.domain}`,
      to: pending.email,
      subject,
      html: '<p>Faktura</p>',
    });
    engine.handed.length = 0;
    const d = await deliver(pending.email);
    const receipt = {
      answer: tx.status,
      status: (await state(pending.contactId, L, null)).status,
      mta: d,
      engine: engine.handed.filter((m) => m.subject === subject).length,
    };
    cells.C = {
      erasedConfirmation: { answer: s.answer, mta: s.mail.mta, engine: s.mail.engine },
      limit: { answers, mta: limit.mta, engine: limit.engine },
      transactionalToPending: receipt,
    };
    expect(s.mail.engine, 'the erased address got no confirmation').toBe(1);
    expect(answers).toEqual([202, 202, 202, 202]);
    expect(limit.engine, 'not three confirmations').toBe(3);
    expect(receipt.answer).toBe(200);
    expect(receipt.status).toBe('pending');
    expect(receipt.engine).toBe(1);
  });

  it('G / H / G2 / U / K / C — a campaign to L reaches the control and those who pressed the button, not those whose link a scanner opened', async () => {
    const l = await campaignTo(L, onL);
    const lt = await campaignTo(LT, [addr('kt')]);
    cells.campaignL = l;
    cells.campaignLT = lt;
    expect(l.errors).toEqual([]);
    expect(l.reached).toEqual(['z176-ctrl', 'z176-k', 'z176-kf']);
    expect(lt.reached).toEqual(['z176-kt']);
  }, 300_000);

  it('PP — per-purpose GDPR confirmation: opening the link grants nothing and no campaign follows; the button grants', async () => {
    const LP = await newList('LP');
    const pp = await newContact('pp');
    await onList(LP, pp.id);
    const slug = `z176-${tag}`;
    // After every campaign above: an organisation with a purpose requires one on every campaign.
    const purpose = await api(org.owner, 'POST', '/api/v1/gdpr/purposes', {
      slug,
      name: `z176 ${tag}`,
      legalBasis: 'consent',
    });
    const consents = async () =>
      (
        await sql<{ granted: boolean; source: string }[]>`
          SELECT granted, source FROM contact_gdpr_consents
          WHERE org_id = ${org.id} AND contact_id = ${pp.id} ORDER BY granted_at
        `
      ).map((r) => `${r.granted}/${r.source}`);
    const start = await call('POST', `/api/v1/contacts/${pp.id}/gdpr/doi/${slug}`, org.owner, {});
    const mail = await confirmationMail(pp.email, /^Potvrzení souhlasu/);
    const t = /token=([0-9a-f]{64})/.exec(mail.href ?? '')?.[1] ?? '';
    const stored = async () => (await redis.exists(`doi:purpose:${t}`)) === 1;
    const url = `/public/gdpr/doi/confirm?token=${t}`;
    // The link exactly as the e-mail has it — host, path and query — opened as
    // is. It pointed at APP_BASE_URL/gdpr/doi/confirm, which nothing serves
    // (404, Z176 MIMO 1); since Z184 it is this route on the API.
    // A host that does not resolve is recorded as the error, not thrown.
    const fromMail = mail.href
      ? await fetch(mail.href, {
          redirect: 'manual',
          headers: { 'User-Agent': PERSON_UA },
          signal: AbortSignal.timeout(60_000),
        }).catch((err: unknown) => String(err))
      : null;
    const fromMailText = fromMail && typeof fromMail !== 'string' ? await fromMail.text() : '';
    const emailLink =
      fromMail && typeof fromMail !== 'string'
        ? {
            status: fromMail.status,
            form: /<form[^>]*method="post"[^>]*>/i.exec(fromMailText)?.[0] ?? null,
          }
        : { error: fromMail };
    const get = page(await call('GET', url, null, undefined, { 'User-Agent': SCANNER_UA }));
    const head = page(await call('HEAD', url, null, undefined, { 'User-Agent': SCANNER_UA }));
    const afterOpen = { consents: await consents(), stored: await stored() };
    const afterOpenCampaign = await campaignTo(LP, [pp.email], purpose.data.id);
    // The person presses the button of the page the e-mail's link opened.
    const action = /<form method="post" action="([^"]+)">/.exec(fromMailText)?.[1];
    const post = action
      ? page(
          await call('POST', action.replace(/&amp;/g, '&'), null, '', { 'User-Agent': PERSON_UA }),
        )
      : null;
    const afterPost = { consents: await consents(), stored: await stored() };
    const afterPostCampaign = await campaignTo(LP, [pp.email], purpose.data.id);
    cells.PP = {
      start: start.status,
      mail: {
        mta: mail.mta,
        engine: mail.engine,
        href: mail.href?.replace(/token=[0-9a-f]{64}/, 'token=<token>') ?? null,
      },
      emailLink,
      get,
      head,
      afterOpen,
      afterOpenCampaign,
      post,
      afterPost,
      afterPostCampaign,
    };
    expect(start.status).toBe(200);
    expect(mail.engine).toBe(1);
    expect(mail.href).toBe(
      `${process.env.API_PUBLIC_URL ?? process.env.APP_URL ?? 'http://localhost:3001'}/public/gdpr/doi/confirm?token=${t}`,
    );
    expect(emailLink).toEqual({
      status: 200,
      form: `<form method="post" action="/public/gdpr/doi/confirm?token=${t}">`,
    });
    expect(get.status).toBe(200);
    expect(get.form).toBe(`<form method="post" action="/public/gdpr/doi/confirm?token=${t}">`);
    expect(head.status).toBe(200);
    expect(afterOpen, 'opening the link granted the consent').toEqual({
      consents: [],
      stored: true,
    });
    expect(afterOpenCampaign.reached, 'a campaign under the purpose followed the scanner').toEqual(
      [],
    );
    // Without a target from the start the API's own "confirmed" page; it used
    // to be 303 to APP_BASE_URL/gdpr/confirmed, which nothing serves (Z184).
    expect(post?.status).toBe(200);
    expect(post?.location).toBeNull();
    expect(afterPost).toEqual({ consents: ['true/doi_email'], stored: false });
    expect(afterPostCampaign.reached).toEqual(['z176-pp']);
  }, 300_000);
});
