/**
 * An erased person stays suppressed: the same address created again gets no
 * mail until the person confirms a double opt-in.
 *
 * ─── What was wrong (Z145, measured on master by sending) ────────────────────
 *
 * POST /contacts/:id/anonymize answers 200 and leaves a suppression with email
 * NULL and the address's SHA-256 in notes ('gdpr_anonymized:<hex>'). Nothing
 * that decides a send read it. The same address created again — POST
 * /contacts, a CSV import, a signup form, the Resend-compatible API, a PUT
 * that changes another contact's address, in either case — got the campaign,
 * the flow e-mail, /transactional/email and /emails, and the SMTP RCPT was
 * accepted. DELETE /suppressions/:id removed the row for an owner and an
 * admin alike (204).
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * The erasure through the API, the address created again through the API in
 * lower case and in capitals, then a campaign through the splitter →
 * batch-sender → mta-sender, a flow's send-email, both transactional routes
 * and the engine's RCPT check. The gRPC client is the only stub. A clean
 * control and a different person with a similar address on the same list must
 * be mailed every time. A row written before migration 0035 (hash only in
 * notes) is filled by the migration and blocks as well. Neither an owner nor an
 * admin can delete the row, a single-step signup does not lift it, and the
 * person's own double opt-in confirmation does, with its consent_events proof.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { type Job, type JobType, type Queue } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processAtOrgRate } from './setup/process-at-org-rate.js';
import { processBatchSender } from '../jobs/batch-sender.js';
import { processCampaignSplitter } from '../jobs/campaign-splitter.js';
import {
  batchSenderQueues,
  batchSenderQueue,
  campaignSplitterQueue,
  mtaQueues,
  type BatchSenderJobData,
  type CampaignSplitterJobData,
  type MtaSendJobData,
} from '../queues/index.js';

// Hoisted with the mock: the factory runs while the imports above load.
const engine = vi.hoisted(() => ({ handed: [] as { to: string; subject: string }[] }));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string; subject: string }) => {
    engine.handed.push({ to: msg.toEmail, subject: msg.subject });
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

const MIGRATION_0035 = fileURLToPath(
  new URL('../../../api/drizzle/0035_suppression_email_hash.sql', import.meta.url),
);

const tag = randomUUID().slice(0, 8);
const sendingDomain = `erase-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const INTERNAL = { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' };

let seed: SeedOrg;
let owner: string;
let admin: string;
const listIds: string[] = [];
const formIds: string[] = [];
const createdCampaigns: string[] = [];
const contactIds: string[] = [];
const allAddresses: string[] = [];

const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

/** What an erasure keeps of an address (services/suppressions/email.ts). */
const hashOf = (email: string) =>
  createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

const job = <T>(data: T): Job<T> =>
  ({
    id: `erase-${randomUUID()}`,
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

/** Run every queued MTA job for `to` (any case) through the real processor, then drop it. */
async function deliver(to: string): Promise<string[]> {
  const jobs = (
    (await mtaQueues.other.getJobs(ALL_STATES, 0, 5_000)) as Job<MtaSendJobData>[]
  ).filter((j) => j?.data?.toEmail?.toLowerCase() === to.toLowerCase());
  const out: string[] = [];
  for (const j of jobs) {
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

async function call(method: string, path: string, body?: unknown, key = owner): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      ...authHeaders(key),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await call(method, path, body);
  const text = await res.text();
  if (!res.ok) throw new Error(`[erase] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
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

async function newList(name: string, doubleOptIn = 0): Promise<string> {
  const [list] = await sql<{ id: string }[]>`
    INSERT INTO lists (org_id, name, double_opt_in)
    VALUES (${seed.id}, ${`erase ${name} ${tag}`}, ${doubleOptIn}) RETURNING id
  `;
  listIds.push(list!.id);
  return list!.id;
}

async function onList(listId: string, contactId: string): Promise<void> {
  await sql`
    INSERT INTO contact_lists (contact_id, list_id, confirmed_at)
    VALUES (${contactId}, ${listId}, now()) ON CONFLICT DO NOTHING
  `;
}

/** An active contact written straight to the table, its address as given. */
async function contactRow(email: string): Promise<string> {
  allAddresses.push(email);
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, first_name, status)
    VALUES (${seed.id}, ${email}, 'Petra', 'active') RETURNING id
  `;
  contactIds.push(c!.id);
  return c!.id;
}

/** The person asks to be erased: a contact anonymised through the API. */
async function erase(email: string): Promise<void> {
  const id = await contactRow(email);
  const res = await call('POST', `/api/v1/contacts/${id}/anonymize`, {});
  expect(res.status, await res.text()).toBe(200);
}

/** The erasure's suppression rows for this address (notes carry the hash before and after 0035). */
async function erasureRows(email: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM suppressions
    WHERE org_id = ${seed.id} AND notes = ${`gdpr_anonymized:${hashOf(email)}`}
  `;
  return rows.map((r) => r.id);
}

/** The same address created again through POST /contacts, as typed. */
async function createdAgain(email: string): Promise<string> {
  allAddresses.push(email);
  const res = (await api('POST', '/api/v1/contacts', { email, firstName: 'Petra' })) as {
    data: { id: string };
  };
  contactIds.push(res.data.id);
  return res.data.id;
}

async function preSendCount(campaignId: string): Promise<string> {
  const res = await call('GET', `/api/v1/campaigns/${campaignId}/pre-send-checks`);
  const text = await res.text();
  if (/No recipients in selected audience/.test(text)) return '0';
  const m = /"title":"([\d,]+) recipients"/.exec(text);
  return m ? m[1]!.replace(/,/g, '') : `? ${res.status} ${text.slice(0, 120)}`;
}

/** A campaign to `listId`, all the way to the engine: the pre-send count and who it reached. */
async function campaignTo(listId: string, recipients: string[]) {
  const subject = `Novinky ${randomUUID().slice(0, 6)}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `erase ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail,
    listId,
    content: { subject, blocks, globalStyles },
  })) as { data: { id: string } };
  const campaignId = created.data.id;
  createdCampaigns.push(campaignId);
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
  console.log(`[erase] campaign count=${count} reached=${JSON.stringify(reached)}`);
  return { count, reached };
}

/** A flow's send-email step, as workflow-email-sender posts it, through the triggered batch queue. */
async function flowEmail(contactId: string, email: string): Promise<boolean> {
  const subject = `Flow ${randomUUID().slice(0, 6)}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `erase flow ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail,
    content: { subject, blocks, globalStyles },
  })) as { data: { id: string } };
  createdCampaigns.push(created.data.id);
  const before = await idsOn(batchSenderQueues.triggered);
  const res = await fetch(`${API}/api/v1/internal/workflow/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...INTERNAL },
    body: JSON.stringify({ orgId: seed.id, contactId, campaignId: created.data.id, subject }),
  });
  expect(res.status, await res.text()).toBe(200);
  const jobs = await addedTo<BatchSenderJobData>(batchSenderQueues.triggered, before);
  for (const b of jobs.filter((d) => d.contactIds?.includes(contactId)))
    await processBatchSender(job(b));
  for (const j of await batchSenderQueues.triggered.getJobs(ALL_STATES, 0, 5_000))
    if (j && !before.has(String(j.id))) await j.remove().catch(() => {});
  engine.handed.length = 0;
  await deliver(email);
  const reached = engine.handed.some(
    (m) => m.to.toLowerCase() === email.toLowerCase() && m.subject === subject,
  );
  console.log(`[erase] flow ${email} reached=${reached}`);
  return reached;
}

/** One receipt through `route` to `to`: did it reach the engine. */
async function receipt(route: '/transactional/email' | '/emails', to: string): Promise<boolean> {
  const subject = `Faktura ${randomUUID().slice(0, 6)}`;
  const res = await call('POST', `/api/v1${route}`, {
    from: fromEmail,
    to,
    subject,
    html: '<p>x</p>',
  });
  const answer = `${res.status} ${(await res.text()).slice(0, 100)}`;
  engine.handed.length = 0;
  const mta = await deliver(to);
  const reached = engine.handed.some((m) => m.to === to && m.subject === subject);
  console.log(`[erase] ${route} ${to}: ${answer} mta=${JSON.stringify(mta)} engine=${reached}`);
  return reached;
}

/** What the engine asks on every RCPT TO of an SMTP submission. */
async function smtpAccepts(rcpt: string): Promise<boolean> {
  const r = await fetch(`${API}/api/v1/internal/smtp/rcpt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...INTERNAL },
    body: JSON.stringify({ orgId: seed.id, rcpt }),
  });
  const body = (await r.json()) as { data?: { accept?: boolean } };
  return body.data?.accept === true;
}

/** A key acting with `role`, its own rate-limit bucket. */
async function keyWithRole(role: 'owner' | 'admin'): Promise<string> {
  const key = await seedApiKey(sql, `erase-${role}-${tag}`);
  await sql`
    UPDATE api_keys SET role = ${role}
    WHERE key_hash = ${createHash('sha256').update(key).digest('hex')}
  `;
  return key;
}

describe('an erased person stays suppressed until their own double opt-in', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    owner = await keyWithRole('owner');
    admin = await keyWithRole('admin');
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
  }, 120_000);

  afterAll(async () => {
    for (const a of allAddresses) await deliver(a).catch(() => {});
    const notes = allAddresses.map((a) => `gdpr_anonymized:${hashOf(a)}`);
    await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND notes = ANY(${notes})`;
    await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND lower(email) LIKE ${`%-${tag}@test.local`}`;
    if (createdCampaigns.length) {
      await sql`DELETE FROM email_events WHERE campaign_id = ANY(${createdCampaigns})`;
      await sql`DELETE FROM campaigns WHERE id = ANY(${createdCampaigns})`;
    }
    const doiContacts = await sql<{ id: string }[]>`
      SELECT id FROM contacts WHERE org_id = ${seed.id} AND lower(email) LIKE ${`%-${tag}@test.local`}
    `;
    const ids = [...new Set([...contactIds, ...doiContacts.map((c) => c.id)])];
    if (ids.length) {
      await sql`DELETE FROM consent_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contact_lists WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${ids})`;
    }
    if (formIds.length) {
      await sql`DELETE FROM signup_form_submissions WHERE form_id = ANY(${formIds})`;
      await sql`DELETE FROM signup_forms WHERE id = ANY(${formIds})`;
    }
    if (listIds.length) await sql`DELETE FROM lists WHERE id = ANY(${listIds})`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql.end();
  }, 180_000);

  it('the same address created again gets no campaign, flow, receipt or RCPT, in either case', async () => {
    const listId = await newList('marketing');
    const lower = `erase-lower-${tag}@test.local`;
    const upper = `erase-upper-${tag}@test.local`;
    await erase(lower);
    await erase(upper);
    expect(await erasureRows(lower)).toHaveLength(1);

    const lowerId = await createdAgain(lower);
    const upperId = await createdAgain(upper.toUpperCase());
    // A different person: only the local part differs.
    const similar = `erase-lowerx-${tag}@test.local`;
    const similarId = await contactRow(similar);
    const control = `erase-control-${tag}@test.local`;
    const controlId = await contactRow(control);
    for (const id of [lowerId, upperId, similarId, controlId]) await onList(listId, id);

    const sent = await campaignTo(listId, [lower, upper, similar, control]);
    expect(sent.reached).toEqual([control, similar].sort());
    expect(sent.count, 'the pre-send count is what is sent').toBe(String(sent.reached.length));

    expect(await flowEmail(lowerId, lower)).toBe(false);
    expect(await flowEmail(upperId, upper.toUpperCase())).toBe(false);
    expect(await flowEmail(similarId, similar)).toBe(true);

    // The erasure suppresses with reason 'manual', which stops receipts too (#225).
    for (const to of [lower, upper.toUpperCase()]) {
      expect(await receipt('/transactional/email', to)).toBe(false);
      expect(await receipt('/emails', to)).toBe(false);
      expect(await smtpAccepts(to)).toBe(false);
    }
    expect(await receipt('/transactional/email', similar)).toBe(true);
    expect(await smtpAccepts(control)).toBe(true);
  }, 600_000);

  it('a row written before migration 0035 (hash only in notes) is filled by it and blocks', async () => {
    const listId = await newList('legacy');
    const legacy = `erase-legacy-${tag}@test.local`;
    allAddresses.push(legacy);
    await sql`
      INSERT INTO suppressions (org_id, email, reason, notes)
      VALUES (${seed.id}, NULL, 'manual', ${`gdpr_anonymized:${hashOf(legacy)}`})
    `;
    // The migration as CI applies it, in one transaction.
    const migration = readFileSync(MIGRATION_0035, 'utf8').replaceAll(
      '--> statement-breakpoint',
      '',
    );
    await sql.begin((tx) => tx.unsafe(migration));
    const [filled] = await sql<{ email_hash: string | null }[]>`
      SELECT email_hash FROM suppressions
      WHERE org_id = ${seed.id} AND notes = ${`gdpr_anonymized:${hashOf(legacy)}`}
    `;
    expect(filled!.email_hash).toBe(hashOf(legacy));

    const legacyId = await createdAgain(legacy);
    const control = `erase-lcontrol-${tag}@test.local`;
    const controlId = await contactRow(control);
    for (const id of [legacyId, controlId]) await onList(listId, id);
    const sent = await campaignTo(listId, [legacy, control]);
    expect(sent.reached).toEqual([control]);
    expect(await receipt('/transactional/email', legacy)).toBe(false);
  }, 600_000);

  it('no owner or admin removes the row; a single-step signup does not lift it; the double opt-in does', async () => {
    const address = `erase-doi-${tag}@test.local`;
    await erase(address);
    const [rowId] = await erasureRows(address);
    expect(rowId).toBeTruthy();

    for (const key of [admin, owner]) {
      const res = await call('DELETE', `/api/v1/suppressions/${rowId}`, undefined, key);
      const text = await res.text();
      expect(res.status, text).toBe(409);
      const body = JSON.parse(text) as { code?: string; details?: { reason?: string } };
      expect(body.details?.reason).toBe('gdpr_erasure');
      expect(await erasureRows(address)).toEqual([rowId]);
    }

    // A signup form without double opt-in: a contact, on the list, and still nothing sent.
    const formList = await newList('form');
    const [form] = await sql<{ id: string }[]>`
      INSERT INTO signup_forms (org_id, list_id, name, fields, config, active)
      VALUES (${seed.id}, ${formList}, ${`erase form ${tag}`},
              '[{"name":"email","label":"E-mail","type":"email","required":true}]'::jsonb,
              '{}'::jsonb, true)
      RETURNING id
    `;
    formIds.push(form!.id);
    const submitted = await fetch(`${API}/public/forms/${form!.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: address }),
    });
    expect(submitted.status, await submitted.text()).toBe(200);
    expect(await erasureRows(address), 'a single-step signup lifted the erasure').toEqual([rowId]);
    const control = `erase-dcontrol-${tag}@test.local`;
    await onList(formList, await contactRow(control));
    expect((await campaignTo(formList, [address, control])).reached).toEqual([control]);

    // The person's own double opt-in, confirmed from the link.
    const doiList = await newList('doi', 1);
    const sub = await fetch(`${API}/api/v1/lists/${doiList}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: address }),
    });
    const subBody = (await sub.json()) as { data: { _devToken?: string } };
    expect(sub.status).toBe(202);
    await deliver(address);
    expect(subBody.data._devToken, 'the dev token of the confirmation link').toBeTruthy();
    const confirm = await fetch(`${API}/api/v1/confirm/${subBody.data._devToken}`, {
      redirect: 'manual',
    });
    expect(confirm.status).toBeLessThan(400);

    expect(await erasureRows(address), 'the confirmation did not lift the erasure').toEqual([]);
    const [contact] = await sql<{ id: string; status: string }[]>`
      SELECT id, status FROM contacts
      WHERE org_id = ${seed.id} AND email = ${address} AND deleted_at IS NULL
    `;
    expect(contact!.status).toBe('active');
    const proof = await sql<{ event_type: string; source: string; lifted: boolean }[]>`
      SELECT event_type, source, (proof_payload->>'liftedErasure')::boolean AS lifted
      FROM consent_events WHERE contact_id = ${contact!.id}
    `;
    expect(proof).toEqual([{ event_type: 'double_opt_in', source: 'double_opt_in', lifted: true }]);

    await onList(doiList, await contactRow(`erase-dcontrol2-${tag}@test.local`));
    const after = await campaignTo(doiList, [address, `erase-dcontrol2-${tag}@test.local`]);
    expect(after.reached).toEqual([address, `erase-dcontrol2-${tag}@test.local`].sort());
    expect(await receipt('/transactional/email', address)).toBe(true);
  }, 600_000);
});
