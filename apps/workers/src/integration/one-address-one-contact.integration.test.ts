/**
 * One address, one contact: creating a contact for an address the org already
 * holds never makes a second one, and never mails the person who refused.
 *
 * ─── What was wrong (Z146, measured on master by sending) ────────────────────
 *
 * contacts had no unique index on (org_id, email) and kept the address as it
 * was typed. POST /contacts in capitals for an address held by an unsubscribed
 * (no suppression row) or pending contact answered 201 and made a second,
 * active contact, and so did a CSV import or a single-step form for an address
 * stored in capitals. The campaign then reached the duplicate: the refusal
 * lived only in the original's status.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * An unsubscribed contact without a suppression row and a pending one, then the
 * same addresses in capitals through POST /contacts, a CSV import and a signup
 * form without double opt-in. One row each, the status unchanged, POST
 * /contacts answering 409 CONTACT_EXISTS with the existing id. Then a campaign
 * through the splitter → batch-sender → mta-sender (the gRPC client is the
 * only stub) to a list holding both and a control: only the control is mailed.
 * A new address is still created, in lower case, and mailed.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { type Job, type JobType, type Queue } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
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

const tag = randomUUID().slice(0, 8);
const sendingDomain = `oaoc-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;

let seed: SeedOrg;
let owner: string;
const listIds: string[] = [];
const formIds: string[] = [];
const importJobIds: string[] = [];
const createdCampaigns: string[] = [];
const contactIds: string[] = [];

const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

const job = <T>(data: T): Job<T> =>
  ({
    id: `oaoc-${randomUUID()}`,
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

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      ...authHeaders(owner),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await call(method, path, body);
  const text = await res.text();
  if (!res.ok) throw new Error(`[oaoc] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
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

async function newList(name: string): Promise<string> {
  const [list] = await sql<{ id: string }[]>`
    INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`oaoc ${name} ${tag}`}) RETURNING id
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

/** A contact written straight to the table, in the given state. */
async function contactRow(email: string, status = 'active'): Promise<string> {
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, first_name, status)
    VALUES (${seed.id}, ${email}, 'Petra', ${status}) RETURNING id
  `;
  contactIds.push(c!.id);
  return c!.id;
}

/** Every live contact this org has for the address, in any spelling. */
async function rowsFor(address: string) {
  return sql<{ id: string; email: string; status: string }[]>`
    SELECT id, email, status::text AS status FROM contacts
    WHERE org_id = ${seed.id} AND lower(btrim(email)) = ${address.toLowerCase()}
      AND deleted_at IS NULL
  `;
}

/** A campaign to `listId`, all the way to the engine: who it reached. */
async function campaignTo(listId: string, recipients: string[]) {
  const subject = `Novinky ${randomUUID().slice(0, 6)}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `oaoc ${tag}`,
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
  for (const to of recipients) await deliver(to);
  const reached = engine.handed
    .filter((m) => m.subject === subject)
    .map((m) => m.to.toLowerCase())
    .sort();
  console.log(`[oaoc] campaign reached=${JSON.stringify(reached)}`);
  return { reached };
}

/** The CSV import through the API, run to the end. */
async function importCsv(addresses: string[], listId: string): Promise<void> {
  const boundary = `----oaoc${randomUUID()}`;
  const csv = 'email,first_name\r\n' + addresses.map((a) => `${a},Imp`).join('\r\n') + '\r\n';
  const form =
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="oaoc-${tag}.csv"\r\n` +
    `Content-Type: text/csv\r\n\r\n${csv}\r\n--${boundary}--\r\n`;
  const up = await fetch(`${API}/api/v1/contacts/import/upload`, {
    method: 'POST',
    headers: { ...authHeaders(owner), 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: form,
  });
  const upText = await up.text();
  expect(up.status, upText).toBe(200);
  const jobId = (JSON.parse(upText) as { data: { id: string } }).data.id;
  importJobIds.push(jobId);
  await api('POST', `/api/v1/contacts/import/${jobId}/mapping`, {
    mapping: { email: 'email', first_name: 'first_name' },
    defaultListId: listId,
  });
  await api('POST', `/api/v1/contacts/import/${jobId}/execute`);
  for (let i = 0; i < 300; i++) {
    const [row] = await sql<
      { status: string }[]
    >`SELECT status FROM import_jobs WHERE id = ${jobId}`;
    if (row?.status === 'completed' || row?.status === 'failed') {
      expect(row.status).toBe('completed');
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('[oaoc] the import never finished');
}

/** A key acting as the owner, its own rate-limit bucket. */
async function ownerKey(): Promise<string> {
  const key = await seedApiKey(sql, `oaoc-owner-${tag}`);
  await sql`
    UPDATE api_keys SET role = 'owner'
    WHERE key_hash = ${createHash('sha256').update(key).digest('hex')}
  `;
  return key;
}

describe('one address, one contact', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    owner = await ownerKey();
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
  }, 120_000);

  afterAll(async () => {
    const like = `%-${tag}@test.local`;
    if (createdCampaigns.length) {
      await sql`DELETE FROM email_events WHERE campaign_id = ANY(${createdCampaigns})`;
      await sql`DELETE FROM campaigns WHERE id = ANY(${createdCampaigns})`;
    }
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM contacts WHERE org_id = ${seed.id} AND lower(email) LIKE ${like}
    `;
    const ids = [...new Set([...contactIds, ...rows.map((r) => r.id)])];
    if (ids.length) {
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contact_lists WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${ids})`;
    }
    if (importJobIds.length) await sql`DELETE FROM import_jobs WHERE id = ANY(${importJobIds})`;
    if (formIds.length) {
      await sql`DELETE FROM signup_form_submissions WHERE form_id = ANY(${formIds})`;
      await sql`DELETE FROM signup_forms WHERE id = ANY(${formIds})`;
    }
    if (listIds.length) await sql`DELETE FROM lists WHERE id = ANY(${listIds})`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql.end();
  }, 180_000);

  it('the address in capitals through POST /contacts, an import and a form: one contact, status kept, no mail', async () => {
    const listId = await newList('marketing');
    const unsub = `oaoc-unsub-${tag}@test.local`;
    const pending = `oaoc-pending-${tag}@test.local`;
    const unsubId = await contactRow(unsub, 'unsubscribed');
    const pendingId = await contactRow(pending, 'pending');
    const control = `oaoc-control-${tag}@test.local`;
    const controlId = await contactRow(control);
    for (const id of [unsubId, pendingId, controlId]) await onList(listId, id);

    // POST /contacts: refused, naming the contact that has the address.
    for (const [address, id] of [
      [unsub, unsubId],
      [pending, pendingId],
    ] as const) {
      const res = await call('POST', '/api/v1/contacts', { email: address.toUpperCase() });
      const body = JSON.parse(await res.text()) as { code?: string; details?: { id?: string } };
      expect(res.status, JSON.stringify(body)).toBe(409);
      expect(body.code).toBe('CONTACT_EXISTS');
      expect(body.details?.id).toBe(id);
    }

    // A CSV import into the same list.
    await importCsv([unsub.toUpperCase(), pending.toUpperCase()], listId);

    // A signup form without double opt-in, on the same list.
    const [form] = await sql<{ id: string }[]>`
      INSERT INTO signup_forms (org_id, list_id, name, fields, config, active)
      VALUES (${seed.id}, ${listId}, ${`oaoc form ${tag}`},
              '[{"name":"email","label":"E-mail","type":"email","required":true}]'::jsonb,
              '{}'::jsonb, true)
      RETURNING id
    `;
    formIds.push(form!.id);
    for (const address of [unsub, pending]) {
      const res = await fetch(`${API}/public/forms/${form!.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address.toUpperCase() }),
      });
      expect(res.status, await res.text()).toBe(200);
    }

    expect(await rowsFor(unsub)).toEqual([{ id: unsubId, email: unsub, status: 'unsubscribed' }]);
    expect(await rowsFor(pending)).toEqual([{ id: pendingId, email: pending, status: 'pending' }]);

    const sent = await campaignTo(listId, [unsub, pending, control]);
    expect(sent.reached).toEqual([control]);
  }, 600_000);

  it('a new address is still created, stored in lower case, and mailed', async () => {
    const listId = await newList('new');
    const fresh = `oaoc-Fresh-${tag}@Test.Local`;
    const created = (await api('POST', '/api/v1/contacts', { email: fresh })) as {
      data: { id: string; email: string };
    };
    contactIds.push(created.data.id);
    expect(created.data.email).toBe(fresh.toLowerCase());
    await onList(listId, created.data.id);
    const sent = await campaignTo(listId, [fresh.toLowerCase()]);
    expect(sent.reached).toEqual([fresh.toLowerCase()]);
  }, 600_000);
});
