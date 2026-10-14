/**
 * A bounced contact gets marketing again only after its bounce is released and
 * the contact is then set active — walked to the engine.
 *
 * ─── What was wrong (Z149, measured on master d37c05a by sending) ────────────
 *
 * After a hard bounce (the engine answered 550, mta-sender wrote the
 * hard_bounce row and set the contact bounced), PUT /contacts/:id
 * {status:'active'} answered 200 and wrote 'active' over the standing row. The
 * next campaign counted the contact and the row stopped the mail; the status
 * and the sending disagreed, and the release an owner or admin does with
 * DELETE /suppressions/:id (audited) was not what decided it. Owner's decision
 * (14 Oct 2026): the edit waits for the release.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * For hard_bounce (from a real 550) and invalid_email: PUT active → 409
 * BOUNCE_ACTIVE, the contact stays bounced, and a campaign through the
 * splitter → batch-sender → mta-sender (the gRPC client is the only stub)
 * reaches only the control. The owner's DELETE → 204, the contact still
 * bounced; PUT active → 200, and the next campaign reaches both.
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
const engine = vi.hoisted(() => ({
  handed: [] as { to: string; subject: string }[],
  answer: new Map<string, { code: number; message: string }>(),
}));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string; subject: string }) => {
    engine.handed.push({ to: msg.toEmail, subject: msg.subject });
    const answer = engine.answer.get(msg.toEmail);
    return {
      success: !answer,
      messageId: 'm',
      smtpCode: answer?.code ?? 250,
      smtpMessage: answer?.message ?? 'OK',
      error: answer?.message ?? '',
      durationMs: '1',
      sendingIp: '',
    };
  },
}));

const API = process.env.API_URL!;
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

const tag = randomUUID().slice(0, 8);
const sendingDomain = `bact-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;

let seed: SeedOrg;
let owner: string;
const listIds: string[] = [];
const createdCampaigns: string[] = [];
const contactIds: string[] = [];

const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

const job = <T>(data: T): Job<T> =>
  ({
    id: `bact-${randomUUID()}`,
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

/** Run every queued MTA job for `to` through the real processor, then drop it. */
async function deliver(to: string): Promise<void> {
  const jobs = (
    (await mtaQueues.other.getJobs(ALL_STATES, 0, 5_000)) as Job<MtaSendJobData>[]
  ).filter((j) => j?.data?.toEmail === to);
  for (const j of jobs) {
    const last = { data: j.data, opts: { attempts: 1 }, attemptsMade: 0, log: async () => {} };
    await processAtOrgRate(last as unknown as Job<MtaSendJobData>).catch(() => {});
    await j.remove().catch(() => {});
  }
}

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...authHeaders(owner),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  return { status: res.status, body: await res.text() };
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await call(method, path, body);
  if (res.status >= 300) throw new Error(`[bact] ${method} ${path} → ${res.status}: ${res.body}`);
  return res.body ? JSON.parse(res.body) : null;
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
    INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`bact ${name} ${tag}`}) RETURNING id
  `;
  listIds.push(list!.id);
  return list!.id;
}

/** An active contact on `listId`. */
async function contactOn(listId: string, name: string) {
  const email = `bact-${name}-${tag}@test.local`;
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, first_name, status)
    VALUES (${seed.id}, ${email}, 'Petra', 'active') RETURNING id
  `;
  contactIds.push(c!.id);
  await sql`
    INSERT INTO contact_lists (contact_id, list_id, confirmed_at) VALUES (${c!.id}, ${listId}, now())
  `;
  return { id: c!.id, email };
}

async function statusOf(id: string): Promise<string> {
  const [row] = await sql<{ status: string }[]>`
    SELECT status::text AS status FROM contacts WHERE id = ${id}
  `;
  return row!.status;
}

async function rowId(email: string, reason: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM suppressions WHERE org_id = ${seed.id} AND email = ${email} AND reason = ${reason}
  `;
  expect(row, `no ${reason} row for ${email}`).toBeTruthy();
  return row!.id;
}

/** A campaign to `listId`, all the way to the engine: who it reached. */
async function campaignTo(listId: string, recipients: string[]): Promise<string[]> {
  const subject = `Novinky ${randomUUID().slice(0, 6)}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `bact ${tag}`,
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
    .map((m) => m.to)
    .sort();
  console.log(`[bact] campaign reached=${JSON.stringify(reached)}`);
  return reached;
}

/** A key acting as the owner, its own rate-limit bucket. */
async function ownerKey(): Promise<string> {
  const key = await seedApiKey(sql, `bact-owner-${tag}`);
  await sql`
    UPDATE api_keys SET role = 'owner'
    WHERE key_hash = ${createHash('sha256').update(key).digest('hex')}
  `;
  return key;
}

describe('a bounced contact comes back after the release, not before', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    owner = await ownerKey();
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
  }, 120_000);

  afterAll(async () => {
    if (createdCampaigns.length) {
      await sql`DELETE FROM email_events WHERE campaign_id = ANY(${createdCampaigns})`;
      await sql`DELETE FROM campaigns WHERE id = ANY(${createdCampaigns})`;
    }
    if (contactIds.length) {
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM contact_lists WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${contactIds})`;
    }
    await sql`DELETE FROM audit_logs WHERE org_id = ${seed.id} AND resource = 'suppression' AND changes->>'email' LIKE ${`%-${tag}@test.local`}`;
    await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND email LIKE ${`%-${tag}@test.local`}`;
    if (listIds.length) await sql`DELETE FROM lists WHERE id = ANY(${listIds})`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql.end();
  }, 180_000);

  for (const reason of ['hard_bounce', 'invalid_email'] as const) {
    it(`${reason}: PUT active is 409 and the campaign skips them; after the owner's DELETE and PUT it reaches them`, async () => {
      const listId = await newList(reason);
      const person = await contactOn(listId, reason);
      const control = await contactOn(listId, `${reason}-ctl`);

      if (reason === 'hard_bounce') {
        // The product's own way to a bounce: the mailbox answers 550 5.1.1.
        engine.answer.set(person.email, { code: 550, message: '5.1.1 user unknown' });
        await campaignTo(listId, [person.email, control.email]);
        engine.answer.delete(person.email);
      } else {
        const add = await call('POST', '/api/v1/suppressions', {
          email: person.email,
          reason: 'invalid_email',
        });
        expect(add.status, add.body).toBe(201);
        await api('PUT', `/api/v1/contacts/${person.id}`, { status: 'bounced' });
      }
      expect(await statusOf(person.id)).toBe('bounced');
      const id = await rowId(person.email, reason);

      const refused = await call('PUT', `/api/v1/contacts/${person.id}`, { status: 'active' });
      expect(refused.status, refused.body).toBe(409);
      expect(JSON.parse(refused.body).code).toBe('BOUNCE_ACTIVE');
      expect(await statusOf(person.id)).toBe('bounced');
      expect(await campaignTo(listId, [person.email, control.email])).toEqual([control.email]);

      const del = await call('DELETE', `/api/v1/suppressions/${id}`);
      expect(del.status, del.body).toBe(204);
      expect(await statusOf(person.id), 'the release itself moves nothing').toBe('bounced');

      const put = await call('PUT', `/api/v1/contacts/${person.id}`, { status: 'active' });
      expect(put.status, put.body).toBe(200);
      expect(await statusOf(person.id)).toBe('active');
      expect(await campaignTo(listId, [person.email, control.email])).toEqual(
        [person.email, control.email].sort(),
      );
    }, 600_000);
  }
});
