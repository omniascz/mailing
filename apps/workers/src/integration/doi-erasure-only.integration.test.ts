/**
 * The double opt-in confirmation passes the row a GDPR erasure leaves, and no
 * other 'manual' row; and at most three go to one address on one list in 24
 * hours (Z170).
 *
 * ─── What was wrong (measured on master b5fd99b) ─────────────────────────────
 *
 * Since Z148 the confirmation passed EVERY 'manual' suppression. 'manual' is
 * what an erasure leaves (by hash), but also what an operator adds by hand
 * (POST /suppressions, the MCP suppress_contact tool through it) and what
 * graymail writes: a confirmation went to an address the organisation had
 * blocked, and its link lifts none of those rows. Michal 14. 10., varianta
 * (a): výjimka jen pro výmaz GDPR — the erasure row (reason 'manual', no
 * address, only email_hash) is the one the confirmation passes. And the public
 * subscribe route queued a confirmation every time it was asked.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * API → queue → mta-sender, with the gRPC client of the engine the only stub.
 * An organisation of this file, its owner session from /me/orgs/switch; its
 * lists, forms, contacts, suppressions, the erasure and the graymail sweep
 * through their routes (the graymail contact is INSERTed, as its age and send
 * count cannot be set through a route). Each confirmation is asked for through
 * a form and through POST /lists/:id/subscribe, delivered by the real
 * mta-sender, and counted at the engine.
 *
 *   M   an ordinary 'manual' row (POST /suppressions, graymail): stopped;
 *   G   the erasure: sent, its link lifts the erasure, a campaign follows;
 *   B   hard_bounce, complaint, block, invalid_email stopped; unsubscribe not;
 *   GM  an erasure AND an ordinary 'manual' row: stopped;
 *   L1  5× the route and 5× the form for one address and list: three each;
 *   K   transactional, per-purpose DOI, flow inline and campaign mail, a
 *       clean confirmation and a password reset: as on master.
 *
 * Everything measured is printed once as `Z170_WORKERS_CELLS_JSON {…}`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { type Job, type JobType, type Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { redis } from '@forgemsg/shared/redis';
import { SEED_LOGIN, authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processAtOrgRate } from './setup/process-at-org-rate.js';
import { suppressionEmailHash } from '../../../api/dist/services/suppressions/email.js';
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
const sendingDomain = `z170-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const DOI_SUBJECT = /^Confirm your subscription to /;
const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

let seed: SeedOrg;
let seedKey = '';
let seedBefore: Record<string, unknown> = {};
let org = '';
let owner = '';
const allAddresses: string[] = [];
const listIds: string[] = [];
const formIds: string[] = [];
const userIds: string[] = [];
const cells: Record<string, unknown> = {};
const report: Record<string, unknown> = {
  tag,
  mock: 'the gRPC client of the engine only; everything else is the real API, queue and mta-sender',
};

const address = (name: string) => {
  const a = `z170-${name}-${tag}@test.local`;
  allAddresses.push(a);
  return a;
};

const job = <T>(data: T): Job<T> =>
  ({
    id: `z170-${randomUUID()}`,
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

interface Delivered {
  statuses: string[];
  messageIds: string[];
  purposes: string[];
}

/** Run every queued MTA job for `to` through the real processor, then drop it. */
async function deliver(to: string): Promise<Delivered> {
  const out: Delivered = { statuses: [], messageIds: [], purposes: [] };
  for (const j of await queuedFor(to)) {
    out.messageIds.push(j.data.messageId);
    out.purposes.push(`${j.data.stream}/${j.data.purpose ?? '-'}`);
    const last = { data: j.data, opts: { attempts: 1 }, attemptsMade: 0, log: async () => {} };
    try {
      const r = (await processAtOrgRate(last as unknown as Job<MtaSendJobData>)) as {
        status: string;
      };
      out.statuses.push(r.status);
    } catch (err) {
      out.statuses.push(`threw: ${(err as Error).message}`);
    }
    await j.remove().catch(() => {});
  }
  return out;
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
    throw new Error(`[z170] ${method} ${path} → ${r.status}: ${r.text.slice(0, 300)}`);
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

async function newList(name: string): Promise<{ id: string; name: string }> {
  const listName = `z170 ${name} ${tag}`;
  const b = (await api('POST', '/api/v1/lists', { name: listName, doubleOptIn: true })) as {
    data: { id: string };
  };
  listIds.push(b.data.id);
  return { id: b.data.id, name: listName };
}

async function doiForm(listId: string): Promise<string> {
  const b = (await api('POST', '/api/v1/signup-forms', {
    name: `z170 form ${tag} ${formIds.length}`,
    listId,
    fields: [{ name: 'email', label: 'E-mail', type: 'email', required: true }],
    config: { doubleOptIn: true },
  })) as { data: { id: string } };
  formIds.push(b.data.id);
  return b.data.id;
}

async function submit(formId: string, email: string): Promise<number> {
  return (await call('POST', `/public/forms/${formId}/submit`, null, { email })).status;
}

async function subscribe(listId: string, email: string): Promise<number> {
  return (await call('POST', `/api/v1/lists/${listId}/subscribe`, null, { email })).status;
}

async function newContact(email: string): Promise<string> {
  const b = (await api('POST', '/api/v1/contacts', { email, firstName: 'Petra' })) as {
    data: { id: string };
  };
  return b.data.id;
}

async function onList(listId: string, contactId: string): Promise<void> {
  await api('POST', `/api/v1/lists/${listId}/contacts`, { contactId });
}

/** The person asks to be erased: a contact created and anonymised through the API. */
async function erase(email: string): Promise<void> {
  const id = await newContact(email);
  await api('POST', `/api/v1/contacts/${id}/anonymize`, {});
}

async function suppress(email: string, reason: string): Promise<void> {
  await api('POST', '/api/v1/suppressions', { email, reason });
}

/** Graymail: a contact 30 days old, 25 sends, no engagement — dormant to the sweep route. */
async function graymail(email: string): Promise<Record<string, unknown>> {
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, status, created_at)
    VALUES (${org}, ${email}, 'active', now() - interval '30 days') RETURNING id
  `;
  await sql`
    INSERT INTO contact_engagement (contact_id, org_id, total_sends)
    VALUES (${c!.id}, ${org}, 25)
  `;
  const b = (await api('POST', '/api/v1/deliverability/graymail/sweep')) as {
    data: Record<string, unknown>;
  };
  return b.data;
}

async function suppressionRows(email: string) {
  return sql<{ reason: string; email_null: boolean; hash_null: boolean }[]>`
    SELECT reason, email IS NULL AS email_null, email_hash IS NULL AS hash_null
    FROM suppressions
    WHERE org_id = ${org}
      AND (lower(email) = lower(${email}) OR email_hash = ${suppressionEmailHash(email)})
    ORDER BY reason, email IS NULL
  `;
}

async function failedReasons(messageIds: string[]): Promise<string[]> {
  if (messageIds.length === 0) return [];
  const r = await sql<{ reason: string | null }[]>`
    SELECT metadata->>'reason' AS reason FROM email_events
    WHERE org_id = ${org} AND event_type = 'failed' AND message_id = ANY(${messageIds})
  `;
  return r.map((x) => x.reason ?? '-');
}

interface Path {
  answer: number;
  mta: string[];
  purposes: string[];
  engine: number;
  failed: string[];
}

/** One confirmation asked for, delivered, and counted at the engine. */
async function confirmation(to: string, ask: () => Promise<number>): Promise<Path> {
  const answer = await ask();
  engine.handed.length = 0;
  const d = await deliver(to);
  return {
    answer,
    mta: d.statuses,
    purposes: d.purposes,
    engine: engine.handed.filter(
      (m) => m.to.toLowerCase() === to.toLowerCase() && DOI_SUBJECT.test(m.subject),
    ).length,
    failed: await failedReasons(d.messageIds),
  };
}

let cellsForm = '';
let cellsList = { id: '', name: '' };
let routeList = { id: '', name: '' };

/** A confirmation through the form and through the subscribe route, for `to`. */
async function bothPaths(to: string) {
  return {
    form: await confirmation(to, () => submit(cellsForm, to)),
    route: await confirmation(to, () => subscribe(routeList.id, to)),
  };
}

async function preSendCount(campaignId: string): Promise<string> {
  const r = await call('GET', `/api/v1/campaigns/${campaignId}/pre-send-checks`, owner);
  if (/No recipients in selected audience/.test(r.text)) return '0';
  const m = /"title":"([\d,]+) recipients"/.exec(r.text);
  return m ? m[1]!.replace(/,/g, '') : `? ${r.status} ${r.text.slice(0, 120)}`;
}

/** A campaign to `listId`, all the way to the engine: the pre-send count and who it reached. */
async function campaignTo(listId: string, recipients: string[]) {
  const subject = `Novinky ${randomUUID().slice(0, 6)}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `z170 ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail,
    listId,
    content: { subject, blocks, globalStyles },
  })) as { data: { id: string } };
  const campaignId = created.data.id;
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
  return { count, reached };
}

/** The confirmation link as the recipient sees it in the mail, by its path. */
function confirmPath(html: string): string {
  const link = /href="[^"]*?(\/api\/v1\/confirm\/[0-9a-f-]{36})"/.exec(html)?.[1];
  expect(link, 'no confirmation link in the mail').toBeTruthy();
  return link!;
}

/** The seed org as a whole: this file must leave it exactly as it found it. */
async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await sql<Record<string, unknown>[]>`
    SELECT (SELECT count(*)::int FROM email_events WHERE org_id = o.id) AS email_events,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM contacts WHERE org_id = o.id) AS contacts,
           (SELECT count(*)::int FROM lists WHERE org_id = o.id) AS lists,
           (SELECT count(*)::int FROM signup_forms WHERE org_id = o.id) AS forms,
           (SELECT count(*)::int FROM campaigns WHERE org_id = o.id) AS campaigns,
           (SELECT count(*)::int FROM organization_members WHERE org_id = o.id) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = o.id) AS api_keys,
           (SELECT count(*)::int FROM users WHERE org_id = o.id) AS users
    FROM organizations o WHERE o.id = ${seed.id}
  `;
  return r!;
}

describe('the DOI confirmation passes the erasure row only, three per address and list (Z170)', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    seedBefore = await seedState();
    seedKey = await seedApiKey(sql, `z170-${tag}`);
    const [o] = await sql<{ id: string }[]>`
      INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
      VALUES (${`z170 ${tag}`}, ${`z170-${tag}`}, 'production', 'Obchod z170 s.r.o.',
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
    cellsList = await newList('cells form');
    cellsForm = await doiForm(cellsList.id);
    routeList = await newList('cells route');
  }, 120_000);

  afterAll(async () => {
    for (const a of allAddresses) await deliver(a).catch(() => {});
    // Confirmation tokens and limit keys of this file's lists; per-purpose tokens of its org.
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:*', 'COUNT', 1000);
      cursor = next;
      for (const key of keys) {
        if (listIds.some((id) => key.startsWith(`doi:limit:${id}:`))) {
          await redis.del(key);
          continue;
        }
        if (key.startsWith('doi:limit:')) continue;
        const raw = await redis.get(key);
        if (raw?.includes(org)) await redis.del(key);
      }
    } while (cursor !== '0');
    if (userIds.length) await sql`DELETE FROM users WHERE id = ANY(${userIds})`;
    await sql`DELETE FROM email_events WHERE org_id = ${org}`;
    await sql`DELETE FROM campaigns WHERE org_id = ${org}`;
    await sql`DELETE FROM consent_events WHERE org_id = ${org}`;
    await sql`DELETE FROM audit_logs WHERE org_id = ${org}`;
    await sql`DELETE FROM api_keys WHERE org_id = ${org}`;
    // Everything else of the organisation goes with it (ON DELETE CASCADE).
    await sql`DELETE FROM organizations WHERE id = ${org}`;
    await sql`DELETE FROM api_keys WHERE name = ${`integration z170-${tag}`}`;
    const [left] = await sql<Record<string, number>[]>`
      SELECT (SELECT count(*)::int FROM organizations WHERE id = ${org}) AS orgs,
             (SELECT count(*)::int FROM contacts WHERE org_id = ${org}) AS contacts,
             (SELECT count(*)::int FROM suppressions WHERE org_id = ${org}) AS suppressions,
             (SELECT count(*)::int FROM email_events WHERE org_id = ${org}) AS email_events,
             (SELECT count(*)::int FROM lists WHERE org_id = ${org}) AS lists,
             (SELECT count(*)::int FROM organization_members WHERE org_id = ${org}) AS members
    `;
    let keysLeft = 0;
    cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:limit:*', 'COUNT', 1000);
      cursor = next;
      keysLeft += keys.filter((k) => listIds.some((id) => k.startsWith(`doi:limit:${id}:`))).length;
    } while (cursor !== '0');
    const seedAfter = await seedState();
    report.cells = cells;
    report.leftover = { ...left, limitKeys: keysLeft };
    report.seedOrg = { before: seedBefore, after: seedAfter };
    console.log(`Z170_WORKERS_CELLS_JSON ${JSON.stringify(report)}`);
    await sql.end();
    expect(left).toEqual({
      orgs: 0,
      contacts: 0,
      suppressions: 0,
      email_events: 0,
      lists: 0,
      members: 0,
    });
    expect(keysLeft).toBe(0);
    // The seed org exactly as this file found it — a snapshot, not zeros.
    expect(seedAfter).toEqual(seedBefore);
  }, 180_000);

  it("M — an ordinary 'manual' row (POST /suppressions) stops the confirmation on both paths", async () => {
    const to = address('m-post');
    await suppress(to, 'manual');
    const cell = { rows: await suppressionRows(to), ...(await bothPaths(to)) };
    cells.M_post = cell;
    console.log(`[z170] M_post: ${JSON.stringify(cell)}`);
    for (const p of [cell.form, cell.route]) {
      expect(p.answer).toBeLessThan(300);
      expect(p.mta).toEqual(['suppressed']);
      expect(p.engine).toBe(0);
      expect(p.failed).toEqual(['suppressed']);
    }
  });

  it("M — the 'manual' row graymail writes stops the confirmation on both paths", async () => {
    const to = address('m-graymail');
    const sweep = await graymail(to);
    const cell = { sweep, rows: await suppressionRows(to), ...(await bothPaths(to)) };
    cells.M_graymail = cell;
    console.log(`[z170] M_graymail: ${JSON.stringify(cell)}`);
    expect(cell.rows).toEqual([{ reason: 'manual', email_null: false, hash_null: true }]);
    for (const p of [cell.form, cell.route]) {
      expect(p.mta).toEqual(['suppressed']);
      expect(p.engine).toBe(0);
      expect(p.failed).toEqual(['suppressed']);
    }
  });

  it('GM — an erasure AND an ordinary manual row by the address: the manual row wins', async () => {
    const to = address('gm');
    await erase(to);
    await suppress(to, 'manual');
    const cell = { rows: await suppressionRows(to), ...(await bothPaths(to)) };
    cells.GM = cell;
    console.log(`[z170] GM: ${JSON.stringify(cell)}`);
    expect(cell.rows).toEqual([
      { reason: 'manual', email_null: false, hash_null: true },
      { reason: 'manual', email_null: true, hash_null: false },
    ]);
    for (const p of [cell.form, cell.route]) {
      expect(p.mta).toEqual(['suppressed']);
      expect(p.engine).toBe(0);
    }
  });

  it('G — the erased person gets the confirmation, its link lifts the erasure, a campaign follows', async () => {
    const person = address('g');
    await erase(person);
    const rows = await suppressionRows(person);
    const list = await newList('return');
    const form = await doiForm(list.id);
    const control = address('g-control');
    await onList(list.id, await newContact(control));

    engine.handed.length = 0;
    const answer = await submit(form, person);
    const d = await deliver(person);
    const mails = engine.handed
      .filter((m) => m.to.toLowerCase() === person && DOI_SUBJECT.test(m.subject))
      .map((m) => m.html);
    const before = await campaignTo(list.id, [person, control]);
    const confirm = mails[0]
      ? // The page the link opens posts it back from its button (Z176).
        await fetch(`${API}${confirmPath(mails[0])}`, { method: 'POST', redirect: 'manual' })
      : null;
    const rowsAfter = await suppressionRows(person);
    const after = await campaignTo(list.id, [person, control]);
    // And the subscribe route, for another erased person.
    const viaRoute = address('g-route');
    await erase(viaRoute);
    const route = await confirmation(viaRoute, () => subscribe(routeList.id, viaRoute));
    const cell = {
      rows,
      form: { answer, mta: d.statuses, engine: mails.length },
      campaignBeforeClick: before,
      confirmStatus: confirm?.status ?? null,
      rowsAfterClick: rowsAfter,
      campaignAfterClick: after,
      route,
    };
    cells.G = cell;
    console.log(`[z170] G: ${JSON.stringify(cell)}`);
    expect(rows).toEqual([{ reason: 'manual', email_null: true, hash_null: false }]);
    expect(cell.form.mta).toEqual(['sent']);
    expect(cell.form.engine).toBe(1);
    expect(before.reached, 'marketing went out before the confirmation').toEqual([control]);
    expect(cell.confirmStatus).toBeLessThan(400);
    expect(rowsAfter, 'the confirmation did not lift the erasure').toEqual([]);
    expect(after.reached).toEqual([person, control].sort());
    expect(route.mta).toEqual(['sent']);
    expect(route.engine).toBe(1);
  }, 600_000);

  it.each([
    ['hard_bounce', 0],
    ['complaint', 0],
    ['block', 0],
    ['invalid_email', 0],
    ['unsubscribe', 1],
  ])('B — %s: %i confirmation on each path, as on master', async (reason, expected) => {
    const to = address(`b-${reason.replace('_', '')}`);
    await suppress(to, reason);
    const cell = await bothPaths(to);
    cells[`B_${reason}`] = cell;
    console.log(`[z170] B_${reason}: ${JSON.stringify(cell)}`);
    expect(cell.form.engine).toBe(expected);
    expect(cell.route.engine).toBe(expected);
  });

  it('K — no suppression: one confirmation on each path', async () => {
    const to = address('k-clean');
    const cell = await bothPaths(to);
    cells.K_clean = cell;
    console.log(`[z170] K_clean: ${JSON.stringify(cell)}`);
    expect(cell.form.engine).toBe(1);
    expect(cell.route.engine).toBe(1);
  });

  it('L1 — 5× the route and 5× the form for one address and list: three confirmations each', async () => {
    const routeTo = address('l1-route');
    const formTo = address('l1-form');
    const list = await newList('limit');
    const form = await doiForm(list.id);
    const routeAnswers: number[] = [];
    for (let i = 0; i < 5; i++) routeAnswers.push(await subscribe(list.id, routeTo));
    const formAnswers: number[] = [];
    for (let i = 0; i < 5; i++) formAnswers.push(await submit(form, formTo));
    engine.handed.length = 0;
    const dr = await deliver(routeTo);
    const df = await deliver(formTo);
    const at = (to: string) =>
      engine.handed.filter((m) => m.to.toLowerCase() === to && DOI_SUBJECT.test(m.subject)).length;
    const [s] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM signup_form_submissions WHERE form_id = ${form}
    `;
    const cell = {
      route: { answers: routeAnswers, mta: dr.statuses, engine: at(routeTo) },
      form: { answers: formAnswers, mta: df.statuses, engine: at(formTo), submissions: s!.n },
    };
    cells.L1 = cell;
    console.log(`[z170] L1: ${JSON.stringify(cell)}`);
    expect(routeAnswers).toEqual([202, 202, 202, 202, 202]);
    expect(formAnswers).toEqual([200, 200, 200, 200, 200]);
    expect(cell.form.submissions).toBe(5);
    expect(cell.route.engine).toBe(3);
    expect(cell.form.engine).toBe(3);
  });

  it("K — other mail to an ordinary 'manual' address and to an erased one: as on master", async () => {
    const manual = address('k-manual');
    const erased = address('k-erased');
    const manualId = await newContact(manual);
    await suppress(manual, 'manual');
    await erase(erased);

    // A transactional message (POST /emails).
    const transactional = async (to: string) => {
      const subject = `Faktura ${randomUUID().slice(0, 6)}`;
      const r = await call('POST', '/api/v1/emails', owner, {
        from: fromEmail,
        to,
        subject,
        html: '<p>x</p>',
      });
      engine.handed.length = 0;
      const d = await deliver(to);
      return {
        answer: r.status,
        mta: d.statuses,
        engine: engine.handed.filter((m) => m.subject === subject).length,
      };
    };
    const emailsManual = await transactional(manual);
    const emailsErased = await transactional(erased);

    // A campaign to a list holding the 'manual' address and a control. Before
    // the processing purpose below exists: an org with one requires every
    // campaign to name it.
    const list = await newList('k campaign');
    const control = address('k-control');
    await onList(list.id, manualId);
    await onList(list.id, await newContact(control));
    const campaign = await campaignTo(list.id, [manual, control]);

    // A per-purpose DOI (authenticated route; no purpose on the job).
    await api('POST', '/api/v1/gdpr/purposes', {
      slug: `z170-${tag}`,
      name: `z170 ${tag}`,
      legalBasis: 'consent',
    });
    const pp = await call('POST', `/api/v1/contacts/${manualId}/gdpr/doi/z170-${tag}`, owner, {});
    engine.handed.length = 0;
    const ppd = await deliver(manual);
    const perPurpose = {
      answer: pp.status,
      mta: ppd.statuses,
      purposes: ppd.purposes,
      engine: engine.handed.filter((m) => /^Potvrzení souhlasu/.test(m.subject)).length,
    };

    // A flow's inline-HTML e-mail, as the workflow-email worker posts it.
    const flowSubject = `Flow ${randomUUID().slice(0, 6)}`;
    const fr = await fetch(`${API}/api/v1/internal/workflow/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...INTERNAL },
      body: JSON.stringify({
        orgId: org,
        contactId: manualId,
        subject: flowSubject,
        html: '<p>Dobrý den.</p>',
      }),
    });
    const frText = await fr.text();
    engine.handed.length = 0;
    const fd = await deliver(manual);
    const flowInline = {
      answer: fr.status,
      body: frText.slice(0, 160),
      mta: fd.statuses,
      purposes: fd.purposes,
      engine: engine.handed.filter((m) => m.subject === flowSubject).length,
    };

    // A password reset to a clean address (a user of this file's org).
    const resetTo = address('k-reset');
    const [u] = await sql<{ id: string }[]>`
      INSERT INTO users (org_id, email, name) VALUES (${org}, ${resetTo}, 'Reset') RETURNING id
    `;
    userIds.push(u!.id);
    const rr = await call('POST', '/api/v1/auth/forgot-password', null, { email: resetTo });
    // The route enqueues without waiting for it.
    for (let i = 0; i < 20 && (await queuedFor(resetTo)).length === 0; i++)
      await new Promise((r) => setTimeout(r, 100));
    engine.handed.length = 0;
    const rd = await deliver(resetTo);
    const reset = {
      answer: rr.status,
      mta: rd.statuses,
      engine: engine.handed.filter((m) => m.subject === 'Reset your password').length,
    };

    const cell = { emailsManual, emailsErased, perPurpose, flowInline, campaign, reset };
    cells.K_other = cell;
    console.log(`[z170] K_other: ${JSON.stringify(cell)}`);
    expect(emailsManual.engine).toBe(0);
    expect(emailsErased.engine).toBe(0);
    expect(perPurpose.answer).toBe(200);
    expect(perPurpose.engine).toBe(0);
    expect(flowInline.answer).toBe(200);
    expect(flowInline.engine).toBe(0);
    expect(campaign.reached).toEqual([control]);
    expect(reset.answer).toBe(200);
    expect(reset.engine).toBe(1);
  }, 600_000);
});
