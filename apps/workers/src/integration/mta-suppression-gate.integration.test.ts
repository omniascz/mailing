/**
 * A suppressed address is not mailed, whichever path the message came by.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * The suppression list was consulted in two places: batch-sender, for
 * campaign and flow mail, and the /transactional/email route. Everything else
 * that reaches the MTA — /emails (Resend-compatible), /messaging/send and a
 * campaign's test send — went through sendTransactionalEmail straight onto
 * the MTA queue, and mta-sender only ever WROTE suppressions. A hard-bounced
 * address was mailed again through any of those three.
 *
 * batch-sender's own check also runs before the batch is rendered, not when
 * the message leaves: a bounce recorded while a message waits in the queue
 * (throttle, warmup night, retry) did not stop it.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * Real routes on the real API, real queue, real mta-sender processor. The only
 * stub is the gRPC client, which is where the message would leave; it records
 * every recipient it is handed.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * "Not sent" is also what a broken route produces. So each case first asserts
 * that the route DID put a job for the suppressed address on the MTA queue, and
 * the same run sends to a clean address through the same path, which must
 * reach the engine.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The Go engine and SMTP. The gate sits before the gRPC call.
 * - The per-ISP queues other than mta-other: the test addresses route there,
 *   and the processor is the same function on every queue.
 * - The 24-hour retention of failed jobs; blocked jobs complete, they do not fail.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Job, JobType, Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { loginAsSeedUser } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processMtaSend } from '../jobs/mta-sender.js';
import { processBatchSender } from '../jobs/batch-sender.js';
import { processCampaignSplitter } from '../jobs/campaign-splitter.js';
import {
  batchSenderQueue,
  batchSenderQueues,
  campaignSplitterQueue,
  mtaQueues,
  type BatchSenderJobData,
  type CampaignSplitterJobData,
  type MtaSendJobData,
} from '../queues/index.js';

// Hoisted with the mock: the factory runs while the imports above load.
const sent = vi.hoisted(() => [] as string[]);
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string }) => {
    sent.push(msg.toEmail);
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
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET!;
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

const tag = randomUUID().slice(0, 8);
const sendingDomain = `mtagate-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const addr = (name: string) => `mtagate-${name}-${tag}@test.local`;

let seed: SeedOrg;
let token: string;
let listId: string;
let templateId: string;
let testCampaignId: string;
const createdCampaigns: string[] = [];
const contactIds: string[] = [];
const allAddresses: string[] = [];

const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

const job = <T>(data: T): Job<T> =>
  ({
    id: `mtagate-${randomUUID()}`,
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

/** The waiting MTA jobs addressed to `to`. */
async function mtaJobsFor(to: string): Promise<Job<MtaSendJobData>[]> {
  const jobs = (await mtaQueues.other.getJobs(ALL_STATES, 0, 5_000)) as Job<MtaSendJobData>[];
  return jobs.filter((j) => j?.data?.toEmail === to);
}

/**
 * Run every queued MTA job for `to` through the real processor, then take it
 * off the queue. Returns what the processor returned, one entry per job.
 */
async function deliver(to: string): Promise<{ status: string; messageId: string }[]> {
  const jobs = await mtaJobsFor(to);
  const out: { status: string; messageId: string }[] = [];
  for (const j of jobs) {
    out.push((await processMtaSend(j)) as { status: string; messageId: string });
    await j.remove().catch(() => {});
  }
  return out;
}

async function suppress(email: string, reason: string): Promise<void> {
  await sql`INSERT INTO suppressions (org_id, email, reason) VALUES (${seed.id}, ${email}, ${reason})`;
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`[mtagate] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** The three paths that had no suppression check before the MTA. */
const SEND: Record<string, (to: string) => Promise<unknown>> = {
  '/emails': (to) =>
    api('POST', '/api/v1/emails', { from: fromEmail, to, subject: 'Faktura', html: '<p>x</p>' }),
  '/messaging/send': (to) =>
    api('POST', '/api/v1/messaging/send', {
      channel: 'email',
      payload: { to, from: fromEmail, subject: 'Faktura', html: '<p>x</p>' },
    }),
  '/campaigns/:id/test': (to) => api('POST', `/api/v1/campaigns/${testCampaignId}/test`, { to }),
};

const blocks = [
  {
    id: 'g1',
    type: 'text',
    content: '<p>Dobrý den.</p>',
    fontSize: '15px',
    fontFamily: 'Arial',
    color: '#111827',
    lineHeight: '1.5',
    textAlign: 'left',
  },
  {
    id: 'g2',
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

async function contact(name: string): Promise<{ id: string; email: string }> {
  const email = addr(name);
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, first_name, status)
    VALUES (${seed.id}, ${email}, 'Petra', 'active') RETURNING id
  `;
  contactIds.push(c!.id);
  return { id: c!.id, email };
}

describe('mta-sender refuses suppressed addresses on every path (real DB + Redis + API)', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await loginAsSeedUser(API, 'mtagate');
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
    const [list] = await sql<{ id: string }[]>`
      INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`mtagate ${tag}`}) RETURNING id
    `;
    listId = list!.id;
    const [tpl] = await sql<{ id: string }[]>`
      INSERT INTO templates (org_id, name, subject, preheader, blocks, global_styles, locale)
      VALUES (${seed.id}, ${`mtagate ${tag}`}, 'Novinky', '', ${sql.json(blocks)},
              ${sql.json(globalStyles)}, 'cs')
      RETURNING id
    `;
    templateId = tpl!.id;
    const created = (await api('POST', '/api/v1/campaigns', {
      name: `mtagate test ${tag}`,
      subject: 'Akce',
      fromName: 'Obchod',
      fromEmail,
      listId,
      content: { subject: 'Akce', blocks, globalStyles },
    })) as { data: { id: string } };
    testCampaignId = created.data.id;
    createdCampaigns.push(testCampaignId);
    warn = vi.spyOn(console, 'warn');
  }, 120_000);

  afterAll(async () => {
    for (const a of allAddresses)
      for (const j of await mtaJobsFor(a)) await j.remove().catch(() => {});
    if (allAddresses.length)
      await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND email = ANY(${allAddresses})`;
    if (contactIds.length) {
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM contact_lists WHERE contact_id = ANY(${contactIds})`;
    }
    if (createdCampaigns.length) {
      await sql`DELETE FROM email_events WHERE campaign_id = ANY(${createdCampaigns})`;
      await sql`DELETE FROM campaigns WHERE id = ANY(${createdCampaigns})`;
    }
    if (contactIds.length) await sql`DELETE FROM contacts WHERE id = ANY(${contactIds})`;
    if (listId) await sql`DELETE FROM lists WHERE id = ${listId}`;
    if (templateId) await sql`DELETE FROM templates WHERE id = ${templateId}`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql.end();
  }, 120_000);

  for (const [path, send] of Object.entries(SEND)) {
    it(`${path}: a hard-bounced address is not mailed, a clean one is`, async () => {
      const key = path.replace(/[^a-z]/g, '');
      const blocked = addr(`bounced-${key}`);
      const clean = addr(`clean-${key}`);
      allAddresses.push(blocked, clean);
      await suppress(blocked, 'hard_bounce');

      await send(blocked);
      await send(clean);
      // The route must have handed both to the MTA — otherwise "not sent"
      // below would be true for a route that sends nothing at all.
      expect(
        await mtaJobsFor(blocked),
        'route queued nothing for the suppressed address',
      ).toHaveLength(1);
      expect(await mtaJobsFor(clean), 'route queued nothing for the clean address').toHaveLength(1);

      sent.length = 0;
      const blockedResult = await deliver(blocked);
      const cleanResult = await deliver(clean);

      expect(sent, 'the clean address must reach the engine').toContain(clean);
      expect(cleanResult[0]!.status).toBe('sent');
      expect(sent, 'the suppressed address reached the engine').not.toContain(blocked);
      expect(blockedResult[0]!.status).toBe('suppressed');
      // Findable: the transactional placeholder ids cannot hold an event row,
      // so the log line is the record for these three paths.
      expect(
        warn.mock.calls.some((c) =>
          String(c[0]).includes(`[mta-sender][suppressed] message=${blockedResult[0]!.messageId}`),
        ),
        'the block was not logged',
      ).toBe(true);
    });
  }

  it('/emails: an address that only unsubscribed from marketing still gets transactional mail', async () => {
    const unsubscribed = addr('unsub-emails');
    const bounced = addr('bounced2-emails');
    allAddresses.push(unsubscribed, bounced);
    await suppress(unsubscribed, 'unsubscribe');
    await suppress(bounced, 'complaint');
    await SEND['/emails']!(unsubscribed);
    await SEND['/emails']!(bounced);
    expect(await mtaJobsFor(unsubscribed)).toHaveLength(1);
    expect(await mtaJobsFor(bounced)).toHaveLength(1);

    sent.length = 0;
    await deliver(unsubscribed);
    await deliver(bounced);
    expect(sent).toContain(unsubscribed);
    expect(sent).not.toContain(bounced);
  });

  it('/transactional/email is unchanged: its own route check refuses, a clean address is mailed', async () => {
    const blocked = addr('bounced-txn');
    const clean = addr('clean-txn');
    allAddresses.push(blocked, clean);
    await suppress(blocked, 'hard_bounce');
    const body = (to: string) => ({ to, from: fromEmail, subject: 'Faktura', html: '<p>x</p>' });
    const refused = (await api('POST', '/api/v1/transactional/email', body(blocked))) as {
      data: { status: string };
    };
    await api('POST', '/api/v1/transactional/email', body(clean));
    expect(refused.data.status).toBe('rejected');
    expect(await mtaJobsFor(blocked)).toHaveLength(0);
    expect(await mtaJobsFor(clean)).toHaveLength(1);

    sent.length = 0;
    await deliver(clean);
    expect(sent).toContain(clean);
  });

  it('campaign: a bounce recorded after the batch was built stops that message, and is recorded', async () => {
    const a = await contact('camp-a');
    const b = await contact('camp-b');
    allAddresses.push(a.email, b.email);
    await sql`INSERT INTO contact_lists (contact_id, list_id) VALUES (${a.id}, ${listId}), (${b.id}, ${listId})`;
    const created = (await api('POST', '/api/v1/campaigns', {
      name: `mtagate ${tag}`,
      subject: 'Akce tohoto týdne',
      fromName: 'Obchod',
      fromEmail,
      listId,
      content: { subject: 'Akce tohoto týdne', blocks, globalStyles },
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
    const [batch] = (await addedTo<BatchSenderJobData>(batchSenderQueue, beforeBatch)).filter(
      (d) => d.campaignId === campaignId,
    );
    expect(batch, 'no batch job').toBeTruthy();
    await processBatchSender(job(batch!));
    expect(await mtaJobsFor(a.email), 'batch-sender queued nothing for A').toHaveLength(1);
    expect(await mtaJobsFor(b.email), 'batch-sender queued nothing for B').toHaveLength(1);

    // B bounces somewhere else while its message waits in the queue.
    await suppress(b.email, 'hard_bounce');

    sent.length = 0;
    await deliver(a.email);
    const [blocked] = await deliver(b.email);
    expect(sent).toContain(a.email);
    expect(sent).not.toContain(b.email);
    expect(blocked!.status).toBe('suppressed');

    const events = await sql<{ event_type: string; metadata: { reason?: string } }[]>`
      SELECT event_type, metadata FROM email_events
      WHERE campaign_id = ${campaignId} AND contact_id = ${b.id}
    `;
    expect(events.map((e) => [e.event_type, e.metadata.reason])).toEqual([
      ['failed', 'suppressed'],
    ]);
  });

  it('flow: a clean contact is mailed; one suppressed while queued is not — unsubscribe counts here', async () => {
    const c = await contact('flow-clean');
    const d = await contact('flow-unsub');
    allAddresses.push(c.email, d.email);
    for (const who of [c, d]) {
      const before = await idsOn(batchSenderQueues.triggered);
      const res = await fetch(`${API}/api/v1/internal/workflow/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
        body: JSON.stringify({ orgId: seed.id, contactId: who.id, templateId, mergeData: {} }),
        signal: AbortSignal.timeout(20_000),
      });
      expect(((await res.json()) as { data?: { queued?: boolean } }).data?.queued).toBe(true);
      const [batch] = (
        await addedTo<BatchSenderJobData>(batchSenderQueues.triggered, before)
      ).filter((x) => x.contactIds?.includes(who.id));
      expect(batch, 'no batch job').toBeTruthy();
      await processBatchSender(job(batch!));
      expect(await mtaJobsFor(who.email), 'batch-sender queued nothing').toHaveLength(1);
    }

    // A marketing opt-out stops triggered mail, unlike transactional.
    await suppress(d.email, 'unsubscribe');

    sent.length = 0;
    await deliver(c.email);
    const [blocked] = await deliver(d.email);
    expect(sent).toContain(c.email);
    expect(sent).not.toContain(d.email);
    expect(blocked!.status).toBe('suppressed');
  });
});
