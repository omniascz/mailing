/**
 * An address that unsubscribed or complained gets marketing again only by its
 * own, recorded consent — never by an operator, an API call or an import.
 *
 * ─── What was wrong (Z142, measured on master by sending) ────────────────────
 *
 * Each of these put an unsubscribed or complaining contact back in the next
 * campaign:
 *  - DELETE /suppressions/:id deleted an 'unsubscribe' or 'complaint' row for
 *    any role, viewer included; the PUT guard then let 'active' through, since
 *    it only refused while a row existed.
 *  - A contact that is unsubscribed with no row (created unsubscribed through
 *    POST /contacts or the Resend-compatible API) went 'active' by PUT, by
 *    Resend's `unsubscribed: false`, by archive + unarchive, by unarchive alone
 *    (which set 'active' whatever the status), by PUT 'pending', and by an SMS
 *    subscribe keyword from its phone number.
 *  - A hard bounce was released by any role, with no record of who did it.
 *  - The way that is right — the recipient resubscribing in the preference
 *    centre — had no button on the page and kept no proof of the consent.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * Real routes on the real API, as admin, editor and viewer API keys; a real
 * campaign through the splitter, batch-sender and mta-sender. The only stub is
 * the gRPC client, which answers per address. Every "not reached" is asserted
 * next to a clean control contact on the same list that must be reached.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The Go engine and SMTP.
 * - Merges (duplicates, identity graph) and paths that create a second contact
 *   for the same address; the suppression row is what stops those.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Job, JobType, Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { createTrackingToken } from '@forgemsg/shared';
import { authHeaders, seedApiKey } from './setup/login.js';
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
  handed: [] as { to: string; subject: string }[],
  answer: new Map<string, { code: number; message: string }>(),
}));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string; subject: string }) => {
    engine.handed.push({ to: msg.toEmail, subject: msg.subject });
    const a = engine.answer.get(msg.toEmail);
    return {
      success: !a,
      messageId: 'm',
      smtpCode: a?.code ?? 250,
      smtpMessage: a?.message ?? 'OK',
      error: '',
      durationMs: '1',
      sendingIp: '',
    };
  },
}));

const API = process.env.API_URL!;
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

/**
 * The value config/env.ts falls back to outside production — the same API
 * process CI starts for this suite. A wrong value is a 401 below, not a pass.
 */
const FBL_SECRET = 'dev-fbl-webhook-secret-change-me-32ch';

const tag = randomUUID().slice(0, 8);
const sendingDomain = `nrs-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const addr = (name: string) => `nrs-${name}-${tag}@test.local`;

let seed: SeedOrg;
let token: string;
const listIds: string[] = [];
const createdCampaigns: string[] = [];
const contactIds: string[] = [];
const allAddresses: string[] = [];

const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

const job = <T>(data: T): Job<T> =>
  ({
    id: `nrs-${randomUUID()}`,
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

/**
 * Run every queued MTA job for `to` through the real processor as its LAST
 * attempt — so a 4xx is recorded as the soft bounce it finally is rather than
 * a deferral — then drop it.
 */
async function deliver(to: string): Promise<string[]> {
  const jobs = (
    (await mtaQueues.other.getJobs(ALL_STATES, 0, 5_000)) as Job<MtaSendJobData>[]
  ).filter((j) => j?.data?.toEmail === to);
  const out: string[] = [];
  for (const j of jobs) {
    const last = { data: j.data, opts: { attempts: 1 }, attemptsMade: 0, log: async () => {} };
    try {
      const r = (await processAtOrgRate(last as unknown as Job<MtaSendJobData>)) as {
        status: string;
      };
      out.push(`${j.data.subject} → ${r.status}`);
    } catch (err) {
      out.push(`${j.data.subject} → threw: ${(err as Error).message}`);
    }
    await j.remove().catch(() => {});
  }
  return out;
}

async function call(
  method: string,
  path: string,
  body?: unknown,
  extra: Record<string, string> = {},
): Promise<Response> {
  const isText = typeof body === 'string';
  return fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? authHeaders(token) : {}),
      ...(body === undefined ? {} : { 'Content-Type': isText ? 'text/plain' : 'application/json' }),
      ...extra,
    },
    ...(body === undefined ? {} : { body: isText ? body : JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await call(method, path, body);
  const text = await res.text();
  if (!res.ok) throw new Error(`[nrs] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
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

async function newList(name: string): Promise<string> {
  const [list] = await sql<{ id: string }[]>`
    INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`nrs ${name} ${tag}`}) RETURNING id
  `;
  listIds.push(list!.id);
  return list!.id;
}

/** An active contact on `listId`. Anything else about it is done through routes. */
async function contactOn(listId: string, name: string): Promise<{ id: string; email: string }> {
  const email = addr(name);
  allAddresses.push(email);
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, first_name, status)
    VALUES (${seed.id}, ${email}, 'Petra', 'active') RETURNING id
  `;
  contactIds.push(c!.id);
  await sql`INSERT INTO contact_lists (contact_id, list_id, confirmed_at) VALUES (${c!.id}, ${listId}, now())`;
  return { id: c!.id, email };
}

const prefToken = (contactId: string) =>
  createTrackingToken({
    type: 'pref',
    orgId: seed.id,
    contactId,
    ts: Math.floor(Date.now() / 1000),
  });

async function pref(contactId: string, body: Record<string, unknown>): Promise<number> {
  return (await call('POST', `/p/center/${prefToken(contactId)}`, body)).status;
}

/** An ISP's ARF complaint for `email`, through the forwarder's route. */
async function complaint(email: string): Promise<number> {
  const arf = [
    'From: abuse@isp.invalid',
    'To: fbl@example.invalid',
    'Subject: FBL report',
    '',
    '--b',
    'Content-Type: message/feedback-report',
    '',
    'Feedback-Type: abuse',
    `Original-Rcpt-To: ${email}`,
    'Reporting-MTA: dns; mx.isp.invalid',
    '',
    '--b--',
  ].join('\n');
  const res = await call('POST', '/api/v1/isp/feedback', arf, {
    'x-fbl-secret': FBL_SECRET,
    'x-org-id': seed.id,
  });
  return res.status;
}

/** status · suppression reasons — what the raw output shows. */
async function state(contactId: string): Promise<string> {
  const [c] = await sql<{ status: string; email: string }[]>`
    SELECT status, email FROM contacts WHERE id = ${contactId}
  `;
  const supp = await sql<{ reason: string }[]>`
    SELECT reason FROM suppressions WHERE org_id = ${seed.id} AND email = ${c!.email} ORDER BY reason
  `;
  return `status=${c!.status} suppressions=${JSON.stringify(supp.map((s) => s.reason))}`;
}

/**
 * A marketing campaign to `listId`, all the way to the engine. Returns the
 * addresses the engine was handed THIS campaign for.
 */
async function campaignTo(listId: string, label: string, recipients: string[]): Promise<string[]> {
  const subject = `Novinky ${label} ${tag}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `nrs ${label} ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail,
    listId,
    content: { subject, blocks, globalStyles },
  })) as { data: { id: string } };
  const campaignId = created.data.id;
  createdCampaigns.push(campaignId);

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
  const log: string[] = [];
  for (const to of recipients)
    log.push(`${to.split('@')[0]}: ${JSON.stringify(await deliver(to))}`);
  const reached = engine.handed.filter((m) => m.subject === subject).map((m) => m.to);
  console.log(`[nrs] campaign "${label}" mta=${log.join(' | ')} engine=${JSON.stringify(reached)}`);
  return reached;
}

/** One transactional message through /emails, to the engine. */
async function transactional(to: string): Promise<string> {
  const subject = `Faktura ${randomUUID().slice(0, 6)}`;
  await api('POST', '/api/v1/emails', { from: fromEmail, to, subject, html: '<p>x</p>' });
  engine.handed.length = 0;
  const r = await deliver(to);
  const reached = engine.handed.some((m) => m.to === to && m.subject === subject);
  console.log(`[nrs] transactional ${to.split('@')[0]} mta=${JSON.stringify(r)} engine=${reached}`);
  return reached ? 'reached' : 'not reached';
}

/** An API key of the seed org acting with `role`. */
async function keyWithRole(role: string): Promise<string> {
  const raw = await seedApiKey(sql, `nrs-${role}`);
  await sql`UPDATE api_keys SET role = ${role} WHERE key_prefix = ${raw.slice(0, 12)}`;
  return raw;
}

async function as(key: string, method: string, path: string, body?: unknown) {
  const saved = token;
  token = key;
  try {
    const res = await call(method, path, body);
    return { status: res.status, body: await res.text() };
  } finally {
    token = saved;
  }
}

async function suppressionId(email: string, reason: string): Promise<string> {
  const [r] = await sql<{ id: string }[]>`
    SELECT id FROM suppressions WHERE org_id = ${seed.id} AND email = ${email} AND reason = ${reason}
  `;
  expect(r, `no ${reason} row for ${email}`).toBeTruthy();
  return r!.id;
}

/** A contact on no list, written straight into the table — e.g. created unsubscribed, no row. */
async function bare(name: string, status = 'active', phone: string | null = null) {
  const email = addr(name);
  allAddresses.push(email);
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, first_name, status, phone)
    VALUES (${seed.id}, ${email}, 'Petra', ${status}, ${phone}) RETURNING id
  `;
  contactIds.push(c!.id);
  return { id: c!.id, email };
}

/**
 * After the operation the operator puts the address on a fresh list and sends
 * to it — list membership is theirs to give; consent is not. A clean control
 * on the same list must arrive, or the answer means nothing.
 */
async function reachedOnFreshList(label: string, contactId: string, email: string) {
  const listId = await newList(`fresh-${label}`);
  const control = await contactOn(listId, `ctl-${label}`);
  const add = await call('POST', `/api/v1/lists/${listId}/contacts`, { contactId });
  expect(add.status).toBe(204);
  const reached = await campaignTo(listId, label, [email, control.email]);
  expect(reached, 'the control contact got nothing').toContain(control.email);
  return reached.includes(email);
}

async function hardBounced(name: string) {
  const listId = await newList(`hb-${name}`);
  const c = await contactOn(listId, name);
  engine.answer.set(c.email, { code: 550, message: '5.1.1 user unknown' });
  await campaignTo(listId, `hb-${name}`, [c.email]);
  engine.answer.delete(c.email);
  await suppressionId(c.email, 'hard_bounce');
  return c;
}

describe('an unsubscribed or complaining address comes back only by its own consent', () => {
  let admin: string, editor: string, viewer: string;

  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await seedApiKey(sql, 'nrs');
    admin = await keyWithRole('admin');
    editor = await keyWithRole('editor');
    viewer = await keyWithRole('viewer');
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
  }, 120_000);

  afterAll(async () => {
    for (const a of allAddresses) await deliver(a).catch(() => {});
    if (allAddresses.length)
      await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND email = ANY(${allAddresses})`;
    if (contactIds.length) {
      await sql`DELETE FROM consent_events WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM audit_logs WHERE org_id = ${seed.id} AND resource = 'suppression' AND changes->>'email' = ANY(${allAddresses})`;
    }
    if (createdCampaigns.length) {
      await sql`DELETE FROM email_events WHERE campaign_id = ANY(${createdCampaigns})`;
      await sql`DELETE FROM campaigns WHERE id = ANY(${createdCampaigns})`;
    }
    // The import creates a contact this file did not insert itself.
    const imported = await sql<{ id: string }[]>`
      SELECT id FROM contacts WHERE org_id = ${seed.id} AND email = ANY(${allAddresses})
    `;
    const ids = [...new Set([...contactIds, ...imported.map((r) => r.id)])];
    if (ids.length) {
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contact_lists WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${ids})`;
    }
    if (listIds.length) await sql`DELETE FROM lists WHERE id = ANY(${listIds})`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql.end();
  }, 180_000);

  it('an unsubscribe or complaint row cannot be deleted, by any role; an edit to active is refused', async () => {
    const u = await bare('del-unsub');
    expect(await pref(u.id, { globalUnsubscribe: true })).toBe(200);
    const k = await bare('del-cmpl');
    expect(await complaint(k.email)).toBeLessThan(300);

    for (const [c, reason] of [
      [u, 'unsubscribe'],
      [k, 'complaint'],
    ] as const) {
      const id = await suppressionId(c.email, reason);
      // Master: 204 for every role, viewer included.
      const byAdmin = await as(admin, 'DELETE', `/api/v1/suppressions/${id}`);
      expect(byAdmin.status, byAdmin.body).toBe(409);
      expect(JSON.parse(byAdmin.body).code).toBe('CONSENT_REQUIRED');
      expect((await as(editor, 'DELETE', `/api/v1/suppressions/${id}`)).status).toBe(403);
      expect((await as(viewer, 'DELETE', `/api/v1/suppressions/${id}`)).status).toBe(403);
      await suppressionId(c.email, reason);

      // Master: 200 once the row was gone, and the next campaign mailed them.
      const put = await as(admin, 'PUT', `/api/v1/contacts/${c.id}`, { status: 'active' });
      expect(put.status, put.body).toBe(409);
      console.log(
        `[nrs] ${reason}: delete admin=${byAdmin.status} put=${put.status} ${await state(c.id)}`,
      );
      expect(await reachedOnFreshList(`del-${reason}`, c.id, c.email)).toBe(false);
    }
  }, 300_000);

  it('a hard bounce is released by an admin only, with an audit row, and marketing then goes', async () => {
    for (const [role, key] of [
      ['editor', editor],
      ['viewer', viewer],
    ] as const) {
      const c = await hardBounced(`hb-${role}`);
      const id = await suppressionId(c.email, 'hard_bounce');
      expect((await as(key, 'DELETE', `/api/v1/suppressions/${id}`)).status, role).toBe(403);
      await suppressionId(c.email, 'hard_bounce');
    }

    const c = await hardBounced('hb-admin');
    const id = await suppressionId(c.email, 'hard_bounce');
    const del = await as(admin, 'DELETE', `/api/v1/suppressions/${id}`);
    expect(del.status, del.body).toBe(204);
    const [audit] = await sql<
      { user_id: string | null; created_at: Date; changes: { email: string; reason: string } }[]
    >`
      SELECT user_id, created_at, changes FROM audit_logs
      WHERE org_id = ${seed.id} AND action = 'suppression.released' AND resource_id = ${id}
    `;
    expect(audit, 'no audit row').toBeTruthy();
    expect(audit!.user_id).toBeTruthy();
    expect(audit!.changes).toMatchObject({ email: c.email, reason: 'hard_bounce' });
    expect(Date.now() - audit!.created_at.getTime()).toBeLessThan(120_000);

    // The status still says bounced; an admin sets it back, which is allowed.
    const put = await as(admin, 'PUT', `/api/v1/contacts/${c.id}`, { status: 'active' });
    expect(put.status, put.body).toBe(200);
    expect(await reachedOnFreshList('hb-released', c.id, c.email)).toBe(true);
  }, 300_000);

  it('Resend-compatible unsubscribed: false is refused and restores nothing', async () => {
    const listId = await newList('rs');
    const email = addr('rs-created');
    allAddresses.push(email);
    const created = (await api('POST', `/api/v1/audiences/${listId}/contacts`, {
      email,
      unsubscribed: true,
    })) as { id: string; unsubscribed: boolean };
    contactIds.push(created.id);
    expect(created.unsubscribed).toBe(true);

    // Master: 200, status 'active', and the next campaign to the audience mailed them.
    const patch = await as(admin, 'PATCH', `/api/v1/audiences/${listId}/contacts/${created.id}`, {
      unsubscribed: false,
      first_name: 'Eva',
    });
    expect(patch.status, patch.body).toBe(422);
    expect(JSON.parse(patch.body)).toMatchObject({ statusCode: 422, name: 'validation_error' });
    const [row] = await sql<{ status: string; first_name: string }[]>`
      SELECT status, first_name FROM contacts WHERE id = ${created.id}
    `;
    expect(row!.status).toBe('unsubscribed');
    expect(row!.first_name, 'a refused request wrote the name').not.toBe('Eva');
    const control = await contactOn(listId, 'rs-ctl');
    const reached = await campaignTo(listId, 'rs', [email, control.email]);
    expect(reached).toContain(control.email);
    expect(reached).not.toContain(email);

    // Other fields keep working, in the same shape.
    const active = await bare('rs-name');
    const ok = await as(admin, 'PATCH', `/api/v1/audiences/${listId}/contacts/${active.id}`, {
      first_name: 'Jana',
      unsubscribed: false,
    });
    expect(ok.status, ok.body).toBe(200);
    expect(JSON.parse(ok.body)).toMatchObject({
      object: 'contact',
      id: active.id,
      first_name: 'Jana',
      unsubscribed: false,
    });
  }, 300_000);

  it('unarchive restores the status the archive replaced; it is not a way to activate', async () => {
    const statusOnly = await bare('ua-status-only', 'unsubscribed');
    const viaPref = await bare('ua-pref');
    expect(await pref(viaPref.id, { globalUnsubscribe: true })).toBe(200);
    const active = await bare('ua-active');

    for (const c of [statusOnly, viaPref, active]) {
      expect((await as(editor, 'POST', `/api/v1/contacts/${c.id}/archive`)).status).toBe(200);
      const un = await as(editor, 'POST', `/api/v1/contacts/${c.id}/unarchive`);
      expect(un.status, un.body).toBe(200);
    }
    // Master: 'active' for all three, and the status-only one was mailed.
    expect(await state(statusOnly.id)).toBe('status=unsubscribed suppressions=[]');
    expect(await state(viaPref.id)).toBe('status=unsubscribed suppressions=["unsubscribe"]');
    expect(await state(active.id)).toBe('status=active suppressions=[]');
    expect(await reachedOnFreshList('ua', statusOnly.id, statusOnly.email)).toBe(false);

    // Master: 200 and 'active' for a contact that was never archived.
    const never = await bare('ua-never', 'unsubscribed');
    const un = await as(editor, 'POST', `/api/v1/contacts/${never.id}/unarchive`);
    expect(un.status, un.body).toBe(409);
    expect(await state(never.id)).toBe('status=unsubscribed suppressions=[]');

    // An archived contact cannot be edited out of the refusal either.
    const archived = await bare('ua-put', 'unsubscribed');
    await as(editor, 'POST', `/api/v1/contacts/${archived.id}/archive`);
    const put = await as(admin, 'PUT', `/api/v1/contacts/${archived.id}`, { status: 'active' });
    expect(put.status, put.body).toBe(409);
  }, 300_000);

  it('an edit or an SMS keyword does not resubscribe a contact that is unsubscribed with no row', async () => {
    for (const next of ['active', 'pending'] as const) {
      const c = await bare(`put-${next}`, 'unsubscribed');
      // Master: 200, and the next campaign mailed them.
      const put = await as(admin, 'PUT', `/api/v1/contacts/${c.id}`, { status: next });
      expect(put.status, put.body).toBe(409);
      expect(JSON.parse(put.body).code).toBe('CONSENT_REQUIRED');
      expect(await reachedOnFreshList(`put-${next}`, c.id, c.email)).toBe(false);
    }
    // A name edit that carries the unchanged status still saves.
    const same = await bare('put-same', 'unsubscribed');
    const ok = await as(admin, 'PUT', `/api/v1/contacts/${same.id}`, {
      status: 'unsubscribed',
      firstName: 'Iva',
    });
    expect(ok.status, ok.body).toBe(200);

    const phone = `+4207${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    const c = await bare('sms', 'unsubscribed', phone);
    const kw = `NRS${tag.slice(0, 5)}`.toUpperCase();
    expect(
      (await as(admin, 'POST', '/api/v1/sms/keywords', { keyword: kw, action: 'subscribe' }))
        .status,
    ).toBe(201);
    try {
      const sms = await as(admin, 'POST', '/api/v1/sms/inbound', { fromPhone: phone, body: kw });
      expect(sms.status, sms.body).toBe(200);
      expect(JSON.parse(sms.body).data.matched).toBe(true);
      // Master: 'active', and the next campaign mailed them.
      expect(await state(c.id)).toBe('status=unsubscribed suppressions=[]');
      expect(await reachedOnFreshList('sms', c.id, c.email)).toBe(false);
    } finally {
      await sql`DELETE FROM sms_keywords WHERE org_id = ${seed.id} AND keyword = ${kw}`;
    }
  }, 300_000);

  it('the preference page offers the way back; taking it brings marketing back and keeps the proof', async () => {
    const listId = await newList('pref');
    const c = await contactOn(listId, 'pref-back');
    const control = await contactOn(listId, 'pref-ctl');
    expect(await pref(c.id, { globalUnsubscribe: true })).toBe(200);
    expect(await campaignTo(listId, 'pref-out', [c.email, control.email])).not.toContain(c.email);

    // Master: no button — the page could only say "write to the sender".
    const page = await call('GET', `/p/center/${prefToken(c.id)}`, undefined, {
      Accept: 'text/html',
    });
    const html = await page.text();
    expect(html).toContain('name="action" value="resubscribe"');
    expect(html).toContain(`value="${listId}"`);

    const form = await call(
      'POST',
      `/p/center/${prefToken(c.id)}`,
      `action=resubscribe&list=${listId}`,
      { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'nrs-browser/1.0' },
    );
    expect(form.status).toBeLessThan(400);
    expect(await state(c.id)).toBe('status=active suppressions=[]');
    expect(await campaignTo(listId, 'pref-back', [c.email, control.email])).toContain(c.email);

    // Master: nothing recorded — the deleted row was the only trace of the unsubscribe.
    const timeline = await sql<
      {
        event_type: string;
        source: string;
        ip_hash: string | null;
        user_agent: string | null;
        occurred_at: Date;
        proof_payload: Record<string, unknown>;
      }[]
    >`
      SELECT event_type, source, ip_hash, user_agent, occurred_at, proof_payload
      FROM consent_events WHERE org_id = ${seed.id} AND contact_id = ${c.id}
    `;
    // Since Z186 the unsubscribe (opt_out) and the way back to the ticked list
    // (re_consent {listId, via}) are on the timeline beside the global way back.
    expect(timeline.map((e) => e.event_type).sort()).toEqual([
      'opt_out',
      're_consent',
      're_consent',
    ]);
    const proof = timeline.filter(
      (e) => e.event_type === 're_consent' && 'liftedUnsubscribe' in e.proof_payload,
    );
    expect(proof).toHaveLength(1);
    expect(proof[0]).toMatchObject({
      event_type: 're_consent',
      source: 'preference_center',
      user_agent: 'nrs-browser/1.0',
    });
    expect(proof[0]!.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(proof[0]!.proof_payload).toMatchObject({
      via: 'page',
      lists: [listId],
      fromStatus: 'unsubscribed',
      liftedUnsubscribe: true,
    });

    // A complaint is not the recipient's to lift here: no button, nothing lifted.
    const k = await contactOn(listId, 'pref-cmpl');
    expect(await complaint(k.email)).toBeLessThan(300);
    const kPage = await (
      await call('GET', `/p/center/${prefToken(k.id)}`, undefined, { Accept: 'text/html' })
    ).text();
    expect(kPage).not.toContain('value="resubscribe"');
    await call('POST', `/p/center/${prefToken(k.id)}`, `action=resubscribe&list=${listId}`, {
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    expect(await pref(k.id, { globalResubscribe: true, resubscribeToLists: [listId] })).toBe(200);
    expect(await state(k.id)).toBe('status=complained suppressions=["complaint"]');
    expect(await campaignTo(listId, 'pref-cmpl', [k.email, control.email])).not.toContain(k.email);
    const none = await sql`SELECT 1 FROM consent_events WHERE contact_id = ${k.id}`;
    expect(none).toHaveLength(0);
  }, 300_000);

  it('an import does not resubscribe an unsubscribed address, and transactional mail still reaches it', async () => {
    const c = await bare('imp');
    expect(await pref(c.id, { globalUnsubscribe: true })).toBe(200);
    const listId = await newList('imp');
    const fresh = addr('imp-new');
    allAddresses.push(fresh);
    const csv = `email,first_name,status\n${c.email},Petra,subscribed\n${fresh},Nova,subscribed\n`;
    const fd = new FormData();
    fd.append('file', new Blob([csv], { type: 'text/csv' }), `nrs-${tag}.csv`);
    const up = await fetch(`${API}/api/v1/contacts/import/upload`, {
      method: 'POST',
      headers: authHeaders(token),
      body: fd,
      signal: AbortSignal.timeout(20_000),
    });
    expect(up.status).toBe(200);
    const job = ((await up.json()) as { data: { id: string } }).data;
    try {
      await api('POST', `/api/v1/contacts/import/${job.id}/mapping`, {
        mapping: { email: 'email', first_name: 'first_name', status: 'status' },
        defaultListId: listId,
      });
      await api('POST', `/api/v1/contacts/import/${job.id}/execute`);
      let jr: { status: string; insertedRows: number; skippedRows: number } | undefined;
      for (let i = 0; i < 80; i++) {
        jr = ((await api('GET', `/api/v1/contacts/import/${job.id}`)) as { data: typeof jr }).data;
        if (jr!.status === 'completed' || jr!.status === 'failed') break;
        await new Promise((r) => setTimeout(r, 250));
      }
      expect(jr).toMatchObject({ status: 'completed', insertedRows: 1, skippedRows: 1 });
      expect(await state(c.id)).toBe('status=unsubscribed suppressions=["unsubscribe"]');
      const reached = await campaignTo(listId, 'imp', [c.email, fresh]);
      expect(reached, 'the new address from the file').toContain(fresh);
      expect(reached).not.toContain(c.email);
    } finally {
      await sql`DELETE FROM import_jobs WHERE id = ${job.id}`;
    }

    expect(await transactional(c.email)).toBe('reached');
  }, 300_000);
});
