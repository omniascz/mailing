/**
 * A list campaign counts, splits and sends to the same people; an edit to
 * 'active' over a complaint, unsubscribe or manual row is refused — walked to
 * the engine (Z171).
 *
 * ─── What was wrong (measured on master 6977b32) ─────────────────────────────
 *
 * The audience of a list campaign (listAudienceWhere, shared by the pre-send
 * count and the splitter) left out archived / non_subscribed / pending and
 * trusted suppression rows for the rest. An unsubscribed, bounced or
 * complained contact with no row — a PUT or a POST sets the status alone — was
 * counted and split, and batch-sender then refused it by its status (Z146
 * MIMO 1: 2 counted, 1 sent). And PUT active on a bounced or archived contact
 * went through over a complaint, unsubscribe or manual row (Z149 MIMO 1, 2);
 * Michal 13. 10.: those are not released by an edit.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * API → queue → splitter → batch-sender → mta-sender, with the gRPC client of
 * the engine the only stub. An organisation of this file, its owner session
 * from /me/orgs/switch; contacts (POST /contacts with the status), rows (POST
 * /suppressions), unsubscribes (PUT unsubscribed), lists, campaigns, the
 * resend, the preference centre and the DOI confirmation through their routes.
 *
 *   P   a list of {active, unsubscribed, bounced, complained (no row), active +
 *       unsubscribe row, pending}: pre-send count, contacts split, engine;
 *   A   PUT active over complaint / unsubscribe / manual, then a campaign;
 *   R   the recipient's own way back (preference centre, DOI, DOI after an
 *       erasure), then a campaign reaches them;
 *   K   POST /emails and a flow's inline e-mail to a status-only unsubscribed
 *       contact, and the resend to non-openers (resolveNonOpeners), as on master;
 *   S5  does any list campaign send to such a contact (engine).
 *
 * Everything measured is printed once as `Z171_WORKERS_CELLS_JSON {…}`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { type Job, type JobType, type Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
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

// Hoisted with the mock: the factory runs while the imports above load.
const engine = vi.hoisted(() => ({
  handed: [] as { to: string; subject: string; html: string }[],
}));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string; subject: string; htmlBody: string }) => {
    engine.handed.push({ to: msg.toEmail, subject: msg.subject, html: msg.htmlBody });
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
const INTERNAL = { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' };
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

const tag = randomUUID().slice(0, 8);
const sendingDomain = `z171-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

let seed: SeedOrg;
let seedKey = '';
let seedBefore: Record<string, unknown> = {};
let org = '';
let owner = '';
const allAddresses: string[] = [];
const listIds: string[] = [];
const cells: Record<string, unknown> = {};
const report: Record<string, unknown> = {
  tag,
  mock: 'the gRPC client of the engine only; everything else is the real API, queue, splitter, batch-sender and mta-sender',
};

const address = (name: string) => {
  const a = `z171-${name}-${tag}@test.local`;
  allAddresses.push(a);
  return a;
};

const job = <T>(data: T): Job<T> =>
  ({
    id: `z171-${randomUUID()}`,
    timestamp: Date.now(),
    data,
    log: async () => {},
  }) as unknown as Job<T>;

async function idsOn(queue: Queue): Promise<Set<string>> {
  const jobs = await queue.getJobs([...ALL_STATES, 'completed'], 0, 5_000);
  return new Set(jobs.map((j) => String(j?.id)));
}

async function addedTo<T>(queue: Queue, before: Set<string>): Promise<T[]> {
  const jobs = await queue.getJobs([...ALL_STATES, 'completed'], 0, 5_000);
  return jobs.filter((j) => j && !before.has(String(j.id))).map((j) => j.data as T);
}

async function queuedFor(to: string): Promise<Job<MtaSendJobData>[]> {
  return ((await mtaQueues.other.getJobs(ALL_STATES, 0, 5_000)) as Job<MtaSendJobData>[]).filter(
    (j) => j?.data?.toEmail?.toLowerCase() === to.toLowerCase(),
  );
}

/** Run every queued MTA job for `to` through the real processor, then drop it. */
async function deliver(to: string): Promise<string[]> {
  const out: string[] = [];
  for (const j of await queuedFor(to)) {
    const last = { data: j.data, opts: { attempts: 1 }, attemptsMade: 0, log: async () => {} };
    try {
      const r = (await processAtOrgRate(last as unknown as Job<MtaSendJobData>)) as {
        status: string;
      };
      out.push(r.status);
    } catch (err) {
      out.push(`threw: ${(err as Error).message}`);
    }
    await j.remove().catch(() => {});
  }
  return out;
}

/** The confirmation link in the double opt-in e-mail the engine was last handed for `to`. */
function confirmPathFor(to: string): string | null {
  const mail = engine.handed
    .filter(
      (m) =>
        m.to.toLowerCase() === to.toLowerCase() && /^Confirm your subscription to /.test(m.subject),
    )
    .at(-1);
  return /href="[^"]*?(\/api\/v1\/confirm\/[0-9a-f-]{36})"/.exec(mail?.html ?? '')?.[1] ?? null;
}

async function call(
  method: string,
  path: string,
  credential: string | null,
  body?: unknown,
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(credential ? authHeaders(credential) : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  return { status: res.status, text: await res.text() };
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const r = await call(method, path, owner, body);
  if (r.status >= 300)
    throw new Error(`[z171] ${method} ${path} → ${r.status}: ${r.text.slice(0, 300)}`);
  return r.text ? JSON.parse(r.text) : null;
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

async function newList(name: string, doubleOptIn = false): Promise<string> {
  const b = (await api('POST', '/api/v1/lists', {
    name: `z171 ${name} ${tag}`,
    ...(doubleOptIn ? { doubleOptIn: true } : {}),
  })) as { data: { id: string } };
  listIds.push(b.data.id);
  return b.data.id;
}

/** A contact of this org with `status` (POST /contacts), on `listId`. */
async function contactOn(listId: string, name: string, status = 'active') {
  const email = address(name);
  const b = (await api('POST', '/api/v1/contacts', {
    email,
    firstName: 'Petra',
    ...(status === 'active' ? {} : { status }),
  })) as { data: { id: string } };
  await api('POST', `/api/v1/lists/${listId}/contacts`, { contactId: b.data.id });
  return { id: b.data.id, email };
}

async function suppress(email: string, reason: string): Promise<void> {
  await api('POST', '/api/v1/suppressions', { email, reason });
}

async function statusOf(id: string): Promise<string> {
  const [row] = await sql<{ status: string }[]>`
    SELECT status::text AS status FROM contacts WHERE id = ${id}
  `;
  return row!.status;
}

async function preSendCount(campaignId: string): Promise<string> {
  const r = await call('GET', `/api/v1/campaigns/${campaignId}/pre-send-checks`, owner);
  if (/No recipients in selected audience/.test(r.text)) return '0';
  const m = /"title":"([\d,]+) recipients"/.exec(r.text);
  return m ? m[1]!.replace(/,/g, '') : `? ${r.status} ${r.text.slice(0, 120)}`;
}

interface Sent {
  campaignId: string;
  count: string;
  split: number;
  reached: string[];
}

/** Send `campaignId` all the way to the engine: pre-send count, contacts split, who it reached. */
async function sendThrough(
  campaignId: string,
  subject: string,
  recipients: string[],
): Promise<Sent> {
  const count = await preSendCount(campaignId);
  const beforeSplit = await idsOn(campaignSplitterQueue);
  await api('POST', `/api/v1/campaigns/${campaignId}/send`);
  const [split] = (
    await addedTo<CampaignSplitterJobData>(campaignSplitterQueue, beforeSplit)
  ).filter((d) => d.campaignId === campaignId);
  expect(split, 'no splitter job').toBeTruthy();
  const beforeBatch = await idsOn(batchSenderQueue);
  await processCampaignSplitter(job(split!));
  const batches = (await addedTo<BatchSenderJobData>(batchSenderQueue, beforeBatch)).filter(
    (d) => d.campaignId === campaignId,
  );
  for (const b of batches) await processBatchSender(job(b));
  engine.handed.length = 0;
  for (const to of recipients) await deliver(to);
  const reached = engine.handed
    .filter((m) => m.subject === subject)
    .map((m) => m.to.toLowerCase())
    .sort();
  return {
    campaignId,
    count,
    split: batches.reduce((a, b) => a + (b.contactIds?.length ?? 0), 0),
    reached,
  };
}

/** A campaign to `listId`, all the way to the engine. */
async function campaignTo(listId: string, recipients: string[]): Promise<Sent> {
  const subject = `Novinky ${randomUUID().slice(0, 6)}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `z171 ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail,
    listId,
    content: { subject, blocks, globalStyles },
  })) as { data: { id: string } };
  return sendThrough(created.data.id, subject, recipients);
}

/** The seed org as a whole: this file must leave it exactly as it found it. */
async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await sql<Record<string, unknown>[]>`
    SELECT (SELECT count(*)::int FROM email_events WHERE org_id = o.id) AS email_events,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM contacts WHERE org_id = o.id) AS contacts,
           (SELECT count(*)::int FROM lists WHERE org_id = o.id) AS lists,
           (SELECT count(*)::int FROM campaigns WHERE org_id = o.id) AS campaigns,
           (SELECT count(*)::int FROM organization_members WHERE org_id = o.id) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = o.id) AS api_keys,
           (SELECT count(*)::int FROM users WHERE org_id = o.id) AS users
    FROM organizations o WHERE o.id = ${seed.id}
  `;
  return r!;
}

describe('a list campaign counts what it sends; PUT active waits on a held row (Z171)', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    seedBefore = await seedState();
    seedKey = await seedApiKey(sql, `z171-${tag}`);
    const [o] = await sql<{ id: string }[]>`
      INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
      VALUES (${`z171 ${tag}`}, ${`z171-${tag}`}, 'production', 'Obchod z171 s.r.o.',
              'Nádražní 1, 110 00 Praha')
      RETURNING id
    `;
    org = o!.id;
    await sql`
      INSERT INTO organization_members (org_id, user_id, email, role, status)
      SELECT ${org}, id, email, 'owner', 'active' FROM users WHERE email = ${SEED_LOGIN.email}
    `;
    const r = await call('POST', '/api/v1/me/orgs/switch', seedKey, { orgId: org });
    expect(r.status, r.text).toBe(200);
    owner = (JSON.parse(r.text) as { data: { token: string } }).data.token;
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${org}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
  }, 120_000);

  afterAll(async () => {
    for (const a of allAddresses) await deliver(a).catch(() => {});
    let tokensRemoved = 0;
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:*', 'COUNT', 1000);
      cursor = next;
      for (const key of keys) {
        if (key.startsWith('doi:limit:')) {
          if (listIds.some((id) => key.startsWith(`doi:limit:${id}:`))) await redis.del(key);
          continue;
        }
        if (key.startsWith('doi:purpose:')) continue;
        const raw = await redis.get(key);
        if (raw?.includes(org)) {
          await redis.del(key);
          tokensRemoved++;
        }
      }
    } while (cursor !== '0');
    await sql`DELETE FROM email_events WHERE org_id = ${org}`;
    await sql`DELETE FROM campaigns WHERE org_id = ${org}`;
    await sql`DELETE FROM consent_events WHERE org_id = ${org}`;
    await sql`DELETE FROM audit_logs WHERE org_id = ${org}`;
    await sql`DELETE FROM api_keys WHERE org_id = ${org}`;
    // Everything else of the organisation goes with it (ON DELETE CASCADE).
    await sql`DELETE FROM organizations WHERE id = ${org}`;
    await sql`DELETE FROM api_keys WHERE name = ${`integration z171-${tag}`}`;
    const [left] = await sql<Record<string, number>[]>`
      SELECT (SELECT count(*)::int FROM organizations WHERE id = ${org}) AS orgs,
             (SELECT count(*)::int FROM contacts WHERE org_id = ${org}) AS contacts,
             (SELECT count(*)::int FROM suppressions WHERE org_id = ${org}) AS suppressions,
             (SELECT count(*)::int FROM email_events WHERE org_id = ${org}) AS email_events,
             (SELECT count(*)::int FROM lists WHERE org_id = ${org}) AS lists,
             (SELECT count(*)::int FROM campaigns WHERE org_id = ${org}) AS campaigns,
             (SELECT count(*)::int FROM organization_members WHERE org_id = ${org}) AS members
    `;
    let limitKeysLeft = 0;
    cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:limit:*', 'COUNT', 1000);
      cursor = next;
      limitKeysLeft += keys.filter((k) =>
        listIds.some((id) => k.startsWith(`doi:limit:${id}:`)),
      ).length;
    } while (cursor !== '0');
    const seedAfter = await seedState();
    report.cells = cells;
    report.leftover = { ...left, limitKeys: limitKeysLeft, doiTokensRemoved: tokensRemoved };
    report.seedOrg = { before: seedBefore, after: seedAfter };
    console.log(`Z171_WORKERS_CELLS_JSON ${JSON.stringify(report)}`);
    await sql.end();
    expect(left).toEqual({
      orgs: 0,
      contacts: 0,
      suppressions: 0,
      email_events: 0,
      lists: 0,
      campaigns: 0,
      members: 0,
    });
    expect(limitKeysLeft).toBe(0);
    // The seed org exactly as this file found it — a snapshot, not zeros.
    expect(seedAfter).toEqual(seedBefore);
  }, 180_000);

  it('P — a status-only unsubscribed / bounced / complained contact is neither counted nor split; the same one person is sent to', async () => {
    const listId = await newList('P');
    const m: Record<string, { id: string; email: string }> = {};
    m.active = await contactOn(listId, 'p-active');
    m.unsubscribed = await contactOn(listId, 'p-unsub', 'unsubscribed');
    m.bounced = await contactOn(listId, 'p-bounced', 'bounced');
    m.complained = await contactOn(listId, 'p-complained', 'complained');
    m.activeRow = await contactOn(listId, 'p-active-row');
    await suppress(m.activeRow.email, 'unsubscribe');
    m.pending = await contactOn(listId, 'p-pending', 'pending');
    const emails = Object.values(m).map((c) => c.email.toLowerCase());
    const rows = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM suppressions WHERE org_id = ${org}
        AND lower(email) = ANY(${emails})
    `;
    const sent = await campaignTo(
      listId,
      Object.values(m).map((c) => c.email),
    );
    const byEmail = Object.fromEntries(
      Object.entries(m).map(([k, c]) => [c.email.toLowerCase(), k]),
    );
    const cell = {
      rowsOnList: rows[0]!.n,
      count: sent.count,
      split: sent.split,
      reached: sent.reached.map((e) => byEmail[e] ?? e),
    };
    cells.P = cell;
    console.log(`[z171] P: ${JSON.stringify(cell)}`);
    expect(cell.rowsOnList, 'only the one row this cell added').toBe(1);
    expect(cell.reached).toEqual(['active']);
    expect(cell.count, 'the pre-send count is what is sent').toBe('1');
    expect(cell.split, 'the splitter split only who is sent to').toBe(1);
  }, 600_000);

  it('A — PUT active over complaint / unsubscribe / manual is refused; the campaign reaches only the control', async () => {
    const listId = await newList('A');
    const control = await contactOn(listId, 'a-control');
    const out: Record<string, unknown> = {};
    const people: string[] = [control.email];
    for (const [label, start, reason] of [
      ['bounced + complaint', 'bounced', 'complaint'],
      ['bounced + unsubscribe', 'bounced', 'unsubscribe'],
      ['bounced + manual', 'bounced', 'manual'],
      ['archived(active) + complaint', 'archived', 'complaint'],
    ] as const) {
      const c = await contactOn(
        listId,
        `a-${label.replace(/[^a-z]+/g, '-')}`,
        start === 'archived' ? 'active' : start,
      );
      if (start === 'archived')
        await api('PUT', `/api/v1/contacts/${c.id}`, { status: 'archived' });
      await suppress(c.email, reason);
      const put = await call('PUT', `/api/v1/contacts/${c.id}`, owner, { status: 'active' });
      out[label] = {
        answer: put.status,
        code: put.status >= 400 ? (JSON.parse(put.text) as { code?: string }).code : null,
        after: await statusOf(c.id),
      };
      people.push(c.email);
    }
    const sent = await campaignTo(listId, people);
    const cell = { puts: out, count: sent.count, split: sent.split, reached: sent.reached };
    cells.A = cell;
    console.log(`[z171] A: ${JSON.stringify(cell)}`);
    for (const [label, v] of Object.entries(out))
      expect((v as { answer: number; code: string }).code, label).toBe('SUPPRESSION_HELD');
    expect(cell.reached).toEqual([control.email]);
    expect(cell.count).toBe('1');
  }, 600_000);

  it("R — the recipient's own way back: preference centre, DOI, DOI after an erasure; the next campaign reaches each", async () => {
    const listId = await newList('R', true);
    const pref = await contactOn(listId, 'r-pref');
    await api('PUT', `/api/v1/contacts/${pref.id}`, { status: 'unsubscribed' });
    const prefToken = createTrackingToken({
      type: 'pref',
      orgId: org,
      contactId: pref.id,
      ts: Math.floor(Date.now() / 1000),
    });
    const pr = await call('POST', `/p/center/${prefToken}`, null, {
      globalResubscribe: true,
      resubscribeToLists: [listId],
    });

    const confirm = async (email: string) => {
      const s = await call('POST', `/api/v1/lists/${listId}/subscribe`, null, { email });
      // The link out of the confirmation e-mail, and the button its page posts (Z176).
      await deliver(email);
      const link = confirmPathFor(email);
      const c = link ? await call('POST', link, null) : null;
      return { subscribe: s.status, confirm: c?.status ?? null };
    };
    const doi = await contactOn(listId, 'r-doi');
    await api('PUT', `/api/v1/contacts/${doi.id}`, { status: 'unsubscribed' });
    const doiAnswer = await confirm(doi.email);

    const erasedEmail = address('r-erased');
    const g = (await api('POST', '/api/v1/contacts', { email: erasedEmail })) as {
      data: { id: string };
    };
    await api('POST', `/api/v1/contacts/${g.data.id}/anonymize`, {});
    const erasedAnswer = await confirm(erasedEmail);
    const [erased] = await sql<{ id: string; status: string }[]>`
      SELECT id, status::text AS status FROM contacts
      WHERE org_id = ${org} AND lower(email) = lower(${erasedEmail}) AND deleted_at IS NULL
    `;

    const sent = await campaignTo(listId, [pref.email, doi.email, erasedEmail]);
    const cell = {
      pref: { answer: pr.status, status: await statusOf(pref.id) },
      doi: { ...doiAnswer, status: await statusOf(doi.id) },
      erased: { ...erasedAnswer, status: erased?.status ?? null },
      count: sent.count,
      reached: sent.reached.length,
      reachedWho: sent.reached.map((e) =>
        e === pref.email.toLowerCase() ? 'pref' : e === doi.email.toLowerCase() ? 'doi' : 'erased',
      ),
    };
    cells.R = cell;
    console.log(`[z171] R: ${JSON.stringify(cell)}`);
    expect([cell.pref.status, cell.doi.status, cell.erased.status]).toEqual([
      'active',
      'active',
      'active',
    ]);
    expect(cell.reachedWho).toEqual(['doi', 'erased', 'pref'].sort());
    expect(cell.count).toBe('3');
  }, 600_000);

  it('K — POST /emails and a flow inline e-mail to a status-only unsubscribed contact, and the resend, as on master', async () => {
    const listId = await newList('K');
    const unsub = await contactOn(listId, 'k-unsub', 'unsubscribed');

    // A transactional message (POST /emails): its path reads no contact status.
    const subject = `Faktura ${randomUUID().slice(0, 6)}`;
    const e = await call('POST', '/api/v1/emails', owner, {
      from: fromEmail,
      to: unsub.email,
      subject,
      html: '<p>x</p>',
    });
    engine.handed.length = 0;
    const eMta = await deliver(unsub.email);
    const emails = {
      answer: e.status,
      mta: eMta,
      engine: engine.handed.filter((m) => m.subject === subject).length,
    };

    // A flow's inline-HTML e-mail, as the workflow-email worker posts it.
    const flowSubject = `Flow ${randomUUID().slice(0, 6)}`;
    const fr = await fetch(`${API}/api/v1/internal/workflow/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...INTERNAL },
      body: JSON.stringify({
        orgId: org,
        contactId: unsub.id,
        subject: flowSubject,
        html: '<p>Dobrý den.</p>',
      }),
    });
    const frText = await fr.text();
    engine.handed.length = 0;
    const fMta = await deliver(unsub.email);
    const flowInline = {
      answer: fr.status,
      body: frText.slice(0, 160),
      mta: fMta,
      engine: engine.handed.filter((m) => m.subject === flowSubject).length,
    };

    // The resend to non-openers: the parent reaches two active contacts, one
    // is then marked bounced by a PUT (status only, no row), and the resend's
    // audience (resolveNonOpeners, not changed by Z171) is counted. A resend
    // has no listId, and the send path refuses that (measured on master and
    // the branch alike: 400 "listId (audience) is required") — so what is
    // recorded is the count, the audience the splitter would fetch, and the
    // answer of the send.
    const rList = await newList('K resend');
    const a = await contactOn(rList, 'k-resend-a');
    const b = await contactOn(rList, 'k-resend-b');
    const parent = await campaignTo(rList, [a.email, b.email]);
    await api('PUT', `/api/v1/contacts/${b.id}`, { status: 'bounced' });
    const child = (await api('POST', `/api/v1/campaigns/${parent.campaignId}/schedule-resend`, {
      delayHours: 1,
      newSubject: `Znovu ${randomUUID().slice(0, 6)}`,
    })) as { data: { id: string } };
    const aud = await fetch(
      `${API}/api/v1/internal/audience?orgId=${org}&campaignId=${child.data.id}`,
      { headers: INTERNAL },
    );
    const audIds =
      ((await aud.json()) as { data?: { contactIds?: string[] } }).data?.contactIds ?? [];
    const send = await call('POST', `/api/v1/campaigns/${child.data.id}/send`, owner);
    const resend = {
      parentReached: parent.reached.length,
      count: await preSendCount(child.data.id),
      audience: audIds
        .map((id) => (id === a.id ? 'active' : id === b.id ? 'bounced' : 'other'))
        .sort(),
      send: { answer: send.status, body: send.text.slice(0, 160) },
    };

    const cell = { emails, flowInline, resend };
    cells.K = cell;
    console.log(`[z171] K: ${JSON.stringify(cell)}`);
    expect(emails.answer).toBeLessThan(300);
    expect(flowInline.engine, 'a flow marketing e-mail to an unsubscribed contact').toBe(0);
    expect(
      (resend as { reached?: string[] }).reached ?? [],
      'the resend never sends to the bounced contact',
    ).not.toContain('bounced');
  }, 600_000);

  it('S5 — no list campaign sends to a status-only unsubscribed / bounced / complained contact', async () => {
    const listId = await newList('S5');
    const control = await contactOn(listId, 's5-control');
    const refused = [
      await contactOn(listId, 's5-unsub', 'unsubscribed'),
      await contactOn(listId, 's5-bounced', 'bounced'),
      await contactOn(listId, 's5-complained', 'complained'),
    ];
    const sent = await campaignTo(listId, [control.email, ...refused.map((c) => c.email)]);
    const cell = { count: sent.count, split: sent.split, reached: sent.reached };
    cells.S5 = cell;
    console.log(`[z171] S5: ${JSON.stringify(cell)}`);
    expect(cell.reached).toEqual([control.email]);
  }, 600_000);
});
